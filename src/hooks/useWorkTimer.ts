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
  DRIVING_IMMEDIATE_START_THRESHOLD_KMH,
  GPS_STALE_THRESHOLD_MS,
  LOW_SPEED_STOP_THRESHOLD_KMH,
  LOCATION_TASK_NAME,
  MAX_DAILY_DRIVE_EXTENDED,
  MAX_DRIVE,
  MAX_WEEKLY_DRIVE,
  MAX_SHIFT_TIME_13H,
  MAX_SHIFT_TIME_15H,
  MOVING_CONFIRM_MS,
  MOTION_MAGNITUDE_THRESHOLD,
  STATIONARY_CONFIRM_MS,
  STILL_SPEED_THRESHOLD_KMH,
} from '../lib/tacho/constants';
import {
  applyElapsedToCounters,
  getDisplayedBreakSeconds,
  getMaxWorkSeconds,
  toLocalDateString,
} from '../lib/tacho/timing';
import { ALERT_TEXT, type AlertKey } from '../lib/tacho/alerts';
import { ensureNotificationChannelsInitialized } from '../lib/notifications';
import {
  clearActiveTimerState,
  clearBackgroundAlertState,
  clearScheduledComplianceNotificationIds,
  clearScheduledDriveNotificationIds,
  loadActiveTimerState,
  loadScheduledComplianceNotificationIds,
  loadScheduledDriveNotificationIds,
  saveActiveTimerState,
  saveScheduledComplianceNotificationIds,
  saveScheduledDriveNotificationIds,
} from '../lib/tacho/runtimeStorage';
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
  countReducedDailyRestsThisWeek,
  getDailyRestWarningLevel,
  getShiftExtensionAllowanceState,
  isReducedDailyRest,
  type SpreadSessionLike,
} from '../lib/tacho/spread';
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

const notificationSetupDone = { current: false };
async function ensureNotificationSetup() {
  if (notificationSetupDone.current) return;
  await ensureNotificationChannelsInitialized();
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

// ========== CRITICAL FIX #2: Weekly driving reset logic ==========
export const calculateWeekStartMs = (nowMs: number): number => {
  const now = new Date(nowMs);
  const day = now.getUTCDay();
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
  const weekStart = new Date(now.setUTCDate(diff));
  weekStart.setUTCHours(0, 0, 0, 0);
  return weekStart.getTime();
};

export const shouldResetWeeklyDriving = (
  lastRefreshMs: number,
  currentMs: number,
): boolean => {
  const lastWeekStart = calculateWeekStartMs(lastRefreshMs);
  const currentWeekStart = calculateWeekStartMs(currentMs);
  return currentWeekStart > lastWeekStart;
};

// ========== CRITICAL FIX #3: Retry logic for DB updates ==========
interface DBUpdateResult {
  success: boolean;
  data?: any;
  error?: any;
}

export const updateSessionWithRetry = async (
  update: () => PromiseLike<any>,
  maxRetries: number = 3,
): Promise<DBUpdateResult> => {
  let lastError;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const result = await update();
      const { data, error } = result;
      if (error) {
        lastError = error;
        const shouldRetry = attempt < maxRetries - 1;
        if (shouldRetry) {
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
          continue;
        }
      }
      return { success: !error, data, error };
    } catch (e) {
      lastError = e;
      const shouldRetry = attempt < maxRetries - 1;
      if (shouldRetry) {
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        continue;
      }
    }
  }

  return { success: false, error: lastError };
};

// ========== Timestamp validation helper ==========
const isValidSegmentStart = (iso: string | null): boolean => {
  if (!iso) return false;
  try {
    const ts = new Date(iso).getTime();
    return !isNaN(ts) && ts > 0 && ts <= Date.now() + 86400000;
  } catch {
    return false;
  }
};

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
  const shiftExtensionsUsedThisWeekRef = useRef<number>(0);
  const maxShiftTimeLimitRef = useRef<number>(MAX_SHIFT_TIME_13H);
  const dailyRestSecondsBeforeShiftRef = useRef<number>(0);
  const reducedDailyRestTakenRef = useRef<boolean>(false);
  const lastTickMsRef = useRef<number>(Date.now());
  const isDrivingRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);
  const isEndingRef = useRef<boolean>(false);
  const isPersistingRef = useRef<boolean>(false);
  const isRefreshingSessionRef = useRef<boolean>(false);
  const suppressDriveStopSyncRef = useRef<boolean>(false);
  const appStateRef = useRef(AppState.currentState);
   const prevStatusRef = useRef<WorkStatus>('idle');
   const lastBreakDurationUiRef = useRef<number>(0);
   const lastBreakEndTimeRef = useRef<number>(0);
   const breakStartTimeRef = useRef<number>(0); // Track actual break start time for accurate duration calculation

   const scheduledComplianceIdsRef = useRef<string[]>([]);
  const scheduledDriveIdsRef = useRef<string[]>([]);
  const ukVoiceIdentifierRef = useRef<string | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<any>(null);
  const lastSpeedKmhRef = useRef<number>(0);
  const lastSpeedTsRef = useRef<number>(0);
  const drivingScoreRef = useRef<number>(0);
  const movingSinceRef = useRef<number>(0);
  const stationarySinceRef = useRef<number>(0);
  const prevShiftElapsedRef = useRef<number>(0);
  const prevRemainingRef = useRef({
    work: getMaxWorkSeconds('6h'),
    drive: MAX_DRIVE,
    driveExtension: MAX_DAILY_DRIVE_EXTENDED,
    weeklyDrive: MAX_WEEKLY_DRIVE,
    maxShiftTime: MAX_SHIFT_TIME_13H,
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

  const syncPrevRemainingFromDisplay = useCallback((nextDisplay: DisplayState) => {
    prevShiftElapsedRef.current = nextDisplay.shift;
    prevRemainingRef.current = {
      work: nextDisplay.workTimeRemaining,
      drive: nextDisplay.drivingTimeRemaining,
      driveExtension: MAX_DAILY_DRIVE_EXTENDED - nextDisplay.driving,
      weeklyDrive: nextDisplay.weeklyDrivingRemaining,
      maxShiftTime: nextDisplay.maxShiftTimeRemaining,
    };
  }, []);

  const syncShiftAllowanceState = useCallback((sessions: SpreadSessionLike[], forDate: Date) => {
    const shiftAllowance = getShiftExtensionAllowanceState(sessions, forDate);
    shiftExtensionsUsedThisWeekRef.current = shiftAllowance.used;
    maxShiftTimeLimitRef.current = shiftAllowance.maxShiftTimeSeconds;
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
    const cfg = ALERT_TEXT[alertKey] as (typeof ALERT_TEXT)[AlertKey];
    if (appStateRef.current === 'active') {
      speakAlert(cfg.speechKey);
      vibrateAlert();
    }
    if (!cfg.titleKey || !cfg.bodyKey) return;

    try {
      await ensureNotificationSetup();
      await Notifications.scheduleNotificationAsync({
        content: {
          title: i18n.t(cfg.titleKey),
          body: i18n.t(cfg.bodyKey),
          sound: 'default',
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
     const persistedComplianceIds = await loadScheduledComplianceNotificationIds();
     const persistedDriveIds = await loadScheduledDriveNotificationIds();
     const ids = [...new Set([...scheduledComplianceIdsRef.current, ...scheduledDriveIdsRef.current, ...persistedComplianceIds, ...persistedDriveIds])];
     scheduledComplianceIdsRef.current = [];
     scheduledDriveIdsRef.current = [];
     await Promise.all(ids.map(id => Notifications.cancelScheduledNotificationAsync(id).catch(() => {})));
     await clearScheduledComplianceNotificationIds();
     await clearScheduledDriveNotificationIds();
     if (isEndingShift) {
       await Notifications.cancelAllScheduledNotificationsAsync();
       await clearBackgroundAlertState();
     }
   }, []);

   const buildDriveAlertSchedule = useCallback(async () => {
     // ========== ALERT FIX: Schedule drive alerts for background firing ==========
     // Only schedule if actively driving (not POA, not working without driving)
     const st = statusRef.current;
     if (st !== 'working' || !isDrivingRef.current) return;

     let inFlightDriving = 0;
     if (segmentStartRef.current) {
       const nowMs = Date.now();
       const segStartMs = new Date(segmentStartRef.current).getTime();
       inFlightDriving = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
     }

     const currentDrivingCycle = drivingCycleRef.current + inFlightDriving;
     const remainingDrive = MAX_DRIVE - currentDrivingCycle;
     const totalDriving = totalsRef.current.driving + inFlightDriving;
     const remainingDriveExtension = MAX_DAILY_DRIVE_EXTENDED - totalDriving;
     const totalWeeklyDrive = weeklyDrivingAccumulatorRef.current + totalDriving;
     const remainingWeeklyDrive = MAX_WEEKLY_DRIVE - totalWeeklyDrive;

     // Helper to schedule alert if remaining time is positive
     const scheduleIfNeeded = async (remaining: number, threshold: number, alertKey: AlertKey) => {
       const inSeconds = remaining - threshold;
       if (inSeconds <= 0 || inSeconds > 86400) return; // Don't schedule if already past or > 24h

       const cfg = ALERT_TEXT[alertKey];
       try {
         await ensureNotificationSetup();
         const id = await Notifications.scheduleNotificationAsync({
           content: {
             title: i18n.t(cfg.titleKey),
             body: i18n.t(cfg.bodyKey),
             sound: 'default',
             priority: Notifications.AndroidNotificationPriority.MAX,
             categoryIdentifier: 'alarm',
             channelId: cfg.channelId,
             vibrationPattern: [0, 250, 250, 250],
           } as any,
           trigger: { seconds: Math.floor(inSeconds), channelId: cfg.channelId } as any,
         });
         scheduledDriveIdsRef.current.push(id);
         console.log(`Scheduled drive alert "${alertKey}" for ${Math.floor(inSeconds)}s`);
       } catch (e) { console.warn(`Failed to schedule drive alert ${alertKey}:`, e); }
     };

     // Schedule drive cycle alerts
     await scheduleIfNeeded(remainingDrive, 30 * 60, 'driveCycleWarn30mRemaining');
     await scheduleIfNeeded(remainingDrive, 15 * 60, 'driveCycleWarn15mRemaining');
     await scheduleIfNeeded(remainingDrive, 5 * 60, 'driveCycleWarn5mRemaining');
     await scheduleIfNeeded(remainingDrive, 0, 'driveCycleLimitReached');

     // Schedule drive extension alerts
     await scheduleIfNeeded(remainingDriveExtension, 30 * 60, 'driveExtensionWarn30mRemaining');
     await scheduleIfNeeded(remainingDriveExtension, 15 * 60, 'driveExtensionWarn15mRemaining');
     await scheduleIfNeeded(remainingDriveExtension, 5 * 60, 'driveExtensionWarn5mRemaining');
     await scheduleIfNeeded(remainingDriveExtension, 0, 'driveExtensionLimitReached');

     // Schedule weekly drive alerts
     await scheduleIfNeeded(remainingWeeklyDrive, 60 * 60, 'weeklyDriveWarn1hRemaining');
     await scheduleIfNeeded(remainingWeeklyDrive, 0, 'weeklyDriveLimitReached');

     await saveScheduledDriveNotificationIds(scheduledDriveIdsRef.current);
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
    const maxWork = getMaxWorkSeconds(timerModeRef.current);
    const remainingWork = maxWork - currentWork;

    const scheduleAtThreshold = async (remaining: number, threshold: number, alertKey: AlertKey) => {
      const inSeconds = remaining - threshold;
      if (inSeconds <= 0) return;
      const cfg = ALERT_TEXT[alertKey];
      try {
        await ensureNotificationSetup();
        const id = await Notifications.scheduleNotificationAsync({
          content: {
            title: i18n.t(cfg.titleKey),
            body: i18n.t(cfg.bodyKey),
            sound: 'default',
            priority: Notifications.AndroidNotificationPriority.MAX,
            categoryIdentifier: 'alarm',
            channelId: cfg.channelId,
          } as any,
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

    if (workStartRef.current) {
      const startMs = new Date(workStartRef.current).getTime();
      const nowMs = Date.now();
      const regularRemaining = (startMs + MAX_SHIFT_TIME_13H * 1000 - nowMs) / 1000;
      await scheduleAtThreshold(regularRemaining, 30 * 60, 'shift13hLimitSoon');
      await scheduleAtThreshold(regularRemaining, 0, 'shift13hLimitReached');

      if (maxShiftTimeLimitRef.current > MAX_SHIFT_TIME_13H) {
        const extendedRemaining = (startMs + MAX_SHIFT_TIME_15H * 1000 - nowMs) / 1000;
        await scheduleAtThreshold(extendedRemaining, 30 * 60, 'shift15hLimitSoon');
        await scheduleAtThreshold(extendedRemaining, 0, 'shift15hLimitReached');
      }
    }

    await saveScheduledComplianceNotificationIds(scheduledComplianceIdsRef.current);
  }, [cancelScheduledComplianceNotifications]);

   const persistFromRefs = useCallback(async () => {
     if (!userStorageKey || isPersistingRef.current || isRefreshingSessionRef.current) return;
     isPersistingRef.current = true;
     try {
       const nowMs = Date.now();
       if (statusRef.current !== 'idle' && segmentStartRef.current) {
         // ========== CRITICAL FIX #4: Validate segment start before using ==========
         if (!isValidSegmentStart(segmentStartRef.current)) {
           console.warn('Invalid segmentStart, resetting to now:', segmentStartRef.current);
           segmentStartRef.current = new Date(nowMs).toISOString();
           return;
         }

         const segStartMs = new Date(segmentStartRef.current).getTime();
         const elapsedSinceSegment = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));

         // Sanity check: elapsed time should be reasonable (< 1 day)
         if (elapsedSinceSegment > 0 && elapsedSinceSegment < 86400) {
           applyElapsed(elapsedSinceSegment, statusRef.current, isDrivingRef.current);
           segmentStartRef.current = new Date(nowMs).toISOString();
         } else if (elapsedSinceSegment >= 86400) {
           console.warn('Abnormal elapsed time detected (>24h), possible clock issue');
           segmentStartRef.current = new Date(nowMs).toISOString();
         }
       }
      lastTickMsRef.current = nowMs;
      const state: PersistedState = {
        status: statusRef.current,
        sessionId: sessionIdRef.current,
        userStorageKey,
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
        shiftExtensionsUsedThisWeek: shiftExtensionsUsedThisWeekRef.current,
        maxShiftTimeSeconds: maxShiftTimeLimitRef.current,
        dailyRestSecondsBeforeShift: dailyRestSecondsBeforeShiftRef.current,
        reducedDailyRestTaken: reducedDailyRestTakenRef.current,
        breakStartMs: breakStartTimeRef.current,
      };
      if (state.status !== 'idle') {
        await saveActiveTimerState(state);
      } else {
        await clearActiveTimerState(userStorageKey);
        await clearBackgroundAlertState();
      }
    } finally {
      isPersistingRef.current = false;
    }
  }, [applyElapsed, userStorageKey]);

  const refreshSession = useCallback(async () => {
    if (!userId || isStartingRef.current || isRefreshingSessionRef.current) return;
    isRefreshingSessionRef.current = true;
    try {
      while (isPersistingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const persistedState = await loadActiveTimerState();
      const hasMatchingPersistedState =
        !!persistedState &&
        persistedState.userStorageKey === userStorageKey;

      const localSessionId = hasMatchingPersistedState
        ? persistedState.sessionId
        : sessionIdRef.current;
      const localStatus = hasMatchingPersistedState
        ? persistedState.status
        : statusRef.current;
      const localTimerMode = hasMatchingPersistedState
        ? persistedState.timerMode
        : timerModeRef.current;
      const localHas15minBreak = hasMatchingPersistedState
        ? persistedState.breakTracker.has15min
        : breakTrackerRef.current.has15min;
      const localSegmentStart = hasMatchingPersistedState
        ? persistedState.currentSegmentStart
        : segmentStartRef.current;
      const localBreakStartMs = hasMatchingPersistedState
        ? (persistedState.breakStartMs || 0)
        : breakStartTimeRef.current;
      const localIsDriving = hasMatchingPersistedState
        ? persistedState.isDriving
        : isDrivingRef.current;
      const localTotals = hasMatchingPersistedState
        ? persistedState.totals
        : totalsRef.current;
      const localWorkCycle = hasMatchingPersistedState
        ? persistedState.workCycleTotal
        : workCycleRef.current;
      const localDrivingCycle = hasMatchingPersistedState
        ? (persistedState.drivingCycleTotal ?? persistedState.totals.driving)
        : drivingCycleRef.current;
      const localLegalBreakDisplayTotal = hasMatchingPersistedState
        ? (persistedState.legalBreakDisplayTotal || 0)
        : legalBreakDisplayTotalRef.current;
      const localShiftExtensionsUsedThisWeek = hasMatchingPersistedState
        ? (persistedState.shiftExtensionsUsedThisWeek || 0)
        : shiftExtensionsUsedThisWeekRef.current;
      const localMaxShiftTimeSeconds = hasMatchingPersistedState
        ? (persistedState.maxShiftTimeSeconds || MAX_SHIFT_TIME_13H)
        : maxShiftTimeLimitRef.current;
      const localDailyRestSecondsBeforeShift = hasMatchingPersistedState
        ? (persistedState.dailyRestSecondsBeforeShift || 0)
        : dailyRestSecondsBeforeShiftRef.current;
      const localReducedDailyRestTaken = hasMatchingPersistedState
        ? !!persistedState.reducedDailyRestTaken
        : reducedDailyRestTakenRef.current;
      const localLastTickMs = hasMatchingPersistedState
        ? persistedState.lastTickMs
        : lastTickMsRef.current;

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
      workStartRef.current = data.start_time;

      const dbWork    = (data.total_work_minutes || 0) * 60;
      const dbPoa     = (data.total_poa_minutes || 0) * 60;
      const dbBreak   = (data.total_break_minutes || 0) * 60;
      const dbDriving = (data.other_data?.driving || 0) * 60;
      const dbLegalBreakDisplay = (data.other_data?.legalBreakDisplay || 0) * 60;
      const dbHas15minBreak = !!data.other_data?.has15minBreak;
      const dbTimerMode =
        data.other_data?.timerMode === '9h' ? '9h' : '6h';
      const dbWorkCycle = typeof data.other_data?.workCycle === 'number'
        ? data.other_data.workCycle * 60
        : dbWork + dbDriving;
      const dbDrivingCycle = typeof data.other_data?.drivingCycle === 'number'
        ? data.other_data.drivingCycle * 60
        : dbDriving;
      const dbDailyRestSecondsBeforeShift = typeof data.other_data?.dailyRestSecondsBeforeShift === 'number'
        ? data.other_data.dailyRestSecondsBeforeShift
        : 0;
      const dbReducedDailyRestTaken = !!data.other_data?.reducedDailyRestTaken;

       const dbSegmentStart =
          data.status === 'break' ? (data.current_break_start || data.start_time)
          : data.status === 'poa' ? (data.current_poa_start || data.start_time)
          : (data.current_segment_start || data.start_time);

       const hasMatchingLocalSession =
         localSessionId === data.id &&
         localStatus !== 'idle' &&
         isValidSegmentStart(localSegmentStart);

      if (hasMatchingLocalSession) {
        statusRef.current = localStatus;
        timerModeRef.current = localTimerMode;
        breakTrackerRef.current = { has15min: localHas15minBreak };
        totalsRef.current = localTotals;
        workCycleRef.current = localWorkCycle;
        drivingCycleRef.current = localDrivingCycle;
        legalBreakDisplayTotalRef.current = localLegalBreakDisplayTotal;
        isDrivingRef.current = localStatus === 'working' ? localIsDriving : false;
        segmentStartRef.current = localSegmentStart;
        shiftExtensionsUsedThisWeekRef.current = localShiftExtensionsUsedThisWeek;
        maxShiftTimeLimitRef.current = localMaxShiftTimeSeconds;
        dailyRestSecondsBeforeShiftRef.current = localDailyRestSecondsBeforeShift;
        reducedDailyRestTakenRef.current = localReducedDailyRestTaken;
        breakStartTimeRef.current =
          localStatus === 'break' && localBreakStartMs > 0 ? localBreakStartMs : 0;
      } else {
        statusRef.current = data.status as WorkStatus;
        timerModeRef.current = dbTimerMode;
        breakTrackerRef.current = { has15min: dbHas15minBreak };
        totalsRef.current = {
          work: dbWork,
          poa: dbPoa,
          break: dbBreak,
          driving: dbDriving,
        };
        workCycleRef.current = dbWorkCycle;
        drivingCycleRef.current = dbDrivingCycle;
        legalBreakDisplayTotalRef.current = dbLegalBreakDisplay;
        shiftExtensionsUsedThisWeekRef.current = localShiftExtensionsUsedThisWeek;
        maxShiftTimeLimitRef.current = localMaxShiftTimeSeconds;
        dailyRestSecondsBeforeShiftRef.current = dbDailyRestSecondsBeforeShift;
        reducedDailyRestTakenRef.current = dbReducedDailyRestTaken;
        segmentStartRef.current = dbSegmentStart;
        breakStartTimeRef.current =
          data.status === 'break'
            ? new Date(data.current_break_start || dbSegmentStart || data.start_time).getTime()
            : 0;
        isDrivingRef.current = false;
      }

       const nowMs = Date.now();
        const effectiveSegmentStart = segmentStartRef.current;
        if (statusRef.current !== 'idle' && effectiveSegmentStart) {
          const segStartMs = new Date(effectiveSegmentStart).getTime();
          const lastTickMs = hasMatchingLocalSession ? localLastTickMs : segStartMs;
          // CRITICAL FIX #5: Only apply catch-up time if segment actually elapsed since last tick
          // This prevents double-counting when persistFromRefs already applied elapsed time
          const referenceTickMs = Math.max(segStartMs, lastTickMs);
          const timeSinceLastTick = Math.max(0, Math.floor((nowMs - referenceTickMs) / 1000));
          if (timeSinceLastTick > 0 && timeSinceLastTick < 86400) {
            applyElapsed(timeSinceLastTick, statusRef.current, isDrivingRef.current);
          }
       }
       segmentStartRef.current = new Date(nowMs).toISOString();
       lastTickMsRef.current = nowMs;

      const [weeklyDrivingMins, weekSessions] = await Promise.all([
        workSessionService.fetchWeeklyDrivingMinutes(userId),
        workSessionService.fetchWeekSessions(userId),
      ]);
      weeklyDrivingAccumulatorRef.current = weeklyDrivingMins * 60;
      syncShiftAllowanceState(weekSessions, new Date());

      syncPrevRemainingFromDisplay(deriveLiveDisplayState({
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
        has15minBreak: breakTrackerRef.current.has15min,
        lastBreakDuration: lastBreakDurationUiRef.current,
        lastBreakEndTime: lastBreakEndTimeRef.current,
        maxDriveSeconds: MAX_DRIVE,
        maxWeeklyDriveSeconds: MAX_WEEKLY_DRIVE,
        maxShiftTimeSeconds: maxShiftTimeLimitRef.current,
      }));

      syncStateFromRefs();
    } catch (e) { console.warn('refreshSession failed:', e); }
    finally { isRefreshingSessionRef.current = false; }
  }, [userId, userStorageKey, syncStateFromRefs, syncPrevRemainingFromDisplay, applyElapsed, syncShiftAllowanceState]);

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
    movingSinceRef.current = 0;
    stationarySinceRef.current = 0;
    setIsDriving(nextDriving);
    onFlipped?.();

    if (nextDriving) {
      buildDriveAlertSchedule().catch(e => console.warn('Failed to build drive alerts:', e));
    } else {
      cancelScheduledComplianceNotifications().then(() => {
        if (isEndingRef.current) return;
        if (statusRef.current === 'working' || statusRef.current === 'poa') {
          buildComplianceSchedule();
        }
      });
    }

    if (!suppressDriveStopSyncRef.current && !nextDriving && sessionIdRef.current && statusRef.current === 'working') {
      // ========== CRITICAL FIX #3: Implement retry logic with exponential backoff ==========
      updateSessionWithRetry(
        () => supabase
          .from('work_sessions')
          .update(buildDriveStopUpdatePayload({
            totals: totalsRef.current,
            legalBreakDisplayTotal: legalBreakDisplayTotalRef.current,
            has15minBreak: breakTrackerRef.current.has15min,
            workCycle: workCycleRef.current,
            drivingCycle: drivingCycleRef.current,
            timerMode: timerModeRef.current,
            existingOtherData: sessionDataRef.current?.other_data,
            currentSegmentStart: segmentStartRef.current,
          }))
          .eq('id', sessionIdRef.current)
          .select()
          .single(),
        3, // max retries
      )
        .catch((e: unknown) => console.warn('Drive stop DB sync failed:', e));
    }
  }, [applyElapsed]);

   useEffect(() => {
     const sub = AppState.addEventListener('change', async (next) => {
       const prev = appStateRef.current;
       appStateRef.current = next;

       if ((next === 'inactive' || next === 'background') && statusRef.current !== 'idle') {
         // CRITICAL FIX #8: Ensure driving state is synced before backgrounding
         // This prevents stale driving state from being replayed on resume
         if (isDrivingRef.current && sessionIdRef.current) {
           try {
             await updateSessionWithRetry(
               () => supabase
                 .from('work_sessions')
                 .update(buildDriveStopUpdatePayload({
                   totals: totalsRef.current,
                   legalBreakDisplayTotal: legalBreakDisplayTotalRef.current,
                   has15minBreak: breakTrackerRef.current.has15min,
                   workCycle: workCycleRef.current,
                   drivingCycle: drivingCycleRef.current,
                   timerMode: timerModeRef.current,
                   existingOtherData: sessionDataRef.current?.other_data,
                   currentSegmentStart: segmentStartRef.current,
                 }))
                 .eq('id', sessionIdRef.current)
                 .select()
                 .single(),
               2, // Quick sync before background
             );
           } catch (e) { console.warn('Background driving state sync failed:', e); }
         }
         await persistFromRefs();
         return;
       }

       if (next !== 'active' || prev === 'active') return;
       if (statusRef.current !== 'idle') await refreshSession();
       if (statusRef.current !== 'working') return;
       try {
         const raw = await AsyncStorage.getItem(BG_SPEED_KEY);
         if (!raw) return;
         const { speedKmh, ts } = JSON.parse(raw);
         // CRITICAL FIX #6: Use shorter stale threshold when resuming to avoid stale speed data
         // Default is 10 seconds - older data is considered too stale for accurate state
         const decision = evaluateBackgroundSpeedDecision({
           nowMs: Date.now(),
           sampleTs: ts,
           speedKmh,
           isDriving: isDrivingRef.current,
           drivingThresholdKmh: DRIVING_SPEED_THRESHOLD_KMH,
           stillThresholdKmh: STILL_SPEED_THRESHOLD_KMH,
           immediateStartThresholdKmh: DRIVING_IMMEDIATE_START_THRESHOLD_KMH,
           lowSpeedStopThresholdKmh: LOW_SPEED_STOP_THRESHOLD_KMH,
           staleThresholdMs: 10000,  // Reduced from 30s to 10s to ignore stale data
         });
         if (decision.shouldApply && decision.nextDriving !== null) {
           commitAndFlipDriving(decision.nextDriving);
         }
       } catch (e) { console.warn('BG speed reconciliation failed:', e); }
    });
    return () => sub.remove();
  }, [commitAndFlipDriving, persistFromRefs, refreshSession]);

  const stopTracking = useCallback(async () => {
    locationSubRef.current?.remove();
    accelSubRef.current?.remove();
    locationSubRef.current = null;
    accelSubRef.current = null;
    if (isDrivingRef.current) {
      if (isEndingRef.current) {
        isDrivingRef.current = false;
        movingSinceRef.current = 0;
        stationarySinceRef.current = 0;
        setIsDriving(false);
      } else {
        commitAndFlipDriving(false);
      }
    }
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
            lastSpeedKmh: lastSpeedKmhRef.current,
            lastSpeedTs: lastSpeedTsRef.current,
            isDriving: isDrivingRef.current,
            movingSinceMs: movingSinceRef.current,
            stationarySinceMs: stationarySinceRef.current,
            stillThresholdKmh: STILL_SPEED_THRESHOLD_KMH,
            lowSpeedStopThresholdKmh: LOW_SPEED_STOP_THRESHOLD_KMH,
            drivingThresholdKmh: DRIVING_SPEED_THRESHOLD_KMH,
            immediateStartThresholdKmh: DRIVING_IMMEDIATE_START_THRESHOLD_KMH,
            movingConfirmMs: MOVING_CONFIRM_MS,
            stationaryConfirmMs: STATIONARY_CONFIRM_MS,
            accelScoreMax: ACCEL_SCORE_MAX,
          });
          if (decision.shouldIgnore) return;
          lastSpeedKmhRef.current = decision.lastSpeedKmh;
          lastSpeedTsRef.current = decision.lastSpeedTs;
          movingSinceRef.current = decision.nextMovingSinceMs;
          stationarySinceRef.current = decision.nextStationarySinceMs;
          if (decision.nextDrivingScore !== null) {
            drivingScoreRef.current = decision.nextDrivingScore;
          }
          if (decision.nextDriving !== null) {
            commitAndFlipDriving(decision.nextDriving);
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
          commitAndFlipDriving(decision.nextDriving);
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
  }, [commitAndFlipDriving]);

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

    if (newStatus !== 'working') {
      isDrivingRef.current = false;
      movingSinceRef.current = 0;
      stationarySinceRef.current = 0;
      setIsDriving(false);
    }

    const alertKey = getStatusTransitionAlertKey(prevStatus, newStatus);
    if (alertKey) speakAlert(alertKey);

    if (sessionIdRef.current) {
      const updatePayload = buildStatusUpdatePayload({
        status: newStatus,
        totals: totalsRef.current,
        legalBreakDisplayTotal: legalBreakDisplayTotalRef.current,
        has15minBreak: breakTrackerRef.current.has15min,
        workCycle: workCycleRef.current,
        drivingCycle: drivingCycleRef.current,
        timerMode: timerModeRef.current,
        existingOtherData: sessionDataRef.current?.other_data,
        currentBreakStart:
          newStatus === 'break' ? new Date(breakStartTimeRef.current).toISOString() : null,
        currentPoaStart: newStatus === 'poa' ? transition.nowIso : null,
        currentSegmentStart: transition.nowIso,
      });
      const result = await updateSessionWithRetry(
        () => supabase
          .from('work_sessions')
          .update(updatePayload)
          .eq('id', sessionIdRef.current)
          .select()
          .single(),
        3,
      );
      if (!result.success) {
        console.warn('Status DB sync failed:', result.error);
      } else if (result.data) {
        setSessionData(result.data);
        sessionDataRef.current = result.data;
      }
    }

    await persistFromRefs();

    if (newStatus === 'working' || newStatus === 'poa') {
      await buildComplianceSchedule();
      if (newStatus === 'working' && isDrivingRef.current) {
        await buildDriveAlertSchedule();
      }
    }
  }, [applyElapsed, cancelScheduledComplianceNotifications, buildComplianceSchedule, buildDriveAlertSchedule, persistFromRefs, speakAlert, vibrateAlert]);

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
          shiftExtensionsUsedThisWeekRef.current = s.shiftExtensionsUsedThisWeek || 0;
          maxShiftTimeLimitRef.current = s.maxShiftTimeSeconds || MAX_SHIFT_TIME_13H;
          dailyRestSecondsBeforeShiftRef.current = s.dailyRestSecondsBeforeShift || 0;
          reducedDailyRestTakenRef.current = !!s.reducedDailyRestTaken;
          breakStartTimeRef.current = s.breakStartMs || 0;
          lastTickMsRef.current = s.lastTickMs || Date.now();
          syncStateFromRefs();
        }
        await refreshSession();
        if (statusRef.current === 'idle') {
          await cancelScheduledComplianceNotifications(true);
        } else {
          await buildComplianceSchedule();
          if (statusRef.current === 'working' && isDrivingRef.current) {
            await buildDriveAlertSchedule();
          }
        }
      } catch (e) { console.warn('restore failed:', e); }
    };
    restore();
  }, [userId, userStorageKey, syncStateFromRefs, refreshSession, cancelScheduledComplianceNotifications, buildComplianceSchedule, buildDriveAlertSchedule]);

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
        has15minBreak: breakTrackerRef.current.has15min,
        lastBreakDuration: lastBreakDurationUiRef.current,
        lastBreakEndTime: lastBreakEndTimeRef.current,
        maxDriveSeconds: MAX_DRIVE,
        maxWeeklyDriveSeconds: MAX_WEEKLY_DRIVE,
        maxShiftTimeSeconds: maxShiftTimeLimitRef.current,
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
    const currentMaxShiftTime = display.maxShiftTimeRemaining;
    const currentWeeklyDrive = display.weeklyDrivingRemaining;
    const currentShiftElapsed = display.shift;
    const prevWork = prevRemainingRef.current.work;
    const prevDrive = prevRemainingRef.current.drive;
    const prevDriveExtension = prevRemainingRef.current.driveExtension;
    const prevWeeklyDrive = prevRemainingRef.current.weeklyDrive;
    const crossedDown = (current: number, prev: number, threshold: number) => current <= threshold && prev > threshold;
    const crossedUp = (current: number, prev: number, threshold: number) => current >= threshold && prev < threshold;

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
    if (crossedUp(currentShiftElapsed, prevShiftElapsedRef.current, MAX_SHIFT_TIME_13H - 30 * 60)) {
      triggerImmediateAlert('shift13hLimitSoon');
    }
    if (crossedUp(currentShiftElapsed, prevShiftElapsedRef.current, MAX_SHIFT_TIME_13H)) {
      triggerImmediateAlert('shift13hLimitReached');
    }
    if (maxShiftTimeLimitRef.current > MAX_SHIFT_TIME_13H) {
      if (crossedUp(currentShiftElapsed, prevShiftElapsedRef.current, MAX_SHIFT_TIME_15H - 30 * 60)) {
        triggerImmediateAlert('shift15hLimitSoon');
      }
      if (crossedUp(currentShiftElapsed, prevShiftElapsedRef.current, MAX_SHIFT_TIME_15H)) {
        triggerImmediateAlert('shift15hLimitReached');
      }
    }
    prevShiftElapsedRef.current = currentShiftElapsed;

    prevRemainingRef.current = {
      work: currentWork,
      drive: currentDrive,
      driveExtension: currentDriveExtension,
      weeklyDrive: currentWeeklyDrive,
      maxShiftTime: currentMaxShiftTime,
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
          timerMode: timerModeRef.current,
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
      const [{ data: lastSession }, weeklyDrivingMins, weekSessions] = await Promise.all([
        supabase
          .from('work_sessions')
          .select('start_time,end_time,other_data')
          .eq('user_id', userId)
          .not('end_time', 'is', null)
          .order('end_time', { ascending: false })
          .limit(1)
          .maybeSingle(),
        workSessionService.fetchWeeklyDrivingMinutes(userId),
        workSessionService.fetchWeekSessions(userId),
      ]);

      syncShiftAllowanceState(weekSessions, new Date());
      weeklyDrivingAccumulatorRef.current = weeklyDrivingMins * 60;
      const reducedRestsUsedThisWeek = countReducedDailyRestsThisWeek(weekSessions, new Date());
      dailyRestSecondsBeforeShiftRef.current = 0;
      reducedDailyRestTakenRef.current = false;

      if (lastSession?.end_time) {
        const restSec = Math.max(0, Math.floor((Date.now() - new Date(lastSession.end_time).getTime()) / 1000));
        dailyRestSecondsBeforeShiftRef.current = restSec;
        reducedDailyRestTakenRef.current = isReducedDailyRest(restSec);
        const restWarningLevel = getDailyRestWarningLevel(restSec, reducedRestsUsedThisWeek);
        if (restWarningLevel === 'insufficient') await triggerImmediateAlert('warningLowRest');
        else if (restWarningLevel === 'reduced') await triggerImmediateAlert('warningReducedRest');
      }

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
      prevShiftElapsedRef.current = 0;
      setDisplay(deriveLiveDisplayState({
        nowMs,
        status: startedShift.status,
        segmentStartIso: startedShift.currentSegmentStart,
        workStartIso: startedShift.workStartTime,
        totals: startedShift.totals,
        legalBreakDisplayTotal: startedShift.legalBreakDisplayTotal,
        workCycle: startedShift.workCycle,
        drivingCycle: startedShift.drivingCycle,
        isDriving: startedShift.isDriving,
        timerMode: startedShift.timerMode,
        weeklyDrivingAccumulator: weeklyDrivingAccumulatorRef.current,
        breakStartMs: startedShift.breakStartMs,
        has15minBreak: startedShift.breakTracker.has15min,
        lastBreakDuration: startedShift.lastBreakDuration,
        lastBreakEndTime: startedShift.lastBreakEndTime,
        maxDriveSeconds: MAX_DRIVE,
        maxWeeklyDriveSeconds: MAX_WEEKLY_DRIVE,
        maxShiftTimeSeconds: maxShiftTimeLimitRef.current,
      }));
      lastTickMsRef.current = startedShift.lastTickMs;
      drivingScoreRef.current = startedShift.drivingScore;
      movingSinceRef.current = 0;
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
        maxShiftTime: maxShiftTimeLimitRef.current,
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
        movingSinceRef.current = 0;
        stationarySinceRef.current = 0;
        lastSpeedKmhRef.current = 0;
        lastSpeedTsRef.current = 0;
        lastBreakDurationUiRef.current = 0;
        lastBreakEndTimeRef.current = 0;
        shiftExtensionsUsedThisWeekRef.current = 0;
        maxShiftTimeLimitRef.current = MAX_SHIFT_TIME_13H;
        dailyRestSecondsBeforeShiftRef.current = 0;
        reducedDailyRestTakenRef.current = false;
        prevShiftElapsedRef.current = 0;
        prevRemainingRef.current = {
          work: getMaxWorkSeconds('6h'),
          drive: MAX_DRIVE,
          driveExtension: MAX_DAILY_DRIVE_EXTENDED,
          weeklyDrive: MAX_WEEKLY_DRIVE,
          maxShiftTime: MAX_SHIFT_TIME_13H,
        };
        syncStateFromRefs();
        return;
      }

      sessionIdRef.current = data?.id || null;
      setSessionId(data?.id || null);
      const sessionWithRuleMetadata = {
        ...data,
        other_data: {
          ...(data?.other_data ?? {}),
          dailyRestSecondsBeforeShift: dailyRestSecondsBeforeShiftRef.current,
          reducedDailyRestTaken: reducedDailyRestTakenRef.current,
        },
      };
      setSessionData(sessionWithRuleMetadata);
      sessionDataRef.current = sessionWithRuleMetadata;

      await cancelScheduledComplianceNotifications(true);
      await persistFromRefs();
      await buildComplianceSchedule();
      speakAlert('audioShiftStarted');
      await promptBatteryOptimisationIfNeeded();
    } catch (e) { console.error('startWork error:', e); }
    finally { isStartingRef.current = false; setIsStarting(false); }
  }, [userId, timezone, persistFromRefs, syncStateFromRefs, buildComplianceSchedule, speakAlert, triggerImmediateAlert, syncShiftAllowanceState]);

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
    currentShift.other_data.dailyRestSecondsBeforeShift = dailyRestSecondsBeforeShiftRef.current;
    currentShift.other_data.reducedDailyRestTaken = reducedDailyRestTakenRef.current;
    const { score, violations } = calculateCompliance(history, currentShift as any);
    const shiftSummary = buildEndShiftSummary({
      finalTotals,
      score,
      violations,
    });

     setShiftSummaryData({
       ...shiftSummary,
       onConfirm: async () => {
         // ========== CRITICAL FIX: Guard against concurrent executions ==========
         if (isEndingRef.current) {
           console.warn('End shift already in progress, ignoring duplicate click');
           return;
         }
         isEndingRef.current = true;

         try {
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
             shiftMetadata: currentShift.other_data,
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
           // ========== CRITICAL FIX: Reset flag on error so user can retry ==========
           isEndingRef.current = false;
           return;
         }

        if (finalSessionData) sessionDataRef.current = finalSessionData;

        suppressDriveStopSyncRef.current = true;
        try {
          await cancelScheduledComplianceNotifications(true);
          await stopTracking();
          await cancelScheduledComplianceNotifications(true);

           const endedShift = createEndedShiftResetState(Date.now());
           statusRef.current = endedShift.status;
           sessionIdRef.current = endedShift.sessionId;
           timerModeRef.current = endedShift.timerMode;
           workStartRef.current = endedShift.workStartTime;
           segmentStartRef.current = endedShift.currentSegmentStart;
           // ========== CRITICAL FIX #1: Explicitly clear break state ==========
           breakStartTimeRef.current = 0;
           totalsRef.current = endedShift.totals;
          legalBreakDisplayTotalRef.current = endedShift.legalBreakDisplayTotal;
          workCycleRef.current = endedShift.workCycle;
          drivingCycleRef.current = endedShift.drivingCycle;
           breakTrackerRef.current = endedShift.breakTracker;
           breakStartTimeRef.current = endedShift.breakStartMs;
           weeklyDrivingAccumulatorRef.current = endedShift.weeklyDrivingAccumulator;
           shiftExtensionsUsedThisWeekRef.current = 0;
           maxShiftTimeLimitRef.current = MAX_SHIFT_TIME_13H;
           dailyRestSecondsBeforeShiftRef.current = 0;
           reducedDailyRestTakenRef.current = false;
           isDrivingRef.current = endedShift.isDriving;
           lastTickMsRef.current = endedShift.lastTickMs;
           drivingScoreRef.current = endedShift.drivingScore;
           movingSinceRef.current = 0;
           prevShiftElapsedRef.current = 0;
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
            maxShiftTime:
              endedShift.prevMaxShiftTimeRemaining ?? endedShift.prevSpreadRemaining ?? MAX_SHIFT_TIME_13H,
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
      } finally {
        isEndingRef.current = false;
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
