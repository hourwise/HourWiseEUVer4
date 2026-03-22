import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Vibration, Platform, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import i18n from '../lib/i18n';
import { workSessionService } from '../services/workSessionService';
import { calculateCompliance } from '../lib/compliance';
import { supabase } from '../lib/supabase';

type TimerMode = '6h' | '9h';
export type WorkStatus = 'idle' | 'working' | 'poa' | 'break';

const BASE_STORAGE_KEY = 'timerState_v10';
const LOCATION_TASK_NAME = 'background-location-task';
const BG_SPEED_KEY = 'bg_last_speed_v1';

// --- Motion thresholds ---
const DRIVING_SPEED_THRESHOLD_KMH = 10;
const STILL_SPEED_THRESHOLD_KMH = 4;
const STATIONARY_CONFIRM_MS = 4000;
const GPS_STALE_THRESHOLD_MS = 10000;
const MOTION_MAGNITUDE_THRESHOLD = 0.12;
const ACCEL_SCORE_MAX = 8;
const ACCEL_DRIVE_THRESHOLD = 4;
const ACCEL_STOP_THRESHOLD = 1;

// --- Timer limits ---
const MAX_WORK_6H = 6 * 3600;
const MAX_WORK_9H = 9 * 3600;
const MAX_DRIVE = 4.5 * 3600;
const MAX_WEEKLY_DRIVE = 56 * 3600;
const SPREADOVER_13H = 13 * 3600;

const TACHO_15_MIN = 15 * 60;
const TACHO_30_MIN = 30 * 60;
const TACHO_45_MIN = 45 * 60;

const APP_BUNDLE_ID = 'com.PCGsoft.hourwise.eu';

type Totals = { work: number; poa: number; break: number; driving: number };
type BreakTracker = { has15min: boolean; lastTachoBreakSegment: number };

type PersistedState = {
  status: WorkStatus;
  sessionId: string | null;
  timerMode: TimerMode;
  workStartTime: string | null;
  currentSegmentStart: string | null;
  totals: Totals;
  workCycleTotal: number;
  breakTracker: BreakTracker;
  isDriving: boolean;
  lastTickMs: number;
  weeklyDrivingAccumulator: number;
};

const getTachographBreakSeconds = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return (Math.floor(minutes / 15) * 15) * 60;
};

const ALERT_TEXT = {
  audioWork5h15: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime15minLeft' },
  audioWork5h30: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime30minLeft' },
  audioWork5h55: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime5minLeft' },
  audioWorkLimitReached: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTimeLimitReached' },
  audioDriving30minLeft: { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime30minLeft' },
  audioDriving15minLeft: { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime15minLeft' },
  audioDriving5minLeft: { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime5minLeft' },
  audioDrivingLimitReached: { titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTimeLimitReached' },
  audioWeeklyDrivingLimitSoon: { titleKey: 'alerts.weeklyDriveTitle', bodyKey: 'alerts.weeklyDrive1h' },
  audioWeeklyDrivingLimitReached: { titleKey: 'alerts.weeklyDriveTitle', bodyKey: 'alerts.weeklyDriveLimit' },
  audioShiftStarted: { titleKey: '', bodyKey: '' },
  audioShiftEnded: { titleKey: '', bodyKey: '' },
  warningLowRest: { titleKey: 'common.error', bodyKey: 'alerts.lowRestWarning' },
  shift13hLimitSoon: { titleKey: 'alerts.spreadTitle', bodyKey: 'alerts.spread30m' },
} as const;

type AlertKey = keyof typeof ALERT_TEXT;

const notificationSetupDone = { current: false };

async function ensureNotificationSetup() {
  if (notificationSetupDone.current) return;
  notificationSetupDone.current = true;
  await Notifications.setNotificationCategoryAsync('alarm', [], {
    intentIdentifiers: [],
    previewPlaceholder: 'Compliance Alert',
  });
}

const batteryPromptShown = { current: false };

async function promptBatteryOptimisationIfNeeded() {
  if (Platform.OS !== 'android' || batteryPromptShown.current) return;
  batteryPromptShown.current = true;
  Alert.alert(
    'Keep Alerts Reliable',
    "To receive driving and work-time alerts when your screen is off, please set HourWise to 'Unrestricted' battery usage.",
    [
      { text: 'Not Now', style: 'cancel' },
      {
        text: 'Open Settings',
        onPress: async () => {
          try {
            await IntentLauncher.startActivityAsync(
              IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
              { data: `package:${APP_BUNDLE_ID}` }
            );
          } catch {
            try {
              await IntentLauncher.startActivityAsync(
                IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS
              );
            } catch {}
          }
        },
      },
    ]
  );
}

export const useWorkTimer = (userId: string | undefined, timezone: string) => {
  const userStorageKey = userId ? `${BASE_STORAGE_KEY}_${userId}` : null;

  const [status, setStatus] = useState<WorkStatus>('idle');
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [sessionData, setSessionData] = useState<any>(null);
  const [timerMode, setTimerMode] = useState<TimerMode>('6h');
  const [workStartTime, setWorkStartTime] = useState<string | null>(null);
  const [currentSegmentStart, setCurrentSegmentStart] = useState<string | null>(null);
  const [isDriving, setIsDriving] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [display, setDisplay] = useState({
    work: 0, poa: 0, break: 0, driving: 0, shift: 0,
    workTimeRemaining: MAX_WORK_6H,
    drivingTimeRemaining: MAX_DRIVE,
    spreadoverRemaining: SPREADOVER_13H,
    breakDuration: 0,
    poaDuration: 0,
    weeklyDrivingRemaining: MAX_WEEKLY_DRIVE,
  });
  const [shiftSummaryData, setShiftSummaryData] = useState<any>(null);

  const statusRef = useRef<WorkStatus>('idle');
  const sessionIdRef = useRef<string | null>(null);
  const timerModeRef = useRef<TimerMode>('6h');
  const workStartRef = useRef<string | null>(null);
  const segmentStartRef = useRef<string | null>(null);
  const totalsRef = useRef<Totals>({ work: 0, poa: 0, break: 0, driving: 0 });
  const workCycleRef = useRef<number>(0);
  const breakTrackerRef = useRef<BreakTracker>({ has15min: false, lastTachoBreakSegment: 0 });
  const weeklyDrivingAccumulatorRef = useRef<number>(0);
  const lastTickMsRef = useRef<number>(Date.now());
  const isDrivingRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);

  const scheduledComplianceIdsRef = useRef<string[]>([]);
  const ukVoiceIdentifierRef = useRef<string | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<any>(null);

  const lastSpeedKmhRef = useRef<number>(0);
  const lastSpeedTsRef = useRef<number>(0);
  const drivingScoreRef = useRef<number>(0);
  const stationarySinceRef = useRef<number>(0);

  const prevRemainingRef = useRef({ work: MAX_WORK_6H, drive: MAX_DRIVE, weeklyDrive: MAX_WEEKLY_DRIVE });

  useEffect(() => {
    ensureNotificationSetup();
  }, []);

  const syncStateFromRefs = useCallback(() => {
    setStatus(statusRef.current);
    setSessionId(sessionIdRef.current);
    setTimerMode(timerModeRef.current);
    setWorkStartTime(workStartRef.current);
    setCurrentSegmentStart(segmentStartRef.current);
    setIsDriving(isDrivingRef.current);
  }, []);

  useEffect(() => {
    const findUKVoice = async () => {
      try {
        const voices = await Speech.getAvailableVoicesAsync();
        const ukVoice = voices.find(v => v.language === 'en-GB' || v.language === 'en_GB');
        if (ukVoice) ukVoiceIdentifierRef.current = ukVoice.identifier;
      } catch (e) {
        console.error('Failed to get voices:', e);
      }
    };
    findUKVoice();
  }, []);

  const vibrateAlert = useCallback(() => {
    Vibration.vibrate([0, 200, 100, 200]);
  }, []);

  const speakAlert = useCallback((key: string) => {
    const lang = i18n.language || 'en';
    const options: Speech.SpeechOptions = { language: lang.startsWith('en') ? 'en-GB' : lang };
    if (lang.startsWith('en') && ukVoiceIdentifierRef.current) {
      options.voice = ukVoiceIdentifierRef.current;
    }
    try { Speech.speak(i18n.t(key), options); } catch (e) { console.error('Speech failed:', e); }
  }, []);

  const triggerImmediateAlert = useCallback(async (alertKey: AlertKey) => {
    const cfg = ALERT_TEXT[alertKey];
    speakAlert(alertKey);
    vibrateAlert();
    if (!cfg.titleKey || !cfg.bodyKey) return;

    let channel = 'compliance-alerts-v6';
    if (alertKey.includes('Reached') || alertKey.includes('5h55') || alertKey.includes('5min')) channel = 'channel-critical-v6';
    else if (alertKey.includes('5h30') || alertKey.includes('15min')) channel = 'channel-15min-v6';
    else if (alertKey.includes('5h15') || alertKey.includes('30min')) channel = 'channel-30min-v6';

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t(cfg.titleKey),
          body: i18n.t(cfg.bodyKey),
          priority: 'max',
          categoryIdentifier: 'alarm',
          channelId: channel,
        },
        trigger: null,
      });
    } catch (e) { console.error('Immediate notification failed:', e); }
  }, [speakAlert, vibrateAlert]);

  const applyElapsed = useCallback((elapsedSec: number, lastStatus: WorkStatus, lastDriving: boolean) => {
    if (elapsedSec <= 0 || lastStatus === 'idle') return;
    const t = { ...totalsRef.current };
    let cycle = workCycleRef.current;
    if (lastStatus === 'break') t.break += elapsedSec;
    else if (lastStatus === 'poa') t.poa += elapsedSec;
    else if (lastStatus === 'working') {
      if (lastDriving) t.driving += elapsedSec; else t.work += elapsedSec;
      cycle += elapsedSec;
    }
    totalsRef.current = t;
    workCycleRef.current = cycle;
  }, []);

  const refreshSession = useCallback(async () => {
    if (!userId || isStartingRef.current) return;
    try {
      const { data } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('user_id', userId)
        .is('end_time', null)
        .single();

      if (data) {
        setSessionData(data);
        sessionIdRef.current = data.id;
        statusRef.current = data.status as WorkStatus;
        workStartRef.current = data.start_time;

        // FIX: DB totals are the authoritative source — always overwrite
        totalsRef.current = {
          work:    (data.total_work_minutes || 0) * 60,
          poa:     (data.total_poa_minutes || 0) * 60,
          break:   (data.total_break_minutes || 0) * 60,
          driving: (data.other_data?.driving || 0) * 60,
        };

        // workCycle must also be recalculated from DB totals
        workCycleRef.current =
          (data.total_work_minutes || 0) * 60 +
          (data.other_data?.driving || 0) * 60;

        // Segment start — use the most recent activity start from DB
        if (data.status === 'break') {
          segmentStartRef.current = data.current_break_start || data.start_time;
        } else if (data.status === 'poa') {
          segmentStartRef.current = data.current_poa_start || data.start_time;
        } else {
          segmentStartRef.current = data.current_segment_start || data.start_time;
        }

        // Apply elapsed since last DB save to catch up
        const segStartMs = new Date(segmentStartRef.current).getTime();
        const nowMs = Date.now();
        const catchUpSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
        if (catchUpSec > 0 && catchUpSec < 86400) { // sanity check — ignore if > 24h
          applyElapsed(catchUpSec, statusRef.current, isDrivingRef.current);
          segmentStartRef.current = new Date(nowMs).toISOString();
        }

        // Fetch weekly driving to sync mid-shift if needed
        const weeklyDrivingMins = await workSessionService.fetchWeeklyDrivingMinutes(userId);
        weeklyDrivingAccumulatorRef.current = weeklyDrivingMins * 60;

        syncStateFromRefs();
      }
    } catch (e) {
      console.warn('refreshSession failed:', e);
    }
  }, [userId, syncStateFromRefs, applyElapsed]);

  const commitAndFlipDriving = useCallback((nextDriving: boolean, onFlipped?: () => void) => {
    if (nextDriving === isDrivingRef.current) return;
    if (statusRef.current === 'working' && segmentStartRef.current) {
      const nowMs = Date.now();
      const segStartMs = new Date(segmentStartRef.current).getTime();
      const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
      if (elapsedSec > 0) {
        applyElapsed(elapsedSec, 'working', isDrivingRef.current);
        segmentStartRef.current = new Date(nowMs).toISOString();
      }
    }
    isDrivingRef.current = nextDriving;
    setIsDriving(nextDriving);
    onFlipped?.();
  }, [applyElapsed]);

  const cancelScheduledComplianceNotifications = useCallback(async (isEndingShift = false) => {
    const ids = scheduledComplianceIdsRef.current;
    scheduledComplianceIdsRef.current = [];
    await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
    if (isEndingShift) await Notifications.cancelAllScheduledNotificationsAsync();
  }, []);

  const buildComplianceSchedule = useCallback(async () => {
    await cancelScheduledComplianceNotifications();
    const st = statusRef.current;
    if (st !== 'working' && st !== 'poa') return;

    let inFlightWork = 0;
    let inFlightDriving = 0;
    if (st === 'working' && segmentStartRef.current) {
      const nowMs = Date.now();
      const segStartMs = new Date(segmentStartRef.current).getTime();
      const inFlightSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
      if (isDrivingRef.current) inFlightDriving = inFlightSec; else inFlightWork = inFlightSec;
    }

    const currentWork = workCycleRef.current + inFlightWork;
    const currentDriving = totalsRef.current.driving + inFlightDriving;
    const currentWeeklyDriving = weeklyDrivingAccumulatorRef.current + totalsRef.current.driving + inFlightDriving;

    const maxWork = timerModeRef.current === '6h' ? MAX_WORK_6H : MAX_WORK_9H;
    const remainingWork = maxWork - currentWork;
    const remainingDrive = MAX_DRIVE - currentDriving;
    const remainingWeeklyDrive = MAX_WEEKLY_DRIVE - currentWeeklyDriving;

    const scheduleAtThreshold = async (remaining: number, threshold: number, titleKey: string, bodyKey: string, channelId: string) => {
      const inSeconds = remaining - threshold;
      if (inSeconds <= 0) return;
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: { title: i18n.t(titleKey), body: i18n.t(bodyKey), priority: 'max', categoryIdentifier: 'alarm', channelId },
          trigger: { seconds: Math.floor(inSeconds) },
        });
        scheduledComplianceIdsRef.current.push(id);
      } catch (e) { console.warn('Failed to schedule notification:', e); }
    };

    await scheduleAtThreshold(remainingWork, 45 * 60, 'workTimeWarningTitle', 'workTime15minLeft', 'channel-30min-v6');
    await scheduleAtThreshold(remainingWork, 30 * 60, 'workTimeWarningTitle', 'workTime30minLeft', 'channel-15min-v6');
    await scheduleAtThreshold(remainingWork, 5 * 60, 'workTimeWarningTitle', 'workTime5minLeft', 'channel-critical-v6');
    await scheduleAtThreshold(remainingWork, 0, 'workTimeWarningTitle', 'workTimeLimitReached', 'channel-critical-v6');

    if (currentDriving > 0 || currentWeeklyDriving > 0) {
      await scheduleAtThreshold(remainingDrive, 30 * 60, 'drivingTimeWarningTitle', 'drivingTime30minLeft', 'channel-30min-v6');
      await scheduleAtThreshold(remainingDrive, 15 * 60, 'drivingTimeWarningTitle', 'drivingTime15minLeft', 'channel-15min-v6');
      await scheduleAtThreshold(remainingDrive, 5 * 60, 'drivingTimeWarningTitle', 'drivingTime5minLeft', 'channel-critical-v6');
      await scheduleAtThreshold(remainingDrive, 0, 'drivingTimeWarningTitle', 'drivingTimeLimitReached', 'channel-critical-v6');

      // Weekly driving alerts
      await scheduleAtThreshold(remainingWeeklyDrive, 3600, 'alerts.weeklyDriveTitle', 'alerts.weeklyDrive1h', 'channel-15min-v6');
      await scheduleAtThreshold(remainingWeeklyDrive, 0, 'alerts.weeklyDriveTitle', 'alerts.weeklyDriveLimit', 'channel-critical-v6');
    }
  }, [cancelScheduledComplianceNotifications, timerModeRef]);

  const persistFromRefs = useCallback(async () => {
    if (!userStorageKey) return;
    const nowMs = Date.now();
    if (statusRef.current !== 'idle' && segmentStartRef.current) {
      const segStartMs = new Date(segmentStartRef.current).getTime();
      const elapsedSinceSegment = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
      if (elapsedSinceSegment > 0) {
        applyElapsed(elapsedSinceSegment, statusRef.current, isDrivingRef.current);
        segmentStartRef.current = new Date(nowMs).toISOString();
      }
    }
    lastTickMsRef.current = nowMs;
    const state: PersistedState = {
      status: statusRef.current,
      sessionId: sessionIdRef.current,
      timerMode: timerModeRef.current,
      workStartTime: workStartRef.current,
      currentSegmentStart: segmentStartRef.current,
      totals: totalsRef.current,
      workCycleTotal: workCycleRef.current,
      breakTracker: breakTrackerRef.current,
      isDriving: isDrivingRef.current,
      lastTickMs: nowMs,
      weeklyDrivingAccumulator: weeklyDrivingAccumulatorRef.current,
    };
    if (state.status !== 'idle') await AsyncStorage.setItem(userStorageKey, JSON.stringify(state));
    else await AsyncStorage.removeItem(userStorageKey);
  }, [applyElapsed, userStorageKey]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') return;
      if (statusRef.current !== 'working') return;
      try {
        const raw = await AsyncStorage.getItem(BG_SPEED_KEY);
        if (!raw) return;
        const { speedKmh, ts } = JSON.parse(raw);
        if (Date.now() - ts > 30000) return;
        const wasMoving = speedKmh >= DRIVING_SPEED_THRESHOLD_KMH;
        const wasStopped = speedKmh <= STILL_SPEED_THRESHOLD_KMH;
        if (wasMoving && !isDrivingRef.current) commitAndFlipDriving(true, buildComplianceSchedule);
        else if (wasStopped && isDrivingRef.current) commitAndFlipDriving(false, buildComplianceSchedule);
      } catch (e) { console.warn('BG speed reconciliation failed:', e); }
    });
    return () => sub.remove();
  }, [commitAndFlipDriving, buildComplianceSchedule]);

  const stopTracking = useCallback(async () => {
    locationSubRef.current?.remove();
    accelSubRef.current?.remove();
    locationSubRef.current = null;
    accelSubRef.current = null;
    if (isDrivingRef.current) commitAndFlipDriving(false);
    try { if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME); } catch {}
  }, [commitAndFlipDriving]);

  const startTracking = useCallback(async () => {
    try {
      const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();
      if (foreStatus !== 'granted') return;
      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
      locationSubRef.current = await Location.watchPositionAsync({ accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 3, timeInterval: 1500 }, (loc) => {
        const accuracy = loc.coords.accuracy ?? 9999;
        if (accuracy > 50) return;
        const speedKmh = Math.max(0, (loc.coords.speed ?? 0) * 3.6);
        const now = Date.now();
        lastSpeedKmhRef.current = speedKmh;
        lastSpeedTsRef.current = now;
        if (speedKmh <= STILL_SPEED_THRESHOLD_KMH) {
          if (stationarySinceRef.current === 0) stationarySinceRef.current = now;
          if (isDrivingRef.current && now - stationarySinceRef.current >= STATIONARY_CONFIRM_MS) {
            drivingScoreRef.current = 0;
            commitAndFlipDriving(false, buildComplianceSchedule);
          }
        } else {
          stationarySinceRef.current = 0;
          if (speedKmh >= DRIVING_SPEED_THRESHOLD_KMH && !isDrivingRef.current) {
            drivingScoreRef.current = ACCEL_SCORE_MAX;
            commitAndFlipDriving(true, buildComplianceSchedule);
          }
        }
      });
      Accelerometer.setUpdateInterval(800);
      accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const now = Date.now();
        const gpsAge = now - (lastSpeedTsRef.current || 0);
        const speedKmh = lastSpeedKmhRef.current;
        const gpsIsFresh = gpsAge < GPS_STALE_THRESHOLD_MS;
        if (gpsIsFresh && speedKmh >= DRIVING_SPEED_THRESHOLD_KMH) return;
        if (gpsIsFresh && speedKmh <= STILL_SPEED_THRESHOLD_KMH) return;
        const motion = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);
        const isMoving = motion > MOTION_MAGNITUDE_THRESHOLD;
        let score = drivingScoreRef.current;
        if (isMoving && (!gpsIsFresh || speedKmh > STILL_SPEED_THRESHOLD_KMH)) score = Math.min(ACCEL_SCORE_MAX, score + 1);
        else score = Math.max(0, score - 1);
        drivingScoreRef.current = score;
        const wasDriving = isDrivingRef.current;
        const nextDriving = score >= ACCEL_DRIVE_THRESHOLD ? true : score <= ACCEL_STOP_THRESHOLD ? false : wasDriving;
        if (nextDriving !== wasDriving) commitAndFlipDriving(nextDriving, buildComplianceSchedule);
      });
      if (bgStatus === 'granted') {
        if (!await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 4000,
            distanceInterval: 8,
            pausesLocationUpdatesAutomatically: false,
            foregroundService: {
              notificationTitle: i18n.t('notification.trackingTitle', 'HourWise active'),
              notificationBody: i18n.t('notification.trackingBody', 'Tracking work and driving time'),
              notificationColor: '#60a5fa',
            },
          });
        }
      }
    } catch (e) { console.error('Tracking setup failed', e); }
  }, [buildComplianceSchedule, commitAndFlipDriving]);

  useEffect(() => {
    if (status === 'working' || status === 'poa') startTracking(); else stopTracking();
  }, [status]);

  const updateTotalsAndSwitchStatus = useCallback(async (newStatus: WorkStatus) => {
    await cancelScheduledComplianceNotifications();
    const nowMs = Date.now();
    const segStartMs = segmentStartRef.current ? new Date(segmentStartRef.current).getTime() : nowMs;
    const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
    const prevStatus = statusRef.current;
    applyElapsed(elapsedSec, prevStatus, isDrivingRef.current);
    if (prevStatus === 'break') {
      const tachoBreakSeg = getTachographBreakSeconds(elapsedSec);
      if ((workCycleRef.current / 3600 <= 9 && tachoBreakSeg >= TACHO_30_MIN) || (workCycleRef.current / 3600 > 9 && tachoBreakSeg >= TACHO_45_MIN)) workCycleRef.current = 0;
      if (tachoBreakSeg >= TACHO_45_MIN || (breakTrackerRef.current.has15min && tachoBreakSeg >= TACHO_30_MIN)) {
        totalsRef.current.driving = 0;
        breakTrackerRef.current = { has15min: false, lastTachoBreakSegment: 0 };
        setTimerMode('6h'); timerModeRef.current = '6h';
      } else if (tachoBreakSeg >= TACHO_15_MIN) {
        if (!breakTrackerRef.current.has15min) breakTrackerRef.current.has15min = true;
        if (timerModeRef.current === '6h') { setTimerMode('9h'); timerModeRef.current = '9h'; }
      }
    }
    const nowIso = new Date(nowMs).toISOString();
    segmentStartRef.current = nowIso; statusRef.current = newStatus; lastTickMsRef.current = nowMs;
    setCurrentSegmentStart(nowIso); setStatus(newStatus); vibrateAlert();
    if (prevStatus === 'working' && newStatus === 'break') speakAlert('audioBreakStarted');
    else if (prevStatus === 'break' && newStatus === 'working') speakAlert('audioResumeWork');
    else if (prevStatus === 'working' && newStatus === 'poa') speakAlert('audioPoaStarted');
    else if (prevStatus === 'poa' && newStatus === 'working') speakAlert('audioResumeWork');
    else if (prevStatus === 'poa' && newStatus === 'break') speakAlert('audioBreakStarted');
    if (sessionIdRef.current) {
      const toMins = (s: number) => Math.floor(s / 60);
      const updatePayload: any = {
        status: newStatus,
        total_work_minutes: toMins(totalsRef.current.work),
        total_break_minutes: toMins(totalsRef.current.break),
        total_poa_minutes: toMins(totalsRef.current.poa),
        other_data: { ...(sessionData?.other_data || {}), driving: toMins(totalsRef.current.driving) },
        current_break_start: newStatus === 'break' ? nowIso : null,
        current_poa_start: newStatus === 'poa' ? nowIso : null,
        current_segment_start: nowIso,
      };
      const { data } = await supabase.from('work_sessions').update(updatePayload).eq('id', sessionIdRef.current).select().single();
      if (data) setSessionData(data);
    }
    await persistFromRefs();
    if (newStatus === 'working' || newStatus === 'poa') await buildComplianceSchedule();
  }, [applyElapsed, persistFromRefs, buildComplianceSchedule, cancelScheduledComplianceNotifications, sessionData, speakAlert, vibrateAlert]);

  useEffect(() => {
    const restore = async () => {
      if (!userStorageKey || !userId) return;
      const saved = await AsyncStorage.getItem(userStorageKey);
      if (saved) {
        const s: PersistedState = JSON.parse(saved);
        statusRef.current = s.status;
        sessionIdRef.current = s.sessionId;
        timerModeRef.current = s.timerMode || '6h';
        workStartRef.current = s.workStartTime;
        segmentStartRef.current = s.currentSegmentStart;
        totalsRef.current = s.totals || { work: 0, poa: 0, break: 0, driving: 0 };
        workCycleRef.current = s.workCycleTotal || 0;
        breakTrackerRef.current = s.breakTracker || { has15min: false, lastTachoBreakSegment: 0 };
        isDrivingRef.current = !!s.isDriving;
        weeklyDrivingAccumulatorRef.current = s.weeklyDrivingAccumulator || 0;
        syncStateFromRefs();
      }
      await refreshSession();
    };
    restore();
  }, [userId, userStorageKey, syncStateFromRefs, refreshSession]);

  useEffect(() => {
    if (!userId) return;
    const fetchHistory = async () => {
      const toLocalDateString = (date: Date) => {
        const offset = date.getTimezoneOffset();
        const localDate = new Date(date.getTime() - (offset * 60 * 1000));
        return localDate.toISOString().split('T')[0];
      };
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - 28);
      const data = await workSessionService.fetchSessionsForDateRange(
        userId,
        toLocalDateString(startDate),
        toLocalDateString(endDate),
      );
      if (data) setHistory(data.filter((s: any) => s.end_time !== null));
    };
    fetchHistory();
  }, [userId]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (statusRef.current === 'idle' || !segmentStartRef.current) return;
      const nowMs = Date.now();
      const segStartMs = new Date(segmentStartRef.current).getTime();
      const shiftStartMs = workStartRef.current ? new Date(workStartRef.current).getTime() : nowMs;
      const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
      const d: Totals = { ...totalsRef.current };
      let cycle = workCycleRef.current;
      if (statusRef.current === 'break') d.break += elapsedSec;
      else if (statusRef.current === 'poa') d.poa += elapsedSec;
      else if (statusRef.current === 'working') {
        if (isDrivingRef.current) d.driving += elapsedSec; else d.work += elapsedSec;
        cycle += elapsedSec;
      }
      const maxWork = timerModeRef.current === '6h' ? MAX_WORK_6H : MAX_WORK_9H;
      const shiftElapsed = Math.floor((nowMs - shiftStartMs) / 1000);
      const weeklyDrivingTotal = weeklyDrivingAccumulatorRef.current + d.driving;

      setDisplay({
        work: d.work, poa: d.poa, break: d.break, driving: d.driving, shift: shiftElapsed,
        workTimeRemaining: maxWork - cycle,
        drivingTimeRemaining: MAX_DRIVE - d.driving,
        spreadoverRemaining: SPREADOVER_13H - shiftElapsed,
        breakDuration: statusRef.current === 'break' ? elapsedSec : 0,
        poaDuration: statusRef.current === 'poa' ? elapsedSec : 0,
        weeklyDrivingRemaining: MAX_WEEKLY_DRIVE - weeklyDrivingTotal,
      });
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status !== 'working' && status !== 'poa') return;
    const currentWork = display.workTimeRemaining;
    const currentDrive = display.drivingTimeRemaining;
    const currentSpread = display.spreadoverRemaining;
    const currentWeeklyDrive = display.weeklyDrivingRemaining;

    const prevWork = prevRemainingRef.current.work;
    const prevDrive = prevRemainingRef.current.drive;
    const prevWeeklyDrive = prevRemainingRef.current.weeklyDrive;

    const crossedDown = (current: number, prev: number, threshold: number) => current <= threshold && prev > threshold;

    if (crossedDown(currentWork, prevWork, 45 * 60)) triggerImmediateAlert('audioWork5h15');
    if (crossedDown(currentWork, prevWork, 30 * 60)) triggerImmediateAlert('audioWork5h30');
    if (crossedDown(currentWork, prevWork, 5 * 60)) triggerImmediateAlert('audioWork5h55');
    if (crossedDown(currentWork, prevWork, 0)) triggerImmediateAlert('audioWorkLimitReached');

    if (crossedDown(currentDrive, prevDrive, 30 * 60)) triggerImmediateAlert('audioDriving30minLeft');
    if (crossedDown(currentDrive, prevDrive, 15 * 60)) triggerImmediateAlert('audioDriving15minLeft');
    if (crossedDown(currentDrive, prevDrive, 5 * 60)) triggerImmediateAlert('audioDriving5minLeft');
    if (crossedDown(currentDrive, prevDrive, 0)) triggerImmediateAlert('audioDrivingLimitReached');

    if (crossedDown(currentWeeklyDrive, prevWeeklyDrive, 3600)) triggerImmediateAlert('audioWeeklyDrivingLimitSoon');
    if (crossedDown(currentWeeklyDrive, prevWeeklyDrive, 0)) triggerImmediateAlert('audioWeeklyDrivingLimitReached');

    if (currentSpread <= 30 * 60 && currentSpread > 29 * 60) triggerImmediateAlert('shift13hLimitSoon');
    prevRemainingRef.current = { work: currentWork, drive: currentDrive, weeklyDrive: currentWeeklyDrive };
  }, [status, display, triggerImmediateAlert]);

  const startWork = useCallback(async () => {
    if (!userId || isStartingRef.current || statusRef.current !== 'idle') return;
    isStartingRef.current = true; setIsStarting(true);
    try {
      const { data: lastSession } = await supabase.from('work_sessions').select('end_time').eq('user_id', userId).order('end_time', { ascending: false }).limit(1).maybeSingle();
      if (lastSession?.end_time && (Date.now() - new Date(lastSession.end_time).getTime()) / 1000 < 9 * 3600) { vibrateAlert(); speakAlert('warningLowRest'); }

      // Initialize weekly driving accumulator from DB
      const weeklyDrivingMins = await workSessionService.fetchWeeklyDrivingMinutes(userId);
      weeklyDrivingAccumulatorRef.current = weeklyDrivingMins * 60;

      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const nowIso = new Date().toISOString();
      statusRef.current = 'working'; workStartRef.current = nowIso; segmentStartRef.current = nowIso;
      totalsRef.current = { work: 0, poa: 0, break: 0, driving: 0 }; workCycleRef.current = 0; syncStateFromRefs();
      const { data } = await workSessionService.startSession(userId, timezone, loc.coords.latitude, loc.coords.longitude);
      sessionIdRef.current = data?.id || null; setSessionId(data?.id || null); setSessionData(data);
      await persistFromRefs(); await buildComplianceSchedule(); speakAlert('audioShiftStarted');
      await promptBatteryOptimisationIfNeeded();
    } catch (e) { console.error('startWork error:', e); } finally { isStartingRef.current = false; setIsStarting(false); }
  }, [userId, timezone, persistFromRefs, syncStateFromRefs, buildComplianceSchedule, speakAlert, vibrateAlert]);

  const endWork = useCallback(async () => {
    // Commit in-flight segment before snapshotting totals
    const nowMs = Date.now();
    if (statusRef.current !== 'idle' && segmentStartRef.current) {
      const segStartMs = new Date(segmentStartRef.current).getTime();
      const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
      if (elapsedSec > 0) {
        applyElapsed(elapsedSec, statusRef.current, isDrivingRef.current);
        segmentStartRef.current = new Date(nowMs).toISOString();
      }
    }

    const finalTotals = { ...totalsRef.current };
    const toMins = (s: number) => Math.max(0, Math.floor(s / 60));
    const currentShift = {
      start_time: workStartRef.current,
      end_time: new Date().toISOString(),
      total_work_minutes: toMins(finalTotals.work),
      total_break_minutes: toMins(finalTotals.break),
      total_poa_minutes: toMins(finalTotals.poa),
      other_data: { driving: toMins(finalTotals.driving) }
    };
    const { score, violations } = calculateCompliance(history, currentShift as any);

    setShiftSummaryData({
      totals: finalTotals,
      violations,
      onConfirm: async () => {
        if (!sessionIdRef.current) return;

        const loc = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced,
        }).catch(() => null);

        const result = await workSessionService.endSession(
          sessionIdRef.current,
          toMins(finalTotals.work),
          toMins(finalTotals.poa),
          toMins(finalTotals.break),
          toMins(finalTotals.driving),
          breakTrackerRef.current.has15min,
          sessionData?.other_data ?? {},
          loc?.coords.latitude,
          loc?.coords.longitude,
          score,
          violations,
        );

        // Only clear state if DB write confirmed
        if (result?.error) {
          console.error('endSession failed:', result.error);
          Alert.alert(
            'End Shift Failed',
            'Could not save your shift. Please check your connection and try again.',
          );
          return;
        }

        statusRef.current = 'idle';
        setStatus('idle');
        await cancelScheduledComplianceNotifications(true);
        await persistFromRefs();
        setShiftSummaryData(null);
        speakAlert('audioShiftEnded');
      }
    });
  }, [history, persistFromRefs, cancelScheduledComplianceNotifications, speakAlert, applyElapsed, sessionData]);

  const toggleBreak = useCallback(() =>
    updateTotalsAndSwitchStatus(statusRef.current === 'break' ? 'working' : 'break'),
  [updateTotalsAndSwitchStatus]);

  const togglePOA = useCallback(() =>
    updateTotalsAndSwitchStatus(statusRef.current === 'poa' ? 'working' : 'poa'),
  [updateTotalsAndSwitchStatus]);

  return { status, sessionId, timerMode, isDriving, isStarting, displaySeconds: display, shiftSummaryData, setShiftSummaryData, startWork, endWork, togglePOA, toggleBreak };
};
