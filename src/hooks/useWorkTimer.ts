import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Vibration, Platform, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import { Accelerometer } from 'expo-sensors';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import i18n from '../lib/i18n';
import {
  ACCEL_DRIVE_THRESHOLD,
  ACCEL_SCORE_MAX,
  ACCEL_STOP_THRESHOLD,
  BASE_STORAGE_KEY,
  BG_SPEED_KEY,
  DRIVING_SPEED_THRESHOLD_KMH,
  GPS_STALE_THRESHOLD_MS,
  LOCATION_TASK_NAME,
  MAX_DAILY_DRIVE_EXTENDED,
  MAX_DRIVE,
  MAX_WEEKLY_DRIVE,
  MOTION_MAGNITUDE_THRESHOLD,
  SPREADOVER_13H,
  STATIONARY_CONFIRM_MS,
  STILL_SPEED_THRESHOLD_KMH,
} from '../lib/tacho/constants';
import {
  applyElapsedToCounters,
  getDisplayedBreakSeconds,
  getMaxWorkSeconds,
  toLocalDateString,
} from '../lib/tacho/timing';
import { deriveLiveDisplayState } from '../lib/tacho/display';
import {
  evaluateAccelerometerDecision,
  evaluateBackgroundSpeedDecision,
  evaluateLocationSample,
} from '../lib/tacho/drivingDetection';
import { buildEndSessionRequest, buildEndShiftSummary } from '../lib/tacho/endShift';
import {
  createEndedShiftResetState,
  createFailedStartRollbackState,
  createInitialDisplayState,
  createStartedShiftState,
} from '../lib/tacho/lifecycle';
import { buildEndShiftSnapshot } from '../lib/tacho/snapshot';
import {
  buildDriveStopUpdatePayload,
  buildPeriodicCheckpointPayload,
  buildStatusUpdatePayload,
} from '../lib/tacho/sessionPayloads';
import {
  deriveDrivingTransition,
  deriveStatusTransition,
  getStatusTransitionAlertKey,
} from '../lib/tacho/transitions';
import type {
  BreakTracker,
  DisplayState,
  PersistedState,
  TimerMode,
  Totals,
  WorkStatus,
} from '../lib/tacho/types';
import { workSessionService } from '../services/workSessionService';
import { calculateCompliance } from '../lib/compliance';
import { supabase } from '../lib/supabase';

const APP_BUNDLE_ID = 'com.PCGsoft.hourwise.eu';
export type { WorkStatus } from '../lib/tacho/types';

const ALERT_TEXT = {
  workWarn30mRemaining: { speechKey: 'audioWork30minLeft', titleKey: 'workTimeWarningTitle', bodyKey: 'workTime30minLeft', channelId: 'channel-30min-v6' },
  workWarn15mRemaining: { speechKey: 'audioWork15minLeft', titleKey: 'workTimeWarningTitle', bodyKey: 'workTime15minLeft', channelId: 'channel-15min-v6' },
  workWarn5mRemaining: { speechKey: 'audioWork5minLeft', titleKey: 'workTimeWarningTitle', bodyKey: 'workTime5minLeft', channelId: 'channel-critical-v6' },
  workLimitReached: { speechKey: 'audioWorkLimitReached', titleKey: 'workTimeWarningTitle', bodyKey: 'workTimeLimitReached', channelId: 'channel-critical-v6' },
  driveCycleWarn30mRemaining: { speechKey: 'audioDriving30minLeft', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime30minLeft', channelId: 'channel-30min-v6' },
  driveCycleWarn15mRemaining: { speechKey: 'audioDriving15minLeft', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime15minLeft', channelId: 'channel-15min-v6' },
  driveCycleWarn5mRemaining: { speechKey: 'audioDriving5minLeft', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTime5minLeft', channelId: 'channel-critical-v6' },
  driveCycleLimitReached: { speechKey: 'audioDrivingLimitReached', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingTimeLimitReached', channelId: 'channel-critical-v6' },
  driveExtensionWarn30mRemaining: { speechKey: 'audioDrivingExtension30minLeft', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingExtension30minLeft', channelId: 'channel-30min-v6' },
  driveExtensionWarn15mRemaining: { speechKey: 'audioDrivingExtension15minLeft', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingExtension15minLeft', channelId: 'channel-15min-v6' },
  driveExtensionWarn5mRemaining: { speechKey: 'audioDrivingExtension5minLeft', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingExtension5minLeft', channelId: 'channel-critical-v6' },
  driveExtensionLimitReached: { speechKey: 'audioDrivingExtensionLimitReached', titleKey: 'drivingTimeWarningTitle', bodyKey: 'drivingExtensionLimitReached', channelId: 'channel-critical-v6' },
  weeklyDriveWarn1hRemaining: { speechKey: 'alerts.weeklyDrive1h', titleKey: 'alerts.weeklyDriveTitle', bodyKey: 'alerts.weeklyDrive1h', channelId: 'channel-15min-v6' },
  weeklyDriveLimitReached: { speechKey: 'alerts.weeklyDriveLimit', titleKey: 'alerts.weeklyDriveTitle', bodyKey: 'alerts.weeklyDriveLimit', channelId: 'channel-critical-v6' },
  audioShiftStarted: { speechKey: 'audioShiftStarted', titleKey: '', bodyKey: '', channelId: '' },
  audioShiftEnded: { speechKey: 'audioShiftEnded', titleKey: '', bodyKey: '', channelId: '' },
  warningLowRest: { speechKey: 'alerts.lowRestWarning', titleKey: 'common.error', bodyKey: 'alerts.lowRestWarning', channelId: 'channel-critical-v6' },
  warningReducedRest: { speechKey: 'alerts.reducedRestWarning', titleKey: 'common.error', bodyKey: 'alerts.reducedRestWarning', channelId: 'channel-critical-v6' },
  shift13hLimitSoon: { speechKey: 'alerts.spread30m', titleKey: 'alerts.spreadTitle', bodyKey: 'alerts.spread30m', channelId: 'channel-30min-v6' },
} as const;

type AlertKey = keyof typeof ALERT_TEXT;

const notificationSetupDone = { current: false };
async function ensureNotificationSetup() {
  if (notificationSetupDone.current) return;
  notificationSetupDone.current = true;
}

const BATTERY_PROMPT_KEY = 'battery_prompt_dismissed';
async function promptBatteryOptimisationIfNeeded() {
  if (Platform.OS !== 'android') return;
  const dismissed = await AsyncStorage.getItem(BATTERY_PROMPT_KEY);
  if (dismissed) return;
  Alert.alert(
    'Keep Alerts Reliable',
    "To receive driving and work-time alerts when your screen is off, please set HourWise to 'Unrestricted' battery usage.",
    [
      { text: 'Not Now', style: 'cancel' },
      { text: "Don't Ask Again", style: 'destructive', onPress: () => AsyncStorage.setItem(BATTERY_PROMPT_KEY, 'true') },
      {
        text: 'Open Settings',
        onPress: async () => {
          AsyncStorage.setItem(BATTERY_PROMPT_KEY, 'true');
          try {
            await IntentLauncher.startActivityAsync('android.settings.APPLICATION_DETAILS_SETTINGS', { data: `package:${APP_BUNDLE_ID}` });
          } catch {
            try { await IntentLauncher.startActivityAsync(IntentLauncher.ActivityAction.IGNORE_BATTERY_OPTIMIZATION_SETTINGS); }
            catch { Linking.openSettings(); }
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
  const [display, setDisplay] = useState<DisplayState>({
    ...createInitialDisplayState(),
  });
  const [shiftSummaryData, setShiftSummaryData] = useState<any>(null);

  const statusRef = useRef<WorkStatus>('idle');
  const sessionIdRef = useRef<string | null>(null);
  const sessionDataRef = useRef<any>(null);
  const timerModeRef = useRef<TimerMode>('6h');
  const workStartRef = useRef<string | null>(null);
  const segmentStartRef = useRef<string | null>(null);
  const totalsRef = useRef<Totals>({ work: 0, poa: 0, break: 0, driving: 0 });
  const legalBreakDisplayTotalRef = useRef<number>(0);
  const workCycleRef = useRef<number>(0);
  const drivingCycleRef = useRef<number>(0);
  const breakTrackerRef = useRef<BreakTracker>({ has15min: false });
  const weeklyDrivingAccumulatorRef = useRef<number>(0);
  const lastTickMsRef = useRef<number>(Date.now());
  const isDrivingRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);
  const isPersistingRef = useRef<boolean>(false);
  const suppressDriveStopSyncRef = useRef<boolean>(false);
   const prevStatusRef = useRef<WorkStatus>('idle');
   const lastBreakDurationUiRef = useRef<number>(0);
   const lastBreakEndTimeRef = useRef<number>(0);
   const breakStartTimeRef = useRef<number>(0); // Track actual break start time for accurate duration calculation

   const scheduledComplianceIdsRef = useRef<string[]>([]);
  const ukVoiceIdentifierRef = useRef<string | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<any>(null);
  const lastSpeedKmhRef = useRef<number>(0);
  const lastSpeedTsRef = useRef<number>(0);
  const drivingScoreRef = useRef<number>(0);
  const stationarySinceRef = useRef<number>(0);
  const prevRemainingRef = useRef({
    work: getMaxWorkSeconds('6h'),
    drive: MAX_DRIVE,
    driveExtension: MAX_DAILY_DRIVE_EXTENDED,
    weeklyDrive: MAX_WEEKLY_DRIVE,
    spread: SPREADOVER_13H,
  });

  useEffect(() => { ensureNotificationSetup(); }, []);

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
      } catch (e) { console.error('Failed to get voices:', e); }
    };
    findUKVoice();
  }, []);

  const vibrateAlert = useCallback(() => { Vibration.vibrate([0, 200, 100, 200]); }, []);

  const speakAlert = useCallback((key: string) => {
    const lang = i18n.language || 'en';
    const options: Speech.SpeechOptions = { language: lang.startsWith('en') ? 'en-GB' : lang };
    if (lang.startsWith('en') && ukVoiceIdentifierRef.current) options.voice = ukVoiceIdentifierRef.current;
    try { Speech.speak(i18n.t(key), options); } catch (e) { console.error('Speech failed:', e); }
  }, []);

  const triggerImmediateAlert = useCallback(async (alertKey: AlertKey) => {
    const cfg = ALERT_TEXT[alertKey];
    speakAlert(cfg.speechKey || cfg.bodyKey || alertKey);
    vibrateAlert();
    if (!cfg.titleKey || !cfg.bodyKey) return;

    try {
      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t(cfg.titleKey),
          body: i18n.t(cfg.bodyKey),
          priority: Notifications.AndroidNotificationPriority.MAX,
          categoryIdentifier: 'alarm',
          channelId: cfg.channelId,
        } as any,
        trigger: null,
      });
    } catch (e) { console.error('Immediate notification failed:', e); }
  }, [speakAlert, vibrateAlert]);

  const applyElapsed = useCallback((elapsedSec: number, lastStatus: WorkStatus, lastDriving: boolean) => {
    const nextState = applyElapsedToCounters(
      {
        totals: totalsRef.current,
        workCycle: workCycleRef.current,
        drivingCycle: drivingCycleRef.current,
      },
      elapsedSec,
      lastStatus,
      lastDriving,
    );
    totalsRef.current = nextState.totals;
    workCycleRef.current = nextState.workCycle;
    drivingCycleRef.current = nextState.drivingCycle;
  }, []);

  const fetchHistory = useCallback(async () => {
    if (!userId) return;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 28);
    const data = await workSessionService.fetchSessionsForDateRange(userId, toLocalDateString(startDate), toLocalDateString(endDate));
    if (data) setHistory(data.filter((s: any) => s.end_time !== null));
  }, [userId]);

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
    const currentDriving = drivingCycleRef.current + inFlightDriving;
    const currentDailyDriving = totalsRef.current.driving + inFlightDriving;
    const currentWeeklyDriving = weeklyDrivingAccumulatorRef.current + totalsRef.current.driving + inFlightDriving;
    const maxWork = getMaxWorkSeconds(timerModeRef.current);
    const remainingWork = maxWork - currentWork;
    const remainingDrive = MAX_DRIVE - currentDriving;
    const remainingDriveExtension = MAX_DAILY_DRIVE_EXTENDED - currentDailyDriving;
    const remainingWeeklyDrive = MAX_WEEKLY_DRIVE - currentWeeklyDriving;

    const scheduleAtThreshold = async (remaining: number, threshold: number, alertKey: AlertKey) => {
      const inSeconds = remaining - threshold;
      if (inSeconds <= 0) return;
      const cfg = ALERT_TEXT[alertKey];
      try {
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: i18n.t(cfg.titleKey),
            body: i18n.t(cfg.bodyKey),
            priority: Notifications.AndroidNotificationPriority.MAX,
            categoryIdentifier: 'alarm',
          },
          trigger: { seconds: Math.floor(inSeconds), channelId: cfg.channelId } as any,
        });
        scheduledComplianceIdsRef.current.push(id);
      } catch (e) { console.warn('Failed to schedule notification:', e); }
    };

    // Work time notifications only fire when actively working — not during POA
    // POA freezes work time so scheduling from now would fire at wrong wall-clock time
    if (st === 'working') {
      await scheduleAtThreshold(remainingWork, 30 * 60, 'workWarn30mRemaining');
      await scheduleAtThreshold(remainingWork, 15 * 60, 'workWarn15mRemaining');
      await scheduleAtThreshold(remainingWork, 5 * 60, 'workWarn5mRemaining');
      await scheduleAtThreshold(remainingWork, 0, 'workLimitReached');
    }

    if (st === 'working' && isDrivingRef.current) {
      await scheduleAtThreshold(remainingDrive, 30 * 60, 'driveCycleWarn30mRemaining');
      await scheduleAtThreshold(remainingDrive, 15 * 60, 'driveCycleWarn15mRemaining');
      await scheduleAtThreshold(remainingDrive, 5 * 60, 'driveCycleWarn5mRemaining');
      await scheduleAtThreshold(remainingDrive, 0, 'driveCycleLimitReached');
      await scheduleAtThreshold(remainingDriveExtension, 30 * 60, 'driveExtensionWarn30mRemaining');
      await scheduleAtThreshold(remainingDriveExtension, 15 * 60, 'driveExtensionWarn15mRemaining');
      await scheduleAtThreshold(remainingDriveExtension, 5 * 60, 'driveExtensionWarn5mRemaining');
      await scheduleAtThreshold(remainingDriveExtension, 0, 'driveExtensionLimitReached');
    }

    if (currentWeeklyDriving > 0) {
      await scheduleAtThreshold(remainingWeeklyDrive, 3600, 'weeklyDriveWarn1hRemaining');
      await scheduleAtThreshold(remainingWeeklyDrive, 0, 'weeklyDriveLimitReached');
    }
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
        totals: totalsRef.current,
        legalBreakDisplayTotal: legalBreakDisplayTotalRef.current,
        workCycleTotal: workCycleRef.current,
        drivingCycleTotal: drivingCycleRef.current,
        breakTracker: breakTrackerRef.current,
        isDriving: isDrivingRef.current,
        lastTickMs: nowMs,
        weeklyDrivingAccumulator: weeklyDrivingAccumulatorRef.current,
        breakStartMs: breakStartTimeRef.current,
      };
      if (state.status !== 'idle') await AsyncStorage.setItem(userStorageKey, JSON.stringify(state));
      else await AsyncStorage.removeItem(userStorageKey);
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

      const dbWork    = (data.total_work_minutes || 0) * 60;
      const dbPoa     = (data.total_poa_minutes || 0) * 60;
      const dbBreak   = (data.total_break_minutes || 0) * 60;
      const dbDriving = (data.other_data?.driving || 0) * 60;
      const dbLegalBreakDisplay = (data.other_data?.legalBreakDisplay || 0) * 60;
      const dbWorkCycle = typeof data.other_data?.workCycle === 'number'
        ? data.other_data.workCycle * 60
        : dbWork + dbDriving;
      const dbDrivingCycle = typeof data.other_data?.drivingCycle === 'number'
        ? data.other_data.drivingCycle * 60
        : dbDriving;

      totalsRef.current = {
        work:    Math.max(totalsRef.current.work, dbWork),
        poa:     Math.max(totalsRef.current.poa, dbPoa),
        break:   Math.max(totalsRef.current.break, dbBreak),
        driving: Math.max(totalsRef.current.driving, dbDriving),
      };

      workCycleRef.current = Math.max(workCycleRef.current, dbWorkCycle);
      drivingCycleRef.current = Math.max(drivingCycleRef.current, dbDrivingCycle);
      legalBreakDisplayTotalRef.current = Math.max(legalBreakDisplayTotalRef.current, dbLegalBreakDisplay);
      if (data.status === 'break' && breakStartTimeRef.current === 0) {
        breakStartTimeRef.current = new Date(data.current_break_start || data.current_segment_start || data.start_time).getTime();
      }

      const dbSegmentStart =
        data.status === 'break' ? (data.current_break_start || data.start_time)
        : data.status === 'poa' ? (data.current_poa_start || data.start_time)
        : (data.current_segment_start || data.start_time);

      const localSegmentStart = segmentStartRef.current;
      let effectiveSegmentStart = dbSegmentStart;
      if (localSegmentStart) {
        const localMs = new Date(localSegmentStart).getTime();
        const dbMs = new Date(dbSegmentStart).getTime();
        effectiveSegmentStart = localMs > dbMs ? localSegmentStart : dbSegmentStart;
      }

      const nowMs = Date.now();
      const catchUpSec = Math.max(0, Math.floor((nowMs - new Date(effectiveSegmentStart).getTime()) / 1000));
      if (catchUpSec > 0 && catchUpSec < 86400) {
        applyElapsed(catchUpSec, statusRef.current, isDrivingRef.current);
      }
      segmentStartRef.current = new Date(nowMs).toISOString();
      lastTickMsRef.current = nowMs;

      const weeklyDrivingMins = await workSessionService.fetchWeeklyDrivingMinutes(userId);
      weeklyDrivingAccumulatorRef.current = weeklyDrivingMins * 60;

      syncStateFromRefs();
    } catch (e) { console.warn('refreshSession failed:', e); }
  }, [userId, syncStateFromRefs, applyElapsed]);

  const commitAndFlipDriving = useCallback((nextDriving: boolean, onFlipped?: () => void) => {
    const drivingTransition = deriveDrivingTransition({
      nowMs: Date.now(),
      status: statusRef.current,
      segmentStartIso: segmentStartRef.current,
      currentDriving: isDrivingRef.current,
      nextDriving,
    });
    if (!drivingTransition.shouldFlip) return;
    if (drivingTransition.elapsedSecToApply > 0) {
      applyElapsed(drivingTransition.elapsedSecToApply, 'working', isDrivingRef.current);
      segmentStartRef.current = drivingTransition.nextSegmentStartIso;
    }
    isDrivingRef.current = nextDriving;
    setIsDriving(nextDriving);
    onFlipped?.();

    if (!suppressDriveStopSyncRef.current && !nextDriving && sessionIdRef.current && statusRef.current === 'working') {
      Promise.resolve(
        supabase
        .from('work_sessions')
        .update(buildDriveStopUpdatePayload({
          totals: totalsRef.current,
          legalBreakDisplayTotal: legalBreakDisplayTotalRef.current,
          has15minBreak: breakTrackerRef.current.has15min,
          workCycle: workCycleRef.current,
          drivingCycle: drivingCycleRef.current,
          existingOtherData: sessionDataRef.current?.other_data,
          currentSegmentStart: segmentStartRef.current,
        }))
        .eq('id', sessionIdRef.current)
        .select()
        .single()
      )
        .then(({ data, error }) => {
          if (error) console.warn('Drive stop DB sync error:', error);
          else if (data) { setSessionData(data); sessionDataRef.current = data; }
        })
        .catch((e: unknown) => console.warn('Drive stop DB sync failed:', e));
    }
  }, [applyElapsed]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      if (next !== 'active') return;
      if (statusRef.current !== 'idle') await refreshSession();
      if (statusRef.current !== 'working') return;
      try {
        const raw = await AsyncStorage.getItem(BG_SPEED_KEY);
        if (!raw) return;
        const { speedKmh, ts } = JSON.parse(raw);
        const decision = evaluateBackgroundSpeedDecision({
          nowMs: Date.now(),
          sampleTs: ts,
          speedKmh,
          isDriving: isDrivingRef.current,
          drivingThresholdKmh: DRIVING_SPEED_THRESHOLD_KMH,
          stillThresholdKmh: STILL_SPEED_THRESHOLD_KMH,
          staleThresholdMs: 30000,
        });
        if (decision.shouldApply && decision.nextDriving !== null) {
          commitAndFlipDriving(decision.nextDriving, buildComplianceSchedule);
        }
      } catch (e) { console.warn('BG speed reconciliation failed:', e); }
    });
    return () => sub.remove();
  }, [commitAndFlipDriving, buildComplianceSchedule, refreshSession]);

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
      locationSubRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.BestForNavigation, distanceInterval: 2, timeInterval: 1000 },
        (loc) => {
          const speedKmh = Math.max(0, (loc.coords.speed ?? 0) * 3.6);
          const decision = evaluateLocationSample({
            nowMs: Date.now(),
            accuracy: loc.coords.accuracy ?? 9999,
            speedKmh,
            isDriving: isDrivingRef.current,
            stationarySinceMs: stationarySinceRef.current,
            stillThresholdKmh: STILL_SPEED_THRESHOLD_KMH,
            drivingThresholdKmh: DRIVING_SPEED_THRESHOLD_KMH,
            stationaryConfirmMs: STATIONARY_CONFIRM_MS,
            accelScoreMax: ACCEL_SCORE_MAX,
          });
          if (decision.shouldIgnore) return;
          lastSpeedKmhRef.current = decision.lastSpeedKmh;
          lastSpeedTsRef.current = decision.lastSpeedTs;
          stationarySinceRef.current = decision.nextStationarySinceMs;
          if (decision.nextDrivingScore !== null) {
            drivingScoreRef.current = decision.nextDrivingScore;
          }
          if (decision.nextDriving !== null) {
            commitAndFlipDriving(decision.nextDriving, buildComplianceSchedule);
          }
        }
      );
      Accelerometer.setUpdateInterval(800);
      accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
        const decision = evaluateAccelerometerDecision({
          nowMs: Date.now(),
          x,
          y,
          z,
          lastSpeedTs: lastSpeedTsRef.current,
          lastSpeedKmh: lastSpeedKmhRef.current,
          currentDrivingScore: drivingScoreRef.current,
          isDriving: isDrivingRef.current,
          gpsStaleThresholdMs: GPS_STALE_THRESHOLD_MS,
          drivingThresholdKmh: DRIVING_SPEED_THRESHOLD_KMH,
          stillThresholdKmh: STILL_SPEED_THRESHOLD_KMH,
          motionMagnitudeThreshold: MOTION_MAGNITUDE_THRESHOLD,
          accelScoreMax: ACCEL_SCORE_MAX,
          accelDriveThreshold: ACCEL_DRIVE_THRESHOLD,
          accelStopThreshold: ACCEL_STOP_THRESHOLD,
        });
        if (decision.shouldIgnore) return;
        const wasDriving = isDrivingRef.current;
        drivingScoreRef.current = decision.nextDrivingScore;
        if (decision.nextDriving !== wasDriving) {
          commitAndFlipDriving(decision.nextDriving, buildComplianceSchedule);
        }
      });
      if (bgStatus === 'granted') {
        if (!await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
            accuracy: Location.Accuracy.BestForNavigation,
            timeInterval: 4000,
            distanceInterval: 8,
            pausesUpdatesAutomatically: false,
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

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (status === 'working' || status === 'poa') startTracking(); else stopTracking();
  }, [status]);

  const updateTotalsAndSwitchStatus = useCallback(async (newStatus: WorkStatus) => {
    await cancelScheduledComplianceNotifications();
    while (isPersistingRef.current) { await new Promise(resolve => setTimeout(resolve, 50)); }

    const nowMs = Date.now();
    const prevStatus = statusRef.current;
    const transition = deriveStatusTransition({
      nowMs,
      prevStatus,
      nextStatus: newStatus,
      segmentStartIso: segmentStartRef.current,
      breakStartMs: breakStartTimeRef.current,
      has15minBreak: breakTrackerRef.current.has15min,
      timerMode: timerModeRef.current,
      workCycle: workCycleRef.current,
      drivingCycle: drivingCycleRef.current,
    });
    applyElapsed(transition.elapsedSecToApply, prevStatus, isDrivingRef.current);
    if (prevStatus === 'break' && transition.lastBreakDuration > 0) {
      legalBreakDisplayTotalRef.current += getDisplayedBreakSeconds(transition.lastBreakDuration);
    }

    workCycleRef.current = transition.nextWorkCycle;
    drivingCycleRef.current = transition.nextDrivingCycle;
    breakTrackerRef.current = { has15min: transition.nextHas15minBreak };
    timerModeRef.current = transition.nextTimerMode;
    setTimerMode(transition.nextTimerMode);

    segmentStartRef.current = transition.nowIso;
    statusRef.current = newStatus;
    lastTickMsRef.current = nowMs;
    breakStartTimeRef.current = transition.nextBreakStartMs;
    lastBreakDurationUiRef.current = transition.lastBreakDuration;
    lastBreakEndTimeRef.current = transition.lastBreakEndTime;
    setCurrentSegmentStart(transition.nowIso);
    setStatus(newStatus);
    vibrateAlert();

    const alertKey = getStatusTransitionAlertKey(prevStatus, newStatus);
    if (alertKey) speakAlert(alertKey);

    if (sessionIdRef.current) {
      const updatePayload: any = buildStatusUpdatePayload({
        status: newStatus,
        totals: totalsRef.current,
        legalBreakDisplayTotal: legalBreakDisplayTotalRef.current,
        has15minBreak: breakTrackerRef.current.has15min,
        workCycle: workCycleRef.current,
        drivingCycle: drivingCycleRef.current,
        existingOtherData: sessionDataRef.current?.other_data,
        currentBreakStart: newStatus === 'break' ? new Date(breakStartTimeRef.current).toISOString() : null,
        currentPoaStart: newStatus === 'poa' ? transition.nowIso : null,
        currentSegmentStart: transition.nowIso,
      });
      const { data } = await supabase.from('work_sessions').update(updatePayload).eq('id', sessionIdRef.current).select().single();
      if (data) { setSessionData(data); sessionDataRef.current = data; }
    }
    await persistFromRefs();
    if (newStatus === 'working' || newStatus === 'poa') await buildComplianceSchedule();
  }, [applyElapsed, persistFromRefs, buildComplianceSchedule, cancelScheduledComplianceNotifications, speakAlert, vibrateAlert]);

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
          totalsRef.current = s.totals || { work: 0, poa: 0, break: 0, driving: 0 };
          legalBreakDisplayTotalRef.current = s.legalBreakDisplayTotal || 0;
          workCycleRef.current = s.workCycleTotal || 0;
          drivingCycleRef.current = s.drivingCycleTotal ?? s.totals?.driving ?? 0;
          breakTrackerRef.current = s.breakTracker || { has15min: false };
          isDrivingRef.current = !!s.isDriving;
          weeklyDrivingAccumulatorRef.current = s.weeklyDrivingAccumulator || 0;
          breakStartTimeRef.current = s.breakStartMs || 0;
          lastTickMsRef.current = s.lastTickMs || Date.now();
          syncStateFromRefs();
        }
        await refreshSession();
      } catch (e) { console.warn('restore failed:', e); }
    };
    restore();
  }, [userId, userStorageKey, syncStateFromRefs, refreshSession]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (statusRef.current === 'idle' || !segmentStartRef.current) return;
      const nowMs = Date.now();
      const nextDisplay = deriveLiveDisplayState({
        nowMs,
        status: statusRef.current,
        segmentStartIso: segmentStartRef.current,
        workStartIso: workStartRef.current,
        totals: totalsRef.current,
        legalBreakDisplayTotal: legalBreakDisplayTotalRef.current,
        workCycle: workCycleRef.current,
        drivingCycle: drivingCycleRef.current,
        isDriving: isDrivingRef.current,
        timerMode: timerModeRef.current,
        weeklyDrivingAccumulator: weeklyDrivingAccumulatorRef.current,
        breakStartMs: breakStartTimeRef.current,
        lastBreakDuration: lastBreakDurationUiRef.current,
        lastBreakEndTime: lastBreakEndTimeRef.current,
        maxDriveSeconds: MAX_DRIVE,
        maxWeeklyDriveSeconds: MAX_WEEKLY_DRIVE,
        spreadOverSeconds: SPREADOVER_13H,
      });
      lastBreakDurationUiRef.current = nextDisplay.lastBreakDuration;
      lastBreakEndTimeRef.current = nextDisplay.lastBreakEndTime;
      prevStatusRef.current = statusRef.current;
      setDisplay(nextDisplay);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (status !== 'working' && status !== 'poa') return;
    const currentWork = display.workTimeRemaining;
    const currentDrive = display.drivingTimeRemaining;
    const currentDriveExtension = MAX_DAILY_DRIVE_EXTENDED - display.driving;
    const currentSpread = display.spreadoverRemaining;
    const currentWeeklyDrive = display.weeklyDrivingRemaining;
    const prevWork = prevRemainingRef.current.work;
    const prevDrive = prevRemainingRef.current.drive;
    const prevDriveExtension = prevRemainingRef.current.driveExtension;
    const prevWeeklyDrive = prevRemainingRef.current.weeklyDrive;
    const prevSpread = prevRemainingRef.current.spread;
    const crossedDown = (current: number, prev: number, threshold: number) => current <= threshold && prev > threshold;

    if (status === 'working') {
      if (crossedDown(currentWork, prevWork, 30 * 60)) triggerImmediateAlert('workWarn30mRemaining');
      if (crossedDown(currentWork, prevWork, 15 * 60)) triggerImmediateAlert('workWarn15mRemaining');
      if (crossedDown(currentWork, prevWork, 5 * 60)) triggerImmediateAlert('workWarn5mRemaining');
      if (crossedDown(currentWork, prevWork, 0)) triggerImmediateAlert('workLimitReached');
    }
    if (status === 'working' && isDriving) {
      if (crossedDown(currentDrive, prevDrive, 30 * 60)) triggerImmediateAlert('driveCycleWarn30mRemaining');
      if (crossedDown(currentDrive, prevDrive, 15 * 60)) triggerImmediateAlert('driveCycleWarn15mRemaining');
      if (crossedDown(currentDrive, prevDrive, 5 * 60)) triggerImmediateAlert('driveCycleWarn5mRemaining');
      if (crossedDown(currentDrive, prevDrive, 0)) triggerImmediateAlert('driveCycleLimitReached');
      if (crossedDown(currentDriveExtension, prevDriveExtension, 30 * 60)) triggerImmediateAlert('driveExtensionWarn30mRemaining');
      if (crossedDown(currentDriveExtension, prevDriveExtension, 15 * 60)) triggerImmediateAlert('driveExtensionWarn15mRemaining');
      if (crossedDown(currentDriveExtension, prevDriveExtension, 5 * 60)) triggerImmediateAlert('driveExtensionWarn5mRemaining');
      if (crossedDown(currentDriveExtension, prevDriveExtension, 0)) triggerImmediateAlert('driveExtensionLimitReached');
    }
    if (crossedDown(currentWeeklyDrive, prevWeeklyDrive, 3600)) triggerImmediateAlert('weeklyDriveWarn1hRemaining');
    if (crossedDown(currentWeeklyDrive, prevWeeklyDrive, 0)) triggerImmediateAlert('weeklyDriveLimitReached');
    if (crossedDown(currentSpread, prevSpread, 30 * 60)) triggerImmediateAlert('shift13hLimitSoon');

    prevRemainingRef.current = {
      work: currentWork,
      drive: currentDrive,
      driveExtension: currentDriveExtension,
      weeklyDrive: currentWeeklyDrive,
      spread: currentSpread,
    };
  }, [status, display, triggerImmediateAlert]);

  // 20-second local persist
  useEffect(() => {
    const interval = setInterval(() => {
      if (statusRef.current === 'idle') return;
      persistFromRefs();
    }, 20000);
    return () => clearInterval(interval);
  }, [persistFromRefs]);

  // 60-second DB checkpoint sync
  useEffect(() => {
    if (!sessionId || status === 'idle') return;
    const interval = setInterval(async () => {
    if (!sessionIdRef.current) return;
      try {
        await supabase.from('work_sessions').update(buildPeriodicCheckpointPayload({
          totals: totalsRef.current,
          legalBreakDisplayTotal: legalBreakDisplayTotalRef.current,
          has15minBreak: breakTrackerRef.current.has15min,
          workCycle: workCycleRef.current,
          drivingCycle: drivingCycleRef.current,
          existingOtherData: sessionDataRef.current?.other_data,
          currentSegmentStart: segmentStartRef.current,
          status: statusRef.current,
          breakStartMs: breakStartTimeRef.current,
          currentPoaStart: segmentStartRef.current,
        })).eq('id', sessionIdRef.current);
      } catch (e) { console.warn('Periodic session sync failed:', e); }
    }, 60000);
    return () => clearInterval(interval);
  }, [sessionId, status]);

  const startWork = useCallback(async () => {
    if (!userId || isStartingRef.current || statusRef.current !== 'idle') return;
    isStartingRef.current = true; setIsStarting(true);
    try {
      const { data: lastSession } = await supabase.from('work_sessions').select('end_time').eq('user_id', userId).order('end_time', { ascending: false }).limit(1).maybeSingle();
      if (lastSession?.end_time) {
        const restSec = (Date.now() - new Date(lastSession.end_time).getTime()) / 1000;
        if (restSec < 9 * 3600) await triggerImmediateAlert('warningLowRest');
        else if (restSec < 11 * 3600) await triggerImmediateAlert('warningReducedRest');
      }

      const weeklyDrivingMins = await workSessionService.fetchWeeklyDrivingMinutes(userId);
      weeklyDrivingAccumulatorRef.current = weeklyDrivingMins * 60;

      const loc = await Promise.race([
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
        new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
      ]);

      const nowMs = Date.now();
      const nowIso = new Date(nowMs).toISOString();
      const startedShift = createStartedShiftState(nowIso, nowMs, weeklyDrivingAccumulatorRef.current);
      statusRef.current = startedShift.status;
      workStartRef.current = startedShift.workStartTime;
      segmentStartRef.current = startedShift.currentSegmentStart;
      totalsRef.current = startedShift.totals;
      legalBreakDisplayTotalRef.current = startedShift.legalBreakDisplayTotal;
      workCycleRef.current = startedShift.workCycle;
      drivingCycleRef.current = startedShift.drivingCycle;
      breakTrackerRef.current = startedShift.breakTracker;
      breakStartTimeRef.current = startedShift.breakStartMs;
      isDrivingRef.current = startedShift.isDriving;
      setIsDriving(startedShift.isDriving);
      setDisplay(startedShift.display);
      lastTickMsRef.current = startedShift.lastTickMs;
      drivingScoreRef.current = startedShift.drivingScore;
      stationarySinceRef.current = startedShift.stationarySinceMs;
      lastSpeedKmhRef.current = startedShift.lastSpeedKmh;
      lastSpeedTsRef.current = startedShift.lastSpeedTs;
      lastBreakDurationUiRef.current = startedShift.lastBreakDuration;
      lastBreakEndTimeRef.current = startedShift.lastBreakEndTime;
      prevRemainingRef.current = {
        work: startedShift.prevWorkRemaining,
        drive: startedShift.prevDriveRemaining,
        driveExtension: MAX_DAILY_DRIVE_EXTENDED,
        weeklyDrive: startedShift.prevWeeklyDriveRemaining,
        spread: startedShift.prevSpreadRemaining,
      };
      syncStateFromRefs();

      const { data, error } = await workSessionService.startSession(userId, timezone, loc?.coords.latitude, loc?.coords.longitude);
      if (error) {
        console.error('startWork DB error:', error);
        Alert.alert('Shift Start Failed', 'Could not start your shift. Please check your connection.');
        const rollbackState = createFailedStartRollbackState();
        statusRef.current = rollbackState.status;
        sessionIdRef.current = rollbackState.sessionId;
        workStartRef.current = rollbackState.workStartTime;
        segmentStartRef.current = rollbackState.currentSegmentStart;
        legalBreakDisplayTotalRef.current = 0;
        drivingScoreRef.current = 0;
        stationarySinceRef.current = 0;
        lastSpeedKmhRef.current = 0;
        lastSpeedTsRef.current = 0;
        lastBreakDurationUiRef.current = 0;
        lastBreakEndTimeRef.current = 0;
        prevRemainingRef.current = {
          work: getMaxWorkSeconds('6h'),
          drive: MAX_DRIVE,
          driveExtension: MAX_DAILY_DRIVE_EXTENDED,
          weeklyDrive: MAX_WEEKLY_DRIVE,
          spread: SPREADOVER_13H,
        };
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
    } catch (e) { console.error('startWork error:', e); }
    finally { isStartingRef.current = false; setIsStarting(false); }
  }, [userId, timezone, persistFromRefs, syncStateFromRefs, buildComplianceSchedule, speakAlert, triggerImmediateAlert]);

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

    const {
      finalTotals,
      effectiveWorkCycle,
      effectiveDrivingCycle,
      effectiveHas15minBreak,
      currentShift,
    } = buildEndShiftSnapshot({
      nowMs,
      status: statusRef.current,
      segmentStartIso: segmentStartRef.current,
      breakStartMs: breakStartTimeRef.current,
      workStartIso: workStartRef.current,
      totals: totalsRef.current,
      workCycle: workCycleRef.current,
      drivingCycle: drivingCycleRef.current,
      has15minBreak: breakTrackerRef.current.has15min,
      timerMode: timerModeRef.current,
    });
    const { score, violations } = calculateCompliance(history, currentShift as any);
    const shiftSummary = buildEndShiftSummary({
      finalTotals,
      score,
      violations,
    });

    setShiftSummaryData({
      ...shiftSummary,
      onConfirm: async () => {
        if (!sessionIdRef.current) return;

        const loc = await Promise.race([
          Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
          new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
        ]);

        const endSessionRequest = buildEndSessionRequest({
          sessionId: sessionIdRef.current,
          finalTotals,
          effectiveHas15minBreak,
          effectiveWorkCycle,
          effectiveDrivingCycle,
          existingOtherData: sessionDataRef.current?.other_data,
          latitude: loc?.coords.latitude,
          longitude: loc?.coords.longitude,
          score,
          violations,
        });

        const { data: finalSessionData, error } = await workSessionService.endSession(
          endSessionRequest.sessionId,
          endSessionRequest.workMins,
          endSessionRequest.poaMins,
          endSessionRequest.breakMins,
          endSessionRequest.drivingMins,
          endSessionRequest.has15minBreak,
          endSessionRequest.existingOtherData,
          endSessionRequest.latitude,
          endSessionRequest.longitude,
          endSessionRequest.complianceScore,
          endSessionRequest.complianceViolations,
        );

        if (error) {
          console.error('endSession failed:', error);
          Alert.alert('End Shift Failed', 'Could not save your shift. Please check your connection and try again.');
          return;
        }

        if (finalSessionData) sessionDataRef.current = finalSessionData;

        suppressDriveStopSyncRef.current = true;
        try {
          await cancelScheduledComplianceNotifications(true);
          await stopTracking();

          const endedShift = createEndedShiftResetState(Date.now());
          statusRef.current = endedShift.status;
          sessionIdRef.current = endedShift.sessionId;
          timerModeRef.current = endedShift.timerMode;
          workStartRef.current = endedShift.workStartTime;
          segmentStartRef.current = endedShift.currentSegmentStart;
          totalsRef.current = endedShift.totals;
          legalBreakDisplayTotalRef.current = endedShift.legalBreakDisplayTotal;
          workCycleRef.current = endedShift.workCycle;
          drivingCycleRef.current = endedShift.drivingCycle;
          breakTrackerRef.current = endedShift.breakTracker;
          breakStartTimeRef.current = endedShift.breakStartMs;
          weeklyDrivingAccumulatorRef.current = endedShift.weeklyDrivingAccumulator;
          isDrivingRef.current = endedShift.isDriving;
          lastTickMsRef.current = endedShift.lastTickMs;
          drivingScoreRef.current = endedShift.drivingScore;
          stationarySinceRef.current = endedShift.stationarySinceMs;
          lastSpeedKmhRef.current = endedShift.lastSpeedKmh;
          lastSpeedTsRef.current = endedShift.lastSpeedTs;
          lastBreakDurationUiRef.current = endedShift.lastBreakDuration;
          lastBreakEndTimeRef.current = endedShift.lastBreakEndTime;
          prevRemainingRef.current = {
            work: endedShift.prevWorkRemaining,
            drive: endedShift.prevDriveRemaining,
            driveExtension: MAX_DAILY_DRIVE_EXTENDED,
            weeklyDrive: endedShift.prevWeeklyDriveRemaining,
            spread: endedShift.prevSpreadRemaining,
          };

          setStatus(endedShift.status);
          setSessionId(endedShift.sessionId);
          setTimerMode(endedShift.timerMode);
          setWorkStartTime(endedShift.workStartTime);
          setCurrentSegmentStart(endedShift.currentSegmentStart);
          setIsDriving(endedShift.isDriving);
          setSessionData(null);
          sessionDataRef.current = null;
          setDisplay(endedShift.display);

          await persistFromRefs();
          await fetchHistory();
          setShiftSummaryData(null);
          speakAlert('audioShiftEnded');
        } finally {
          suppressDriveStopSyncRef.current = false;
        }
      },
    });
  }, [history, persistFromRefs, cancelScheduledComplianceNotifications, speakAlert, applyElapsed, fetchHistory, stopTracking]);

  const toggleBreak = useCallback(() =>
    updateTotalsAndSwitchStatus(statusRef.current === 'break' ? 'working' : 'break'),
  [updateTotalsAndSwitchStatus]);

  const togglePOA = useCallback(() =>
    updateTotalsAndSwitchStatus(statusRef.current === 'poa' ? 'working' : 'poa'),
  [updateTotalsAndSwitchStatus]);

  return { status, sessionId, timerMode, isDriving, isStarting, displaySeconds: display, shiftSummaryData, setShiftSummaryData, startWork, endWork, togglePOA, toggleBreak };
};
