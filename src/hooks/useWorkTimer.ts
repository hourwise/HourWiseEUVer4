// src/hooks/useWorkTimer.ts
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

const DRIVING_SPEED_THRESHOLD_KMH = 6;
const STILL_SPEED_THRESHOLD_KMH = 3;
const STATIONARY_CONFIRM_MS = 1500;
const DRIVING_CONFIRM_MS = 4000;  // Must sustain speed ≥ threshold for 4s to start driving
const GPS_STALE_THRESHOLD_MS = 10000;
const MOTION_MAG_THRESHOLD = 0.12;
const ACCEL_SCORE_MAX = 6;
const ACCEL_DRIVE_THRESHOLD = 3;
const ACCEL_STOP_THRESHOLD = 1;

const MAX_WORK_6H = 6 * 3600;
const MAX_WORK_9H = 9 * 3600;
const MAX_DRIVE = 4.5 * 3600;
const MAX_WEEKLY_DRIVE = 56 * 3600;
const SPREADOVER_13H = 13 * 3600;

const TACHO_15_MIN = 15 * 60;
const TACHO_30_MIN = 30 * 60;
const TACHO_45_MIN = 45 * 60;

const APP_BUNDLE_ID = 'com.PCGsoft.hourwise.eu';

type Totals = {
  work: number;
  poa: number;
  break: number;
  driving: number;
};

type BreakTracker = {
  has15min: boolean;
};

type PersistedState = {
  status: WorkStatus;
  sessionId: string | null;
  timerMode: TimerMode;
  workStartTime: string | null;
  currentSegmentStart: string | null;
  actionStart: string | null;
  totals: Totals;
  workCycleTotal: number;
  drivingCycleTotal: number;
  breakTracker: BreakTracker;
  isDriving: boolean;
  lastTickMs: number;
  weeklyDrivingAccumulator: number;
};

const toLocalDateString = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split('T')[0];
};

const getTachographBreakSeconds = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return Math.floor(minutes / 15) * 15 * 60;
};

const ALERT_TEXT = {
  audioWork15minLeft: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime15minLeft' },
  audioWork30minLeft: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime30minLeft' },
  audioWork5minLeft: { titleKey: 'workTimeWarningTitle', bodyKey: 'workTime5minLeft' },
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
  warningReducedRest: { titleKey: 'common.error', bodyKey: 'alerts.reducedRestWarning' },
  shift13hLimitSoon: { titleKey: 'alerts.spreadTitle', bodyKey: 'alerts.spread30m' },
} as const;

type AlertKey = keyof typeof ALERT_TEXT;

const notificationSetupDone = { current: false };
const batteryPromptShown = { current: false };

async function ensureNotificationSetup() {
  if (notificationSetupDone.current) return;
  notificationSetupDone.current = true;

  await Notifications.setNotificationCategoryAsync('alarm', [], {
    intentIdentifiers: [],
    previewPlaceholder: 'Compliance Alert',
  });
}

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
  const [shiftSummaryData, setShiftSummaryData] = useState<any>(null);

  const [display, setDisplay] = useState({
    work: 0,
    poa: 0,
    break: 0,
    driving: 0,
    shift: 0,
    workTimeRemaining: MAX_WORK_6H,
    drivingTimeRemaining: MAX_DRIVE,
    spreadoverRemaining: SPREADOVER_13H,
    breakDuration: 0,
    poaDuration: 0,
    weeklyDrivingRemaining: MAX_WEEKLY_DRIVE,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
  });

  const statusRef = useRef<WorkStatus>('idle');
  const sessionIdRef = useRef<string | null>(null);
  const timerModeRef = useRef<TimerMode>('6h');
  const workStartRef = useRef<string | null>(null);
  const segmentStartRef = useRef<string | null>(null);
  const actionStartRef = useRef<string | null>(null);
  const totalsRef = useRef<Totals>({ work: 0, poa: 0, break: 0, driving: 0 });
  const workCycleRef = useRef<number>(0);
  const drivingCycleRef = useRef<number>(0);
  const breakTrackerRef = useRef<BreakTracker>({ has15min: false });
  const weeklyDrivingAccumulatorRef = useRef<number>(0);
  const lastTickMsRef = useRef<number>(Date.now());
  const isDrivingRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);
  const isPersistingRef = useRef<boolean>(false);
  const sessionDataRef = useRef<any>(null);

  const prevStatusRef = useRef<WorkStatus>('idle');
  const lastBreakDurationUiRef = useRef<number>(0);
  const lastBreakEndTimeRef = useRef<number>(0);

  const scheduledComplianceIdsRef = useRef<string[]>([]);
  const ukVoiceIdentifierRef = useRef<string | null>(null);
  const voiceReadyRef = useRef<Promise<void>>(Promise.resolve());
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<any>(null);

  const lastSpeedKmhRef = useRef<number>(0);
  const lastSpeedTsRef = useRef<number>(0);
  const drivingScoreRef = useRef<number>(0);
  const stationarySinceRef = useRef<number>(0);
  const drivingSinceRef = useRef<number>(0);
  const switchStatusRef = useRef<(newStatus: WorkStatus) => Promise<void>>(async () => {});

  const prevRemainingRef = useRef({
    work: MAX_WORK_6H,
    drive: MAX_DRIVE,
    weeklyDrive: MAX_WEEKLY_DRIVE,
    spread: SPREADOVER_13H,
  });

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

    voiceReadyRef.current = findUKVoice();
  }, []);

  const vibrateAlert = useCallback(() => {
    Vibration.vibrate([0, 200, 100, 200]);
  }, []);

  const speakAlert = useCallback(async (key: string) => {
    // Ensure the UK voice lookup has completed before speaking
    if (!ukVoiceIdentifierRef.current) {
      await voiceReadyRef.current;
    }

    const lang = i18n.language || 'en';
    const options: Speech.SpeechOptions = {
      language: lang.startsWith('en') ? 'en-GB' : lang,
    };

    if (lang.startsWith('en') && ukVoiceIdentifierRef.current) {
      options.voice = ukVoiceIdentifierRef.current;
    }

    try {
      Speech.speak(i18n.t(key), options);
    } catch (e) {
      console.error('Speech failed:', e);
    }
  }, []);

  const triggerImmediateAlert = useCallback(
    async (alertKey: AlertKey) => {
      const cfg = ALERT_TEXT[alertKey];

      speakAlert(alertKey);
      vibrateAlert();

      if (!cfg.titleKey || !cfg.bodyKey) return;

      // Map alert keys to notification channels by urgency
      const CRITICAL_ALERTS: Set<string> = new Set([
        'audioWork5minLeft', 'audioWorkLimitReached',
        'audioDriving5minLeft', 'audioDrivingLimitReached',
        'audioWeeklyDrivingLimitReached',
      ]);
      const CHANNEL_15_ALERTS: Set<string> = new Set([
        'audioWork15minLeft', 'audioDriving15minLeft',
        'audioWeeklyDrivingLimitSoon',
      ]);
      const CHANNEL_30_ALERTS: Set<string> = new Set([
        'audioWork30minLeft', 'audioDriving30minLeft',
      ]);

      let channelId = 'compliance-alerts-v6';
      if (CRITICAL_ALERTS.has(alertKey)) {
        channelId = 'channel-critical-v6';
      } else if (CHANNEL_15_ALERTS.has(alertKey)) {
        channelId = 'channel-15min-v6';
      } else if (CHANNEL_30_ALERTS.has(alertKey)) {
        channelId = 'channel-30min-v6';
      }

      try {
        await Notifications.scheduleNotificationAsync({
          content: {
            title: i18n.t(cfg.titleKey),
            body: i18n.t(cfg.bodyKey),
            priority: Notifications.AndroidNotificationPriority.MAX,
            categoryIdentifier: 'alarm',
            // FIX: channelId must be in content for immediate notifications
            // so Android correctly routes to the high-importance channel
            // When channelId is only in trigger without seconds, it is ignored
            channelId,
          },
          trigger: null, // null = fire immediately
        });
      } catch (e) {
        console.error('Immediate notification failed:', e);
      }
    },
    [speakAlert, vibrateAlert]
  );

  const applyElapsed = useCallback(
    (elapsedSec: number, lastStatus: WorkStatus, lastDriving: boolean) => {
      if (elapsedSec <= 0 || lastStatus === 'idle') return;

      const nextTotals = { ...totalsRef.current };
      let nextCycle = workCycleRef.current;
      let nextDriveCycle = drivingCycleRef.current;

      if (lastStatus === 'break') {
        nextTotals.break += elapsedSec;
      } else if (lastStatus === 'poa') {
        nextTotals.poa += elapsedSec;
      } else if (lastStatus === 'working') {
        if (lastDriving) {
          nextTotals.driving += elapsedSec;
          nextDriveCycle += elapsedSec;
        } else {
          nextTotals.work += elapsedSec;
        }
        nextCycle += elapsedSec;
      }

      totalsRef.current = nextTotals;
      workCycleRef.current = nextCycle;
      drivingCycleRef.current = nextDriveCycle;
    },
    []
  );

  const fetchHistory = useCallback(async () => {
    if (!userId) return;

    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 28);

    const data = await workSessionService.fetchSessionsForDateRange(
      userId,
      toLocalDateString(startDate),
      toLocalDateString(endDate)
    );

    if (data) {
      setHistory(data.filter((s: any) => s.end_time !== null));
    }
  }, [userId]);

  const cancelScheduledComplianceNotifications = useCallback(async (isEndingShift = false) => {
    const ids = scheduledComplianceIdsRef.current;
    scheduledComplianceIdsRef.current = [];

    await Promise.all(
      ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {}))
    );

    if (isEndingShift) {
      await Notifications.cancelAllScheduledNotificationsAsync();
    }
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
    if (isDrivingRef.current) inFlightDriving = inFlightSec;
    else inFlightWork = inFlightSec;
  }
  // During POA both inFlightWork and inFlightDriving stay 0 — both clocks frozen

  const currentWork = workCycleRef.current + inFlightWork;
  const currentDriving = drivingCycleRef.current + inFlightDriving;
  const currentWeeklyDriving =
    weeklyDrivingAccumulatorRef.current + totalsRef.current.driving + inFlightDriving;

  const maxWork = timerModeRef.current === '6h' ? MAX_WORK_6H : MAX_WORK_9H;
  const remainingWork = maxWork - currentWork;
  const remainingDrive = MAX_DRIVE - currentDriving;
  const remainingWeeklyDrive = MAX_WEEKLY_DRIVE - currentWeeklyDriving;

  const scheduleAtThreshold = async (
    remaining: number,
    threshold: number,
    titleKey: string,
    bodyKey: string,
    channelId: string
  ) => {
    const inSeconds = remaining - threshold;
    if (inSeconds <= 0) return;

    try {
      const id = await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t(titleKey),
          body: i18n.t(bodyKey),
          priority: Notifications.AndroidNotificationPriority.MAX,
          categoryIdentifier: 'alarm',
        },
        trigger: {
          seconds: Math.floor(inSeconds),
          channelId,
        } as any,
      });
      scheduledComplianceIdsRef.current.push(id);
    } catch (e) {
      console.warn('Failed to schedule notification:', e);
    }
  };

  // Work time notifications — only when actively working, not during POA
  // POA freezes work time so scheduling from now would fire at wrong wall-clock time
  if (st === 'working') {
    await scheduleAtThreshold(remainingWork, 30 * 60, 'workTimeWarningTitle', 'workTime30minLeft', 'channel-30min-v6');
    await scheduleAtThreshold(remainingWork, 15 * 60, 'workTimeWarningTitle', 'workTime15minLeft', 'channel-15min-v6');
    await scheduleAtThreshold(remainingWork, 5 * 60, 'workTimeWarningTitle', 'workTime5minLeft', 'channel-critical-v6');
    await scheduleAtThreshold(remainingWork, 0, 'workTimeWarningTitle', 'workTimeLimitReached', 'channel-critical-v6');
  }

  // Drive time alerts are NOT pre-scheduled — driving is fluid (driver can stop,
  // take a break, switch to POA at any time) so we cannot predict when thresholds
  // will be reached. Drive alerts fire only via the live crossedDown checks in
  // the 1-second display tick, and weekly driving alerts fire the same way.
}, [cancelScheduledComplianceNotifications]);

  const persistFromRefs = useCallback(async () => {
    if (!userStorageKey || isPersistingRef.current) return;
    isPersistingRef.current = true;

    try {
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
        actionStart: actionStartRef.current,
        totals: totalsRef.current,
        workCycleTotal: workCycleRef.current,
        drivingCycleTotal: drivingCycleRef.current,
        breakTracker: breakTrackerRef.current,
        isDriving: isDrivingRef.current,
        lastTickMs: nowMs,
        weeklyDrivingAccumulator: weeklyDrivingAccumulatorRef.current,
      };

      if (state.status !== 'idle') {
        await AsyncStorage.setItem(userStorageKey, JSON.stringify(state));
      } else {
        await AsyncStorage.removeItem(userStorageKey);
      }
    } finally {
      isPersistingRef.current = false;
    }
  }, [applyElapsed, userStorageKey]);

  const refreshSession = useCallback(async () => {
    if (!userId || isStartingRef.current) return;

    try {
      const { data, error } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('user_id', userId)
        .is('end_time', null)
        .single();

      if (error || !data) return;

      setSessionData(data);
      sessionDataRef.current = data;

      sessionIdRef.current = data.id;
      statusRef.current = data.status as WorkStatus;
      workStartRef.current = data.start_time;

      const dbWork = (data.total_work_minutes || 0) * 60;
      const dbPoa = (data.total_poa_minutes || 0) * 60;
      const dbBreak = (data.total_break_minutes || 0) * 60;
      const dbDriving = (data.other_data?.driving || 0) * 60;

      totalsRef.current = {
        work: Math.max(totalsRef.current.work, dbWork),
        poa: Math.max(totalsRef.current.poa, dbPoa),
        break: Math.max(totalsRef.current.break, dbBreak),
        driving: Math.max(totalsRef.current.driving, dbDriving),
      };

      const dbWorkCycle = dbWork + dbDriving;
      workCycleRef.current = Math.max(workCycleRef.current, dbWorkCycle);

      const dbSegmentStart =
        data.status === 'break'
          ? data.current_break_start || data.start_time
          : data.status === 'poa'
          ? data.current_poa_start || data.start_time
          : data.current_segment_start || data.start_time;

      // Update actionStartRef if we are in a state that has one
      if (data.status === 'break') {
        actionStartRef.current = data.current_break_start || data.start_time;
      } else if (data.status === 'poa') {
        actionStartRef.current = data.current_poa_start || data.start_time;
      } else {
        actionStartRef.current = null;
      }

      const localSegmentStart = segmentStartRef.current;

      let effectiveSegmentStart = dbSegmentStart;
      if (localSegmentStart) {
        const localMs = new Date(localSegmentStart).getTime();
        const dbMs = new Date(dbSegmentStart).getTime();
        effectiveSegmentStart = localMs > dbMs ? localSegmentStart : dbSegmentStart;
      }

      const nowMs = Date.now();
      const effectiveMs = new Date(effectiveSegmentStart).getTime();
      const catchUpSec = Math.max(0, Math.floor((nowMs - effectiveMs) / 1000));

      if (catchUpSec > 0 && catchUpSec < 86400) {
        applyElapsed(catchUpSec, statusRef.current, isDrivingRef.current);
      }

      segmentStartRef.current = new Date(nowMs).toISOString();
      lastTickMsRef.current = nowMs;

      const weeklyDrivingMins = await workSessionService.fetchWeeklyDrivingMinutes(userId);
      weeklyDrivingAccumulatorRef.current = weeklyDrivingMins * 60;

      syncStateFromRefs();
    } catch (e) {
      console.warn('refreshSession failed:', e);
    }
  }, [userId, applyElapsed, syncStateFromRefs]);

  const commitAndFlipDriving = useCallback(
    (nextDriving: boolean, onFlipped?: () => void) => {
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

      if (!nextDriving && sessionIdRef.current && statusRef.current === 'working') {
        const toMins = (s: number) => Math.floor(s / 60);

        const updatePayload: any = {
          other_data: {
            ...(sessionDataRef.current?.other_data || {}),
            driving: toMins(totalsRef.current.driving),
            has15minBreak: breakTrackerRef.current.has15min,
          },
        };

        supabase
          .from('work_sessions')
          .update(updatePayload)
          .eq('id', sessionIdRef.current)
          .select()
          .single()
          .then(({ data, error }) => {
            if (error) {
              console.warn('Drive stop DB sync error:', error);
            } else if (data) {
              setSessionData(data);
              sessionDataRef.current = data;
            }
          })
          .catch(e => console.warn('Drive stop DB sync failed:', e));
      }
    },
    [applyElapsed]
  );

  useEffect(() => {
    const sub = AppState.addEventListener('change', async next => {
      if (next !== 'active') return;

      if (statusRef.current !== 'idle') {
        await refreshSession();
      }

      if (statusRef.current === 'idle') return;

      try {
        const raw = await AsyncStorage.getItem(BG_SPEED_KEY);
        if (!raw) return;

        const { speedKmh, ts } = JSON.parse(raw);
        if (Date.now() - ts > 30000) return;

        const wasMoving = speedKmh >= DRIVING_SPEED_THRESHOLD_KMH;
        const wasStopped = speedKmh <= STILL_SPEED_THRESHOLD_KMH;

        if (wasMoving && statusRef.current === 'break') {
          // Auto-end break when BG detected driving
          await switchStatusRef.current('working');
          commitAndFlipDriving(true, buildComplianceSchedule);
        } else if (wasMoving && !isDrivingRef.current) {
          commitAndFlipDriving(true, buildComplianceSchedule);
        } else if (wasStopped && isDrivingRef.current) {
          commitAndFlipDriving(false, buildComplianceSchedule);
        }
      } catch (e) {
        console.warn('BG speed reconciliation failed:', e);
      }
    });

    return () => sub.remove();
  }, [buildComplianceSchedule, commitAndFlipDriving, refreshSession]);

  const stopTracking = useCallback(async () => {
    locationSubRef.current?.remove();
    accelSubRef.current?.remove();
    locationSubRef.current = null;
    accelSubRef.current = null;

    if (isDrivingRef.current) {
      commitAndFlipDriving(false);
    }

    try {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch {}
  }, [commitAndFlipDriving]);

  const startTracking = useCallback(async () => {
    try {
      const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();
      if (foreStatus !== 'granted') return;

      const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();

      locationSubRef.current = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          distanceInterval: 0,
          timeInterval: 1000,
        },
        loc => {
          const accuracy = loc.coords.accuracy ?? 9999;
          if (accuracy > 50) return;

          const speedKmh = Math.max(0, (loc.coords.speed ?? 0) * 3.6);
          const now = Date.now();

          lastSpeedKmhRef.current = speedKmh;
          lastSpeedTsRef.current = now;

          if (speedKmh <= STILL_SPEED_THRESHOLD_KMH) {
            drivingSinceRef.current = 0;
            if (stationarySinceRef.current === 0) stationarySinceRef.current = now;

            if (
              isDrivingRef.current &&
              now - stationarySinceRef.current >= STATIONARY_CONFIRM_MS
            ) {
              drivingScoreRef.current = 0;
              commitAndFlipDriving(false, buildComplianceSchedule);
            }
          } else if (speedKmh >= DRIVING_SPEED_THRESHOLD_KMH) {
            stationarySinceRef.current = 0;
            if (drivingSinceRef.current === 0) drivingSinceRef.current = now;

            // Already driving — no confirmation needed, just keep going
            if (isDrivingRef.current) {
              drivingSinceRef.current = 0;
            }
            // Not yet driving — require sustained speed for DRIVING_CONFIRM_MS
            else if (now - drivingSinceRef.current >= DRIVING_CONFIRM_MS) {
              drivingSinceRef.current = 0;

              // Auto-end break when sustained motion detected
              if (statusRef.current === 'break') {
                switchStatusRef.current('working').then(() => {
                  if (!isDrivingRef.current) {
                    drivingScoreRef.current = ACCEL_SCORE_MAX;
                    commitAndFlipDriving(true, buildComplianceSchedule);
                  }
                });
              } else {
                drivingScoreRef.current = ACCEL_SCORE_MAX;
                commitAndFlipDriving(true, buildComplianceSchedule);
              }
            }
          } else {
            // In the gap between STILL and DRIVING thresholds (3-6 km/h)
            // Don't start or stop — let current state persist
            drivingSinceRef.current = 0;
          }
        }
      );

      Accelerometer.setUpdateInterval(800);
      accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const now = Date.now();
        const gpsAge = now - (lastSpeedTsRef.current || 0);
        const speedKmh = lastSpeedKmhRef.current;
        const gpsIsFresh = gpsAge < GPS_STALE_THRESHOLD_MS;

        if (gpsIsFresh && speedKmh >= DRIVING_SPEED_THRESHOLD_KMH) return;
        // When GPS is fresh and speed is below driving threshold, trust GPS over accelerometer.
        // This prevents brisk walking (5-6 km/h) from triggering driving via accel score.
        if (gpsIsFresh && speedKmh < DRIVING_SPEED_THRESHOLD_KMH) {
          if (isDrivingRef.current && speedKmh <= STILL_SPEED_THRESHOLD_KMH && drivingScoreRef.current > ACCEL_STOP_THRESHOLD) {
            drivingScoreRef.current = 0;
            commitAndFlipDriving(false, buildComplianceSchedule);
          }
          return;
        }

        const motion = Math.abs(Math.sqrt(x * x + y * y + z * z) - 1);
        const isMoving = motion > MOTION_MAG_THRESHOLD;

        let score = drivingScoreRef.current;
        if (isMoving && (!gpsIsFresh || speedKmh > STILL_SPEED_THRESHOLD_KMH)) {
          score = Math.min(ACCEL_SCORE_MAX, score + 1);
        } else {
          score = Math.max(0, score - 1);
        }

        drivingScoreRef.current = score;

        const wasDriving = isDrivingRef.current;
        const nextDriving =
          score >= ACCEL_DRIVE_THRESHOLD
            ? true
            : score <= ACCEL_STOP_THRESHOLD
            ? false
            : wasDriving;

        if (nextDriving && !wasDriving && statusRef.current === 'break') {
          // Auto-end break when accelerometer detects driving
          switchStatusRef.current('working').then(() => {
            commitAndFlipDriving(true, buildComplianceSchedule);
          });
        } else if (nextDriving !== wasDriving) {
          commitAndFlipDriving(nextDriving, buildComplianceSchedule);
        }
      });

      if (bgStatus === 'granted') {
        const started = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        if (!started) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 4000,
            distanceInterval: 8,
            pausesLocationUpdatesAutomatically: false,
            foregroundService: {
              notificationTitle: i18n.t('notification.trackingTitle', 'HourWise active'),
              notificationBody: i18n.t(
                'notification.trackingBody',
                'Tracking work and driving time'
              ),
              notificationColor: '#60a5fa',
            },
          });
        }
      }
    } catch (e) {
      console.error('Tracking setup failed', e);
    }
  }, [buildComplianceSchedule, commitAndFlipDriving]);

  useEffect(() => {
    if (status === 'working' || status === 'poa' || status === 'break') {
      startTracking();
    } else {
      stopTracking();
    }
    // startTracking and stopTracking are stable — adding them causes
    // unnecessary subscription teardown on compliance rebuilds
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const updateTotalsAndSwitchStatus = useCallback(
    async (newStatus: WorkStatus) => {
      await cancelScheduledComplianceNotifications();

      while (isPersistingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const nowMs = Date.now();
      const segStartMs = segmentStartRef.current
        ? new Date(segmentStartRef.current).getTime()
        : nowMs;
      const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
      const prevStatus = statusRef.current;

      applyElapsed(elapsedSec, prevStatus, isDrivingRef.current);

      if (prevStatus === 'break') {
        // Use actionStartRef for the true break duration — segmentStartRef gets
        // reset every ~20s by persistFromRefs, so elapsedSec only captures the
        // tail end of the break. actionStartRef is set when the break begins
        // and is never touched by the persist interval.
        const breakStartMs = actionStartRef.current
          ? new Date(actionStartRef.current).getTime()
          : segStartMs;
        const totalBreakSec = Math.max(0, Math.floor((nowMs - breakStartMs) / 1000));
        const tachoBreakSeg = getTachographBreakSeconds(totalBreakSec);

        const isQualifyingBreak =
          tachoBreakSeg >= TACHO_45_MIN ||
          (breakTrackerRef.current.has15min && tachoBreakSeg >= TACHO_30_MIN);

        if (isQualifyingBreak) {
          // Full qualifying break — reset cycle counters (not shift totals)
          workCycleRef.current = 0;
          drivingCycleRef.current = 0;
          breakTrackerRef.current = { has15min: false };
          timerModeRef.current = '6h';
          setTimerMode('6h');
        } else if (tachoBreakSeg >= TACHO_15_MIN) {
          // First part of split break — extend window only
          if (!breakTrackerRef.current.has15min) {
            breakTrackerRef.current.has15min = true;
          }
          if (timerModeRef.current === '6h') {
            timerModeRef.current = '9h';
            setTimerMode('9h');
          }
        }
        // tachoBreakSeg < TACHO_15_MIN — break too short to count for anything
      }

      const nowIso = new Date(nowMs).toISOString();

      segmentStartRef.current = nowIso;
      statusRef.current = newStatus;
      lastTickMsRef.current = nowMs;

      // Track the start of the current action (break/poa) for the UI timer
      if (newStatus === 'break' || newStatus === 'poa') {
        actionStartRef.current = nowIso;
      } else {
        actionStartRef.current = null;
      }

      setCurrentSegmentStart(nowIso);
      setStatus(newStatus);
      vibrateAlert();

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
          other_data: {
            ...(sessionDataRef.current?.other_data || {}),
            driving: toMins(totalsRef.current.driving),
            has15minBreak: breakTrackerRef.current.has15min,
          },
          current_break_start: newStatus === 'break' ? nowIso : null,
          current_poa_start: newStatus === 'poa' ? nowIso : null,
        };

        const { data, error } = await supabase
          .from('work_sessions')
          .update(updatePayload)
          .eq('id', sessionIdRef.current)
          .select()
          .single();

        if (error) {
          console.error('updateTotalsAndSwitchStatus DB error:', error);
        } else if (data) {
          setSessionData(data);
          sessionDataRef.current = data;
        }
      }

      await persistFromRefs();

      if (newStatus === 'working' || newStatus === 'poa') {
        await buildComplianceSchedule();
      }
    },
    [
      applyElapsed,
      buildComplianceSchedule,
      cancelScheduledComplianceNotifications,
      persistFromRefs,
      speakAlert,
      vibrateAlert,
    ]
  );

  // Keep the ref in sync so location/accel callbacks can call it without stale closures
  switchStatusRef.current = updateTotalsAndSwitchStatus;

  useEffect(() => {
    const restore = async () => {
      if (!userStorageKey || !userId) return;

      try {
        const saved = await AsyncStorage.getItem(userStorageKey);

        if (saved) {
          const s: PersistedState = JSON.parse(saved);

          statusRef.current = s.status;
          sessionIdRef.current = s.sessionId;
          timerModeRef.current = s.timerMode || '6h';
          workStartRef.current = s.workStartTime;
          segmentStartRef.current = s.currentSegmentStart;
          actionStartRef.current = (s as any).actionStart || null;
          totalsRef.current = s.totals || { work: 0, poa: 0, break: 0, driving: 0 };
          workCycleRef.current = s.workCycleTotal || 0;
          drivingCycleRef.current = s.drivingCycleTotal || 0;
          breakTrackerRef.current = s.breakTracker || { has15min: false };
          isDrivingRef.current = !!s.isDriving;
          weeklyDrivingAccumulatorRef.current = s.weeklyDrivingAccumulator || 0;
          lastTickMsRef.current = s.lastTickMs || Date.now();

          syncStateFromRefs();
        }

        await refreshSession();
      } catch (e) {
        console.warn('restore failed:', e);
      }
    };

    restore();
  }, [userId, userStorageKey, syncStateFromRefs, refreshSession]);

  useEffect(() => {
    fetchHistory();
  }, [fetchHistory]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (statusRef.current === 'idle' || !segmentStartRef.current) return;

      const nowMs = Date.now();
      const segStartMs = new Date(segmentStartRef.current).getTime();
      const shiftStartMs = workStartRef.current
        ? new Date(workStartRef.current).getTime()
        : nowMs;

      const elapsedSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));

      let currentActionElapsed = 0;
      if (actionStartRef.current) {
        const actionStartMs = new Date(actionStartRef.current).getTime();
        currentActionElapsed = Math.max(0, Math.floor((nowMs - actionStartMs) / 1000));
      }

      const d: Totals = { ...totalsRef.current };
      let cycle = workCycleRef.current;
      let driveCycle = drivingCycleRef.current;

      if (statusRef.current === 'break') {
        d.break += elapsedSec;
      } else if (statusRef.current === 'poa') {
        d.poa += elapsedSec;
      } else if (statusRef.current === 'working') {
        if (isDrivingRef.current) {
          d.driving += elapsedSec;
          driveCycle += elapsedSec;
        } else {
          d.work += elapsedSec;
        }
        cycle += elapsedSec;
      }

      const maxWork = timerModeRef.current === '6h' ? MAX_WORK_6H : MAX_WORK_9H;
      const shiftElapsed = Math.floor((nowMs - shiftStartMs) / 1000);
      const weeklyDrivingTotal = weeklyDrivingAccumulatorRef.current + d.driving;

      if (prevStatusRef.current === 'break' && statusRef.current !== 'break') {
        lastBreakDurationUiRef.current = elapsedSec;
        lastBreakEndTimeRef.current = nowMs;
      }

      if (
        lastBreakEndTimeRef.current > 0 &&
        nowMs - lastBreakEndTimeRef.current > 180000
      ) {
        lastBreakDurationUiRef.current = 0;
        lastBreakEndTimeRef.current = 0;
      }

      prevStatusRef.current = statusRef.current;

      setDisplay({
        work: d.work,
        poa: d.poa,
        break: d.break,
        driving: d.driving,
        shift: shiftElapsed,
        workTimeRemaining: maxWork - cycle,
        drivingTimeRemaining: MAX_DRIVE - driveCycle,
        spreadoverRemaining: SPREADOVER_13H - shiftElapsed,
        breakDuration: statusRef.current === 'break' ? currentActionElapsed : 0,
        poaDuration: statusRef.current === 'poa' ? currentActionElapsed : 0,
        weeklyDrivingRemaining: MAX_WEEKLY_DRIVE - weeklyDrivingTotal,
        lastBreakDuration: lastBreakDurationUiRef.current,
        lastBreakEndTime: lastBreakEndTimeRef.current,
      });
    }, 1000);

    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status !== 'working' && status !== 'poa') return;

    const currentWork = display.workTimeRemaining;
    const currentDrive = display.drivingTimeRemaining;
    const currentWeeklyDrive = display.weeklyDrivingRemaining;
    const currentSpread = display.spreadoverRemaining;

    const prevWork = prevRemainingRef.current.work;
    const prevDrive = prevRemainingRef.current.drive;
    const prevWeeklyDrive = prevRemainingRef.current.weeklyDrive;
    const prevSpread = prevRemainingRef.current.spread;

    const crossedDown = (current: number, prev: number, threshold: number) =>
      current <= threshold && prev > threshold;

    if (status === 'working') {
      if (crossedDown(currentWork, prevWork, 15 * 60)) triggerImmediateAlert('audioWork15minLeft');
      if (crossedDown(currentWork, prevWork, 30 * 60)) triggerImmediateAlert('audioWork30minLeft');
      if (crossedDown(currentWork, prevWork, 5 * 60)) triggerImmediateAlert('audioWork5minLeft');
      if (crossedDown(currentWork, prevWork, 0)) triggerImmediateAlert('audioWorkLimitReached');
    }

    if (crossedDown(currentDrive, prevDrive, 30 * 60)) triggerImmediateAlert('audioDriving30minLeft');
    if (crossedDown(currentDrive, prevDrive, 15 * 60)) triggerImmediateAlert('audioDriving15minLeft');
    if (crossedDown(currentDrive, prevDrive, 5 * 60)) triggerImmediateAlert('audioDriving5minLeft');
    if (crossedDown(currentDrive, prevDrive, 0)) triggerImmediateAlert('audioDrivingLimitReached');

    if (crossedDown(currentWeeklyDrive, prevWeeklyDrive, 3600)) {
      triggerImmediateAlert('audioWeeklyDrivingLimitSoon');
    }
    if (crossedDown(currentWeeklyDrive, prevWeeklyDrive, 0)) {
      triggerImmediateAlert('audioWeeklyDrivingLimitReached');
    }

    if (crossedDown(currentSpread, prevSpread, 30 * 60)) {
      triggerImmediateAlert('shift13hLimitSoon');
    }

    prevRemainingRef.current = {
      work: currentWork,
      drive: currentDrive,
      weeklyDrive: currentWeeklyDrive,
      spread: currentSpread,
    };
  }, [status, display, triggerImmediateAlert]);

  useEffect(() => {
    if (!sessionId || status === 'idle') return;

    const interval = setInterval(async () => {
      if (!sessionIdRef.current) return;
      try {
        const toMins = (s: number) => Math.floor(s / 60);

        const { error } = await supabase
          .from('work_sessions')
          .update({
            total_work_minutes: toMins(totalsRef.current.work),
            total_break_minutes: toMins(totalsRef.current.break),
            total_poa_minutes: toMins(totalsRef.current.poa),
            other_data: {
              ...(sessionDataRef.current?.other_data || {}),
              driving: toMins(totalsRef.current.driving),
              has15minBreak: breakTrackerRef.current.has15min,
            },
            current_break_start: statusRef.current === 'break' ? actionStartRef.current : null,
            current_poa_start: statusRef.current === 'poa' ? actionStartRef.current : null,
          })
          .eq('id', sessionIdRef.current);

        if (error) {
          console.error('Periodic session sync DB error:', error);
        }
      } catch (e) {
        console.warn('Periodic session sync failed:', e);
      }
    }, 60000);

    return () => clearInterval(interval);
  }, [sessionId, status]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (statusRef.current === 'idle') return;
      persistFromRefs();
    }, 20000);

    return () => clearInterval(interval);
  }, [persistFromRefs]);

  const startWork = useCallback(async () => {
    if (!userId || isStartingRef.current || statusRef.current !== 'idle') return;

    isStartingRef.current = true;
    setIsStarting(true);

    try {
      const { data: lastSession } = await supabase
        .from('work_sessions')
        .select('end_time')
        .eq('user_id', userId)
        .order('end_time', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (lastSession?.end_time) {
        const restSec = (Date.now() - new Date(lastSession.end_time).getTime()) / 1000;

        if (restSec < 9 * 3600) {
          await triggerImmediateAlert('warningLowRest');
        } else if (restSec < 11 * 3600) {
          await triggerImmediateAlert('warningReducedRest');
        }
      }

      const weeklyDrivingMins = await workSessionService.fetchWeeklyDrivingMinutes(userId);
      weeklyDrivingAccumulatorRef.current = weeklyDrivingMins * 60;

      // Race location fetch against a 5-second timeout so a GPS hang never blocks starting the shift
      const loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
      ]);

      const nowIso = new Date().toISOString();

      statusRef.current = 'working';
      workStartRef.current = nowIso;
      segmentStartRef.current = nowIso;
      actionStartRef.current = null;
      totalsRef.current = { work: 0, poa: 0, break: 0, driving: 0 };
      workCycleRef.current = 0;
      drivingCycleRef.current = 0;
      breakTrackerRef.current = { has15min: false };
      isDrivingRef.current = false;
      lastTickMsRef.current = Date.now();

      syncStateFromRefs();

      const { data, error } = await workSessionService.startSession(
        userId,
        timezone,
        loc?.coords.latitude,
        loc?.coords.longitude
      );

      if (error) {
        console.error('startWork DB error:', error);
        Alert.alert(
          'Shift Start Failed',
          'Could not start your shift on the server. Please check your connection.'
        );
        // Revert local state
        statusRef.current = 'idle';
        workStartRef.current = null;
        segmentStartRef.current = null;
        syncStateFromRefs();
        return;
      }

      sessionIdRef.current = data?.id || null;
      setSessionId(data?.id || null);

      setSessionData(data);
      sessionDataRef.current = data;

      await persistFromRefs();
      await buildComplianceSchedule();

      speakAlert('audioShiftStarted');
      await promptBatteryOptimisationIfNeeded();
    } catch (e) {
      console.error('startWork error:', e);
    } finally {
      isStartingRef.current = false;
      setIsStarting(false);
    }
  }, [
    userId,
    timezone,
    buildComplianceSchedule,
    persistFromRefs,
    speakAlert,
    syncStateFromRefs,
    triggerImmediateAlert,
  ]);

  const endWork = useCallback(async () => {
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
      other_data: {
        driving: toMins(finalTotals.driving),
        has15minBreak: breakTrackerRef.current.has15min,
      },
    };

    const { score, violations } = calculateCompliance(history, currentShift as any);

    setShiftSummaryData({
      totals: finalTotals,
      violations,
      score,
      onConfirm: async () => {
        if (!sessionIdRef.current) {
          // Session was never saved to DB — clear local state so shift ends locally
          await cancelScheduledComplianceNotifications(true);
          await stopTracking();
          statusRef.current = 'idle';
          sessionIdRef.current = null;
          timerModeRef.current = '6h';
          workStartRef.current = null;
          segmentStartRef.current = null;
          totalsRef.current = { work: 0, poa: 0, break: 0, driving: 0 };
          workCycleRef.current = 0;
          drivingCycleRef.current = 0;
          breakTrackerRef.current = { has15min: false };
          weeklyDrivingAccumulatorRef.current = 0;
          isDrivingRef.current = false;
          lastTickMsRef.current = Date.now();
          setStatus('idle');
          setSessionId(null);
          setTimerMode('6h');
          setWorkStartTime(null);
          setCurrentSegmentStart(null);
          setIsDriving(false);
          setSessionData(null);
          setShiftSummaryData(null);
          speakAlert('audioShiftEnded');
          return;
        }

        // Race location fetch against a 5-second timeout so a GPS hang never blocks ending the shift
        const loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
        ]);

        const { data: finalSessionData, error } = await workSessionService.endSession(
          sessionIdRef.current,
          toMins(finalTotals.work),
          toMins(finalTotals.poa),
          toMins(finalTotals.break),
          toMins(finalTotals.driving),
          breakTrackerRef.current.has15min,
          sessionDataRef.current?.other_data ?? {},
          loc?.coords.latitude,
          loc?.coords.longitude,
          score,
          violations
        );

        if (error) {
          console.error('endSession failed:', error);
          Alert.alert(
            'End Shift Failed',
            'Your shift was ended locally but could not be saved to the server. ' +
            'Please check your connection — your shift data may need to be re-entered manually.'
          );
          // Don't return — still clean up local state and cancel notifications
        }

        if (finalSessionData) {
          sessionDataRef.current = finalSessionData;
        }

        await cancelScheduledComplianceNotifications(true);
        await stopTracking();

        statusRef.current = 'idle';
        sessionIdRef.current = null;
        timerModeRef.current = '6h';
        workStartRef.current = null;
        segmentStartRef.current = null;
        actionStartRef.current = null;
        totalsRef.current = { work: 0, poa: 0, break: 0, driving: 0 };
        workCycleRef.current = 0;
        drivingCycleRef.current = 0;
        breakTrackerRef.current = { has15min: false };
        weeklyDrivingAccumulatorRef.current = 0;
        isDrivingRef.current = false;
        lastTickMsRef.current = Date.now();

        setStatus('idle');
        setSessionId(null);
        setTimerMode('6h');
        setWorkStartTime(null);
        setCurrentSegmentStart(null);
        setIsDriving(false);
        setSessionData(null);

        setDisplay({
          work: 0,
          poa: 0,
          break: 0,
          driving: 0,
          shift: 0,
          workTimeRemaining: MAX_WORK_6H,
          drivingTimeRemaining: MAX_DRIVE,
          spreadoverRemaining: SPREADOVER_13H,
          breakDuration: 0,
          poaDuration: 0,
          weeklyDrivingRemaining: MAX_WEEKLY_DRIVE,
          lastBreakDuration: 0,
          lastBreakEndTime: 0,
        });

        await persistFromRefs();
        await fetchHistory();

        setShiftSummaryData(null);
        speakAlert('audioShiftEnded');
      },
    });
  }, [
    applyElapsed,
    cancelScheduledComplianceNotifications,
    fetchHistory,
    history,
    persistFromRefs,
    speakAlert,
    stopTracking,
  ]);

  const toggleBreak = useCallback(() => {
    return updateTotalsAndSwitchStatus(statusRef.current === 'break' ? 'working' : 'break');
  }, [updateTotalsAndSwitchStatus]);

  const togglePOA = useCallback(() => {
    return updateTotalsAndSwitchStatus(statusRef.current === 'poa' ? 'working' : 'poa');
  }, [updateTotalsAndSwitchStatus]);

  return {
    status,
    sessionId,
    timerMode,
    isDriving,
    isStarting,
    displaySeconds: display,
    shiftSummaryData,
    setShiftSummaryData,
    startWork,
    endWork,
    togglePOA,
    toggleBreak,
  };
};