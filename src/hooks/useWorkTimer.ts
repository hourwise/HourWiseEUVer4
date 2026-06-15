import { useState, useEffect, useCallback, useRef } from 'react';
import { AppState, Vibration, Platform, Alert, Linking } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Speech from 'expo-speech';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
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
  getMaxWorkSeconds,
  toLocalDateString,
} from '../lib/tacho/timing';
import { ALERT_TEXT, type AlertKey } from '../lib/tacho/alerts';
import { ensureNotificationChannelsInitialized } from '../lib/notifications';
import {
  clearActiveTimerState,
  clearBackgroundAlertState,
  clearScheduledComplianceAlerts,
  loadActiveTimerState,
  clearScheduledDriveAlerts,
  appendTimerDiagnosticsRing,
  exportCombinedTimerDiagnostics,
  loadBackgroundTaskDiagnostics,
  loadScheduledComplianceAlerts,
  loadScheduledComplianceNotificationIds,
  loadScheduledDriveAlerts,
  loadScheduledDriveNotificationIds,
  appendMotionDiagnosticsRing,
  saveActiveTimerState,
  saveScheduledComplianceAlerts,
  saveScheduledDriveAlerts,
} from '../lib/tacho/runtimeStorage';
import type {
  MotionDiagnosticRecord,
  TimerDiagnosticRecord,
  TimerDiagnosticSnapshot,
} from '../lib/tacho/diagnostics';
import { deriveLiveDisplayState } from '../lib/tacho/display';
import {
  createInitialTachoState,
  createTachoStateFromPersisted,
  createTachoStateFromSessionRow,
  createTachoStateFromSnapshot,
  toPersistedTachoState,
  type TachoCommand,
  type TachoState,
} from '../lib/tacho/machine';
import {
  processAccelerometerMotionSample,
  processLocationMotionSample,
  type MotionDetectorConfig,
} from '../lib/tacho/motionDetector';
import { reduceTachoEvent } from '../lib/tacho/reducer';
import { deriveDisplayFromTachoState } from '../lib/tacho/selectors';
import {
  buildEndSessionRequest,
  createEndShiftSummaryState,
  getEndShiftConfirmationError,
  setEndShiftSummaryConfirming,
} from '../lib/tacho/endShift';
import {
  createInitialDisplayState,
  createStartedShiftState,
} from '../lib/tacho/lifecycle';
import {
  chooseResumeRehydrationState,
} from '../lib/tacho/rehydration';
import { clearAllHourwiseTimerNotifications } from '../lib/tacho/notificationCleanup';
import {
  shouldRunDebouncedResumeRefresh,
  shouldRunInitialRestore,
} from '../lib/tacho/appStateGuards';
import {
  buildDurableBackgroundLocationOptions,
  hasDurableBackgroundLocationOptions,
} from '../lib/tacho/backgroundLocationOptions';
import { buildEndShiftSnapshot } from '../lib/tacho/snapshot';
import {
  buildSessionSyncPayload,
  type SessionSyncReason,
} from '../lib/tacho/sessionPayloads';
import {
  countReducedDailyRestsThisWeek,
  getDailyRestWarningLevel,
  getShiftExtensionAllowanceState,
  isReducedDailyRest,
  type SpreadSessionLike,
} from '../lib/tacho/spread';
import {
} from '../lib/tacho/transitions';
import type {
  BreakTracker,
  DisplayState,
  EndShiftSummaryState,
  PersistedState,
  ScheduledAlertDescriptor,
  ScheduledAlertScope,
  SessionOtherData,
  TimerMode,
  Totals,
  WorkStatus,
} from '../lib/tacho/types';
import { workSessionService } from '../services/workSessionService';
import { workSessionSegmentService } from '../services/workSessionSegmentService';
import {
  buildCriticalTimerWriteId,
  offlineQueueService,
} from '../services/offlineQueueService';
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
const MOTION_DETECTOR_CONFIG: MotionDetectorConfig = {
  stillThresholdKmh: STILL_SPEED_THRESHOLD_KMH,
  lowSpeedStopThresholdKmh: LOW_SPEED_STOP_THRESHOLD_KMH,
  drivingThresholdKmh: DRIVING_SPEED_THRESHOLD_KMH,
  immediateStartThresholdKmh: DRIVING_IMMEDIATE_START_THRESHOLD_KMH,
  movingConfirmMs: MOVING_CONFIRM_MS,
  stationaryConfirmMs: STATIONARY_CONFIRM_MS,
  accelScoreMax: ACCEL_SCORE_MAX,
  gpsStaleThresholdMs: GPS_STALE_THRESHOLD_MS,
  motionMagnitudeThreshold: MOTION_MAGNITUDE_THRESHOLD,
  accelDriveThreshold: ACCEL_DRIVE_THRESHOLD,
  accelStopThreshold: ACCEL_STOP_THRESHOLD,
};

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

type DesiredScheduledAlert = Omit<ScheduledAlertDescriptor, 'identifier' | 'scheduledAtMs'>;

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

const createClientUuid = (): string =>
  'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const rand = Math.floor(Math.random() * 16);
    const value = char === 'x' ? rand : (rand & 0x3) | 0x8;
    return value.toString(16);
  });

const summarizeDiagnosticError = (error: unknown): string => {
  if (!error) return '';
  if (typeof error === 'string') return error.slice(0, 240);
  if (error instanceof Error) return error.message.slice(0, 240);
  const maybeMessage = (error as any)?.message ?? (error as any)?.error_description;
  if (typeof maybeMessage === 'string') return maybeMessage.slice(0, 240);
  try {
    return JSON.stringify(error).slice(0, 240);
  } catch {
    return String(error).slice(0, 240);
  }
};

type ShiftSummaryModalState = EndShiftSummaryState & {
  onConfirm: () => Promise<boolean>;
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
  const [isDrivingDetectionPaused, setIsDrivingDetectionPaused] = useState(false);
  const [isStarting, setIsStarting] = useState(false);
  const [history, setHistory] = useState<any[]>([]);
  const [display, setDisplay] = useState<DisplayState>({
    ...createInitialDisplayState(),
  });
  const [shiftSummaryData, setShiftSummaryData] = useState<ShiftSummaryModalState | null>(null);
  const [criticalTimerWriteHealth, setCriticalTimerWriteHealth] = useState({
    pendingCount: 0,
    oldestPendingAgeMs: 0,
    pendingTooLong: false,
  });

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
  const isDrivingDetectionPausedRef = useRef<boolean>(false);
  const isStartingRef = useRef<boolean>(false);
  const isEndingRef = useRef<boolean>(false);
  const isPersistingRef = useRef<boolean>(false);
  const isRefreshingSessionRef = useRef<boolean>(false);
  const suppressDriveStopSyncRef = useRef<boolean>(false);
  const lastDbCheckpointAtRef = useRef<number | null>(null);
  const activitySegmentStartRef = useRef<string | null>(null);
  const appStateRef = useRef(AppState.currentState);
  const lastResumeRefreshAtRef = useRef<number>(0);
  const resumeRefreshPromiseRef = useRef<Promise<void> | null>(null);
  const lastRestoreKeyRef = useRef<string | null>(null);
   const lastBreakDurationUiRef = useRef<number>(0);
   const lastBreakEndTimeRef = useRef<number>(0);
   const breakStartTimeRef = useRef<number>(0); // Track actual break start time for accurate duration calculation

   const scheduledComplianceAlertsRef = useRef<ScheduledAlertDescriptor[]>([]);
  const scheduledDriveAlertsRef = useRef<ScheduledAlertDescriptor[]>([]);
  const ukVoiceIdentifierRef = useRef<string | null>(null);
  const locationSubRef = useRef<Location.LocationSubscription | null>(null);
  const accelSubRef = useRef<any>(null);
  const lastSpeedKmhRef = useRef<number>(0);
  const lastSpeedTsRef = useRef<number>(0);
  const lastLocationTsRef = useRef<number>(0);
  const lastLatitudeRef = useRef<number | null>(null);
  const lastLongitudeRef = useRef<number | null>(null);
  const lastAccuracyMRef = useRef<number | null>(null);
  const lastComputedSpeedKmhRef = useRef<number | null>(null);
  const lastSelectedSpeedSourceRef = useRef<'gps' | 'computed' | 'none'>('none');
  const drivingScoreRef = useRef<number>(0);
  const movingSinceRef = useRef<number>(0);
  const stationarySinceRef = useRef<number>(0);
  const pendingMotionTransitionTypeRef = useRef<'moving' | 'stationary' | null>(null);
  const pendingMotionTransitionStartedAtRef = useRef<number>(0);
  const prevShiftElapsedRef = useRef<number>(0);
  const prevRemainingRef = useRef({
    work: getMaxWorkSeconds('6h'),
    drive: MAX_DRIVE,
    driveExtension: MAX_DAILY_DRIVE_EXTENDED,
    weeklyDrive: MAX_WEEKLY_DRIVE,
    maxShiftTime: MAX_SHIFT_TIME_13H,
  });

  const getActivitySegmentStartFromSession = useCallback((
    session: any,
    persistedState?: PersistedState | null,
  ): string | null => {
    if (
      persistedState?.activitySegmentStartTime &&
      persistedState.sessionId === session.id &&
      persistedState.workStartTime === session.start_time
    ) {
      return persistedState.activitySegmentStartTime;
    }

    const otherData = (session.other_data ?? null) as SessionOtherData | null;
    if (session.status === 'break') {
      return otherData?.activitySegmentStartTime || session.current_break_start || session.start_time;
    }
    if (session.status === 'poa') {
      return otherData?.activitySegmentStartTime || session.current_poa_start || session.start_time;
    }
    return otherData?.activitySegmentStartTime || session.start_time;
  }, []);

  useEffect(() => { ensureNotificationSetup(); }, []);

  const syncStateFromRefs = useCallback(() => {
    setStatus(statusRef.current);
    setSessionId(sessionIdRef.current);
    setTimerMode(timerModeRef.current);
    setWorkStartTime(workStartRef.current);
    setCurrentSegmentStart(segmentStartRef.current);
    setIsDriving(isDrivingRef.current);
    setIsDrivingDetectionPaused(isDrivingDetectionPausedRef.current);
  }, []);

  const syncShiftAllowanceState = useCallback((sessions: SpreadSessionLike[], forDate: Date) => {
    const shiftAllowance = getShiftExtensionAllowanceState(sessions, forDate);
    shiftExtensionsUsedThisWeekRef.current = shiftAllowance.used;
    maxShiftTimeLimitRef.current = shiftAllowance.maxShiftTimeSeconds;
  }, []);

  const applyMachineStateToRefs = useCallback((machineState: TachoState) => {
    statusRef.current = machineState.status;
    sessionIdRef.current = machineState.sessionId;
    timerModeRef.current = machineState.timerMode;
    workStartRef.current = machineState.workStartTime;
    segmentStartRef.current = machineState.currentSegmentStart;
    totalsRef.current = machineState.totals;
    legalBreakDisplayTotalRef.current = machineState.legalBreakDisplayTotal;
    workCycleRef.current = machineState.workCycle;
    drivingCycleRef.current = machineState.drivingCycle;
    breakTrackerRef.current = { has15min: machineState.has15minBreak };
    isDrivingRef.current = machineState.isDriving;
    weeklyDrivingAccumulatorRef.current = machineState.weeklyDrivingAccumulator;
    shiftExtensionsUsedThisWeekRef.current = machineState.shiftExtensionsUsedThisWeek;
    maxShiftTimeLimitRef.current = machineState.maxShiftTimeSeconds;
    dailyRestSecondsBeforeShiftRef.current = machineState.dailyRestSecondsBeforeShift;
    reducedDailyRestTakenRef.current = machineState.reducedDailyRestTaken;
    breakStartTimeRef.current = machineState.breakStartMs;
    lastTickMsRef.current = machineState.lastTickMs;
    lastBreakDurationUiRef.current = machineState.lastBreakDuration;
    lastBreakEndTimeRef.current = machineState.lastBreakEndTime;
    lastSpeedKmhRef.current = machineState.motion.lastSpeedKmh;
    lastSpeedTsRef.current = machineState.motion.lastSpeedTs;
    lastLocationTsRef.current = machineState.motion.lastLocationTs;
    lastLatitudeRef.current = machineState.motion.lastLatitude;
    lastLongitudeRef.current = machineState.motion.lastLongitude;
    lastAccuracyMRef.current = machineState.motion.lastAccuracyM;
    lastComputedSpeedKmhRef.current = machineState.motion.lastComputedSpeedKmh;
    lastSelectedSpeedSourceRef.current = machineState.motion.lastSelectedSpeedSource;
    drivingScoreRef.current = machineState.motion.drivingScore;
    movingSinceRef.current = machineState.motion.movingSinceMs;
    stationarySinceRef.current = machineState.motion.stationarySinceMs;
    pendingMotionTransitionTypeRef.current = machineState.motion.pendingTransitionType;
    pendingMotionTransitionStartedAtRef.current = machineState.motion.pendingTransitionStartedAtMs;
    prevShiftElapsedRef.current = machineState.alerts.prevShiftElapsed;
    prevRemainingRef.current = machineState.alerts.prevRemaining;
  }, []);

  const createMachineStateFromRefs = useCallback((nowMs: number = Date.now()): TachoState =>
    createTachoStateFromSnapshot({
      status: statusRef.current,
      sessionId: sessionIdRef.current,
      timerMode: timerModeRef.current,
      workStartTime: workStartRef.current,
      currentSegmentStart: segmentStartRef.current,
      totals: totalsRef.current,
      legalBreakDisplayTotal: legalBreakDisplayTotalRef.current,
      workCycle: workCycleRef.current,
      drivingCycle: drivingCycleRef.current,
      has15minBreak: breakTrackerRef.current.has15min,
      isDriving: isDrivingRef.current,
      breakStartMs: breakStartTimeRef.current,
      weeklyDrivingAccumulator: weeklyDrivingAccumulatorRef.current,
      shiftExtensionsUsedThisWeek: shiftExtensionsUsedThisWeekRef.current,
      maxShiftTimeSeconds: maxShiftTimeLimitRef.current,
      dailyRestSecondsBeforeShift: dailyRestSecondsBeforeShiftRef.current,
      reducedDailyRestTaken: reducedDailyRestTakenRef.current,
      lastTickMs: lastTickMsRef.current || nowMs,
      lastBreakDuration: lastBreakDurationUiRef.current,
      lastBreakEndTime: lastBreakEndTimeRef.current,
      motion: {
        lastSpeedKmh: lastSpeedKmhRef.current,
        lastSpeedTs: lastSpeedTsRef.current,
        lastLocationTs: lastLocationTsRef.current,
        lastLatitude: lastLatitudeRef.current,
        lastLongitude: lastLongitudeRef.current,
        lastAccuracyM: lastAccuracyMRef.current,
        lastComputedSpeedKmh: lastComputedSpeedKmhRef.current,
        lastSelectedSpeedSource: lastSelectedSpeedSourceRef.current,
        drivingScore: drivingScoreRef.current,
        movingSinceMs: movingSinceRef.current,
        stationarySinceMs: stationarySinceRef.current,
        pendingTransitionType: pendingMotionTransitionTypeRef.current,
        pendingTransitionStartedAtMs: pendingMotionTransitionStartedAtRef.current,
      },
      alerts: {
        prevShiftElapsed: prevShiftElapsedRef.current,
        prevRemaining: prevRemainingRef.current,
      },
    }),
  []);

  const buildTimerDiagnosticSnapshot = useCallback((): TimerDiagnosticSnapshot => ({
    status: statusRef.current,
    sessionId: sessionIdRef.current,
    workStartTime: workStartRef.current,
    currentSegmentStart: segmentStartRef.current,
    activitySegmentStartTime: activitySegmentStartRef.current,
    totals: { ...totalsRef.current },
    legalBreakDisplayTotal: legalBreakDisplayTotalRef.current,
    workCycle: workCycleRef.current,
    drivingCycle: drivingCycleRef.current,
    timerMode: timerModeRef.current,
    isDriving: isDrivingRef.current,
    breakStartMs: breakStartTimeRef.current,
    lastTickMs: lastTickMsRef.current,
    lastCheckpointAtMs: lastDbCheckpointAtRef.current,
  }), []);

  const appendTimerDiagnostic = useCallback((
    record: Omit<TimerDiagnosticRecord, 'ts' | 'sessionId'> & {
      sessionId?: string | null;
    },
  ) => {
    appendTimerDiagnosticsRing({
      ...record,
      ts: Date.now(),
      sessionId: record.sessionId ?? sessionIdRef.current,
    }).catch(e => console.warn('Timer diagnostic save failed:', e));
  }, []);

  const resetDrivingMotionState = useCallback(() => {
    drivingScoreRef.current = 0;
    movingSinceRef.current = 0;
    stationarySinceRef.current = 0;
    lastSpeedKmhRef.current = 0;
    lastSpeedTsRef.current = 0;
    lastLocationTsRef.current = 0;
    lastLatitudeRef.current = null;
    lastLongitudeRef.current = null;
    lastAccuracyMRef.current = null;
    lastComputedSpeedKmhRef.current = null;
    lastSelectedSpeedSourceRef.current = 'none';
    pendingMotionTransitionTypeRef.current = null;
    pendingMotionTransitionStartedAtRef.current = 0;
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
          vibrationPattern: [0, 250, 250, 250],
          data: {
            hourwiseAlert: true,
            alertKey,
            kind: 'immediate',
            channelId: cfg.channelId,
          },
        } as any,
        trigger: null,
      });
    } catch (e) { console.error('Immediate notification failed:', e); }
  }, [speakAlert, vibrateAlert]);

  const fetchHistory = useCallback(async () => {
    if (!userId) return;
    const endDate = new Date();
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - 28);
    const data = await workSessionService.fetchSessionsForDateRange(userId, toLocalDateString(startDate), toLocalDateString(endDate));
    if (data) setHistory(data.filter((s: any) => s.end_time !== null));
  }, [userId]);

  const buildScheduleKey = useCallback((
    scope: ScheduledAlertScope,
    alertKey: AlertKey,
    fireDateMs: number,
  ) => `${scope}:${alertKey}:${Math.floor(fireDateMs / 1000)}`, []);

  const extractScheduledAlertDescriptor = useCallback((request: any) => {
    const data = request?.content?.data as Record<string, any> | undefined;
    if (!data?.hourwiseAlert) return null;
    if (data.scope !== 'compliance' && data.scope !== 'drive') return null;
    if (!data.alertKey || !data.scheduleKey || !data.channelId) return null;

    const fireDateMs = Number(data.fireDateMs);
    if (!Number.isFinite(fireDateMs)) return null;

    const secondsFromNow = Number(data.secondsFromNow);
    const scheduledAtMs = Number(data.scheduledAtMs);

    return {
      identifier: request.identifier,
      scope: data.scope as ScheduledAlertScope,
      alertKey: data.alertKey as AlertKey,
      scheduleKey: data.scheduleKey as string,
      fireDateMs,
      secondsFromNow: Number.isFinite(secondsFromNow)
        ? secondsFromNow
        : Math.max(0, Math.floor((fireDateMs - Date.now()) / 1000)),
      channelId: data.channelId as string,
      scheduledAtMs: Number.isFinite(scheduledAtMs) ? scheduledAtMs : Date.now(),
    } satisfies ScheduledAlertDescriptor;
  }, []);

  const cancelAllTrackedHourwiseAlerts = useCallback(async () => {
    await clearAllHourwiseTimerNotifications();
  }, []);

  const setScopeScheduledAlerts = useCallback((
    scope: ScheduledAlertScope,
    alerts: ScheduledAlertDescriptor[],
  ) => {
    if (scope === 'compliance') {
      scheduledComplianceAlertsRef.current = alerts;
      return;
    }
    scheduledDriveAlertsRef.current = alerts;
  }, []);

  const saveScopeScheduledAlerts = useCallback(async (
    scope: ScheduledAlertScope,
    alerts: ScheduledAlertDescriptor[],
  ) => {
    setScopeScheduledAlerts(scope, alerts);
    if (scope === 'compliance') {
      await saveScheduledComplianceAlerts(alerts);
      return;
    }
    await saveScheduledDriveAlerts(alerts);
  }, [setScopeScheduledAlerts]);

  const clearScopeScheduledAlerts = useCallback(async (scope: ScheduledAlertScope) => {
    setScopeScheduledAlerts(scope, []);
    if (scope === 'compliance') {
      await clearScheduledComplianceAlerts();
      return;
    }
    await clearScheduledDriveAlerts();
  }, [setScopeScheduledAlerts]);

  const logNotificationDiagnostics = useCallback(async (context: string) => {
    try {
      const [
        permissions,
        scheduledRequests,
        persistedComplianceAlerts,
        persistedDriveAlerts,
        backgroundDiagnostics,
        channels,
      ] = await Promise.all([
        Notifications.getPermissionsAsync(),
        Notifications.getAllScheduledNotificationsAsync().catch(() => [] as any[]),
        loadScheduledComplianceAlerts(),
        loadScheduledDriveAlerts(),
        loadBackgroundTaskDiagnostics(),
        Platform.OS === 'android'
          ? Notifications.getNotificationChannelsAsync().catch(() => [] as any[])
          : Promise.resolve([] as any[]),
      ]);

      console.log(`[notifications:${context}]`, JSON.stringify({
        permissionStatus: permissions.status,
        permissionGranted: permissions.granted,
        canAskAgain: permissions.canAskAgain,
        scheduledNotificationCount: scheduledRequests.length,
        persistedComplianceCount: persistedComplianceAlerts.length,
        persistedDriveCount: persistedDriveAlerts.length,
        channelCount: channels.length,
        channels: channels.map((channel: any) => ({
          id: channel.id,
          importance: channel.importance,
          bypassDnd: channel.bypassDnd,
          sound: channel.sound,
        })),
        lastBackgroundTaskRunAtMs: backgroundDiagnostics?.lastRunAtMs ?? null,
        lastBackgroundTaskSpeedKmh: backgroundDiagnostics?.lastSpeedKmh ?? null,
        lastBackgroundAlertKey: backgroundDiagnostics?.lastTriggeredAlertKey ?? null,
        lastBackgroundPersistedStatus: backgroundDiagnostics?.persistedStatus ?? null,
      }));
    } catch (e) {
      console.warn(`Notification diagnostics failed (${context}):`, e);
    }
  }, []);

  const cancelScheduledAlertsForScope = useCallback(async (scope: ScheduledAlertScope) => {
    const [persistedAlerts, legacyIds, scheduledRequests] = await Promise.all([
      scope === 'compliance' ? loadScheduledComplianceAlerts() : loadScheduledDriveAlerts(),
      scope === 'compliance'
        ? loadScheduledComplianceNotificationIds()
        : loadScheduledDriveNotificationIds(),
      Notifications.getAllScheduledNotificationsAsync().catch(() => [] as any[]),
    ]);

    const currentAlerts = scope === 'compliance'
      ? scheduledComplianceAlertsRef.current
      : scheduledDriveAlertsRef.current;

    const scheduledScopeAlerts = scheduledRequests
      .map(request => extractScheduledAlertDescriptor(request))
      .filter((alert): alert is ScheduledAlertDescriptor => !!alert && alert.scope === scope);

    const identifiers = new Set([
      ...legacyIds,
      ...persistedAlerts.map(alert => alert.identifier),
      ...currentAlerts.map(alert => alert.identifier),
      ...scheduledScopeAlerts.map(alert => alert.identifier),
    ]);

    await Promise.all(
      [...identifiers].map(identifier =>
        Notifications.cancelScheduledNotificationAsync(identifier).catch(() => {})
      )
    );

    await clearScopeScheduledAlerts(scope);
    appendTimerDiagnostic({
      event: 'alerts',
      source: 'cancel_scope',
      reason: scope,
      snapshotAfter: buildTimerDiagnosticSnapshot(),
      success: true,
      details: {
        scope,
        cancelledIdentifierCount: identifiers.size,
      },
    });
  }, [
    appendTimerDiagnostic,
    buildTimerDiagnosticSnapshot,
    clearScopeScheduledAlerts,
    extractScheduledAlertDescriptor,
  ]);

  const cancelAllScheduledAlertNotifications = useCallback(async (
    options?: { clearBackgroundState?: boolean },
  ) => {
    await cancelScheduledAlertsForScope('compliance');
    await cancelScheduledAlertsForScope('drive');
    await cancelAllTrackedHourwiseAlerts();
    if (options?.clearBackgroundState) {
      await clearBackgroundAlertState();
    }
    appendTimerDiagnostic({
      event: 'alerts',
      source: 'cancel_all',
      reason: options?.clearBackgroundState ? 'clear_background_state' : 'timer_alerts_only',
      snapshotAfter: buildTimerDiagnosticSnapshot(),
      success: true,
    });
  }, [
    appendTimerDiagnostic,
    buildTimerDiagnosticSnapshot,
    cancelAllTrackedHourwiseAlerts,
    cancelScheduledAlertsForScope,
  ]);

  const scheduleDesiredAlert = useCallback(async (
    desiredAlert: DesiredScheduledAlert,
  ) => {
    const cfg = ALERT_TEXT[desiredAlert.alertKey];
    const scheduledAtMs = Date.now();
    const identifier = await Notifications.scheduleNotificationAsync({
      content: {
        title: i18n.t(cfg.titleKey),
        body: i18n.t(cfg.bodyKey),
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        categoryIdentifier: 'alarm',
        channelId: cfg.channelId,
        vibrationPattern: [0, 250, 250, 250],
        data: {
          hourwiseAlert: true,
          scope: desiredAlert.scope,
          alertKey: desiredAlert.alertKey,
          scheduleKey: desiredAlert.scheduleKey,
          fireDateMs: desiredAlert.fireDateMs,
          secondsFromNow: desiredAlert.secondsFromNow,
          scheduledAtMs,
          channelId: desiredAlert.channelId,
        },
      } as any,
      trigger: {
        seconds: Math.max(1, Math.floor(desiredAlert.secondsFromNow)),
        channelId: desiredAlert.channelId,
      } as any,
    });

    return {
      ...desiredAlert,
      identifier,
      scheduledAtMs,
    } satisfies ScheduledAlertDescriptor;
  }, []);

  const reconcileScheduledAlerts = useCallback(async (
    scope: ScheduledAlertScope,
    desiredAlerts: DesiredScheduledAlert[],
    context: string,
  ) => {
    await ensureNotificationSetup();

    const scheduledRequests = await Notifications.getAllScheduledNotificationsAsync()
      .catch(() => [] as any[]);
    const scheduledScopeAlerts = scheduledRequests
      .map(request => extractScheduledAlertDescriptor(request))
      .filter((alert): alert is ScheduledAlertDescriptor => !!alert && alert.scope === scope);

    const desiredKeys = new Set(desiredAlerts.map(alert => alert.scheduleKey));
    const scheduledByKey = new Map<string, ScheduledAlertDescriptor[]>();
    for (const alert of scheduledScopeAlerts) {
      const bucket = scheduledByKey.get(alert.scheduleKey) ?? [];
      bucket.push(alert);
      scheduledByKey.set(alert.scheduleKey, bucket);
    }

    const staleAlerts = scheduledScopeAlerts.filter(alert => !desiredKeys.has(alert.scheduleKey));
    await Promise.all(
      staleAlerts.map(alert =>
        Notifications.cancelScheduledNotificationAsync(alert.identifier).catch(() => {})
      )
    );

    for (const alerts of scheduledByKey.values()) {
      if (alerts.length <= 1) continue;
      const [, ...duplicates] = alerts;
      await Promise.all(
        duplicates.map(alert =>
          Notifications.cancelScheduledNotificationAsync(alert.identifier).catch(() => {})
        )
      );
    }

    const nextPersistedAlerts: ScheduledAlertDescriptor[] = [];
    for (const desiredAlert of desiredAlerts) {
      const activeScheduledAlerts = (scheduledByKey.get(desiredAlert.scheduleKey) ?? [])
        .filter(alert => desiredKeys.has(alert.scheduleKey));
      if (activeScheduledAlerts.length > 0) {
        nextPersistedAlerts.push(activeScheduledAlerts[0]);
        continue;
      }

      try {
        nextPersistedAlerts.push(await scheduleDesiredAlert(desiredAlert));
      } catch (e) {
        console.warn(`Failed to schedule ${scope} alert ${desiredAlert.alertKey}:`, e);
      }
    }

    await saveScopeScheduledAlerts(scope, nextPersistedAlerts);
    appendTimerDiagnostic({
      event: 'alerts',
      source: context,
      reason: scope,
      snapshotAfter: buildTimerDiagnosticSnapshot(),
      success: true,
      details: {
        scope,
        desiredCount: desiredAlerts.length,
        persistedCount: nextPersistedAlerts.length,
        staleCount: staleAlerts.length,
      },
    });
    await logNotificationDiagnostics(context);
  }, [
    appendTimerDiagnostic,
    buildTimerDiagnosticSnapshot,
    extractScheduledAlertDescriptor,
    logNotificationDiagnostics,
    saveScopeScheduledAlerts,
    scheduleDesiredAlert,
  ]);

  const buildDriveAlertPlans = useCallback(() => {
    const st = statusRef.current;
    if (st !== 'working' || !isDrivingRef.current || isDrivingDetectionPausedRef.current) {
      return [] as DesiredScheduledAlert[];
    }

    const nowMs = Date.now();
    let inFlightDriving = 0;
    if (segmentStartRef.current) {
      const segStartMs = new Date(segmentStartRef.current).getTime();
      inFlightDriving = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
    }

    const currentDrivingCycle = drivingCycleRef.current + inFlightDriving;
    const remainingDrive = MAX_DRIVE - currentDrivingCycle;
    const totalDriving = totalsRef.current.driving + inFlightDriving;
    const remainingDriveExtension = MAX_DAILY_DRIVE_EXTENDED - totalDriving;
    const totalWeeklyDrive = weeklyDrivingAccumulatorRef.current + totalDriving;
    const remainingWeeklyDrive = MAX_WEEKLY_DRIVE - totalWeeklyDrive;
    const plannedAlerts: DesiredScheduledAlert[] = [];

    const pushIfNeeded = (remaining: number, threshold: number, alertKey: AlertKey) => {
      const secondsFromNow = remaining - threshold;
      if (secondsFromNow <= 0 || secondsFromNow > 86400) return;

      const cfg = ALERT_TEXT[alertKey];
      const fireDateMs = nowMs + Math.floor(secondsFromNow) * 1000;
      plannedAlerts.push({
        scope: 'drive',
        alertKey,
        scheduleKey: buildScheduleKey('drive', alertKey, fireDateMs),
        fireDateMs,
        secondsFromNow: Math.floor(secondsFromNow),
        channelId: cfg.channelId,
      });
    };

    pushIfNeeded(remainingDrive, 30 * 60, 'driveCycleWarn30mRemaining');
    pushIfNeeded(remainingDrive, 15 * 60, 'driveCycleWarn15mRemaining');
    pushIfNeeded(remainingDrive, 5 * 60, 'driveCycleWarn5mRemaining');
    pushIfNeeded(remainingDrive, 0, 'driveCycleLimitReached');
    pushIfNeeded(remainingDriveExtension, 30 * 60, 'driveExtensionWarn30mRemaining');
    pushIfNeeded(remainingDriveExtension, 15 * 60, 'driveExtensionWarn15mRemaining');
    pushIfNeeded(remainingDriveExtension, 5 * 60, 'driveExtensionWarn5mRemaining');
    pushIfNeeded(remainingDriveExtension, 0, 'driveExtensionLimitReached');
    pushIfNeeded(remainingWeeklyDrive, 60 * 60, 'weeklyDriveWarn1hRemaining');
    pushIfNeeded(remainingWeeklyDrive, 0, 'weeklyDriveLimitReached');

    return plannedAlerts;
  }, [buildScheduleKey]);

  const buildComplianceAlertPlans = useCallback(() => {
    const st = statusRef.current;
    if (st !== 'working' && st !== 'poa') return [] as DesiredScheduledAlert[];

    const nowMs = Date.now();
    let inFlightWork = 0;
    let inFlightDriving = 0;
    if (st === 'working' && segmentStartRef.current) {
      const segStartMs = new Date(segmentStartRef.current).getTime();
      const inFlightSec = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
      if (isDrivingRef.current) {
        inFlightDriving = inFlightSec;
      } else {
        inFlightWork = inFlightSec;
      }
    }

    const currentWork = workCycleRef.current + inFlightWork + inFlightDriving;
    const maxWork = getMaxWorkSeconds(timerModeRef.current);
    const remainingWork = maxWork - currentWork;
    const plannedAlerts: DesiredScheduledAlert[] = [];

    const pushIfNeeded = (remaining: number, threshold: number, alertKey: AlertKey) => {
      const secondsFromNow = remaining - threshold;
      if (secondsFromNow <= 0) return;

      const cfg = ALERT_TEXT[alertKey];
      const fireDateMs = nowMs + Math.floor(secondsFromNow) * 1000;
      plannedAlerts.push({
        scope: 'compliance',
        alertKey,
        scheduleKey: buildScheduleKey('compliance', alertKey, fireDateMs),
        fireDateMs,
        secondsFromNow: Math.floor(secondsFromNow),
        channelId: cfg.channelId,
      });
    };

    if (st === 'working') {
      pushIfNeeded(remainingWork, 30 * 60, 'workWarn30mRemaining');
      pushIfNeeded(remainingWork, 15 * 60, 'workWarn15mRemaining');
      pushIfNeeded(remainingWork, 5 * 60, 'workWarn5mRemaining');
      pushIfNeeded(remainingWork, 0, 'workLimitReached');
    }

    if (workStartRef.current) {
      const startMs = new Date(workStartRef.current).getTime();
      const regularRemaining = (startMs + MAX_SHIFT_TIME_13H * 1000 - nowMs) / 1000;
      pushIfNeeded(regularRemaining, 30 * 60, 'shift13hLimitSoon');
      pushIfNeeded(regularRemaining, 0, 'shift13hLimitReached');

      if (maxShiftTimeLimitRef.current > MAX_SHIFT_TIME_13H) {
        const extendedRemaining = (startMs + MAX_SHIFT_TIME_15H * 1000 - nowMs) / 1000;
        pushIfNeeded(extendedRemaining, 30 * 60, 'shift15hLimitSoon');
        pushIfNeeded(extendedRemaining, 0, 'shift15hLimitReached');
      }
    }

    return plannedAlerts;
  }, [buildScheduleKey]);

  const buildDriveAlertSchedule = useCallback(async () => {
    await reconcileScheduledAlerts('drive', buildDriveAlertPlans(), 'reconcile:drive');
  }, [buildDriveAlertPlans, reconcileScheduledAlerts]);

  const buildComplianceSchedule = useCallback(async () => {
    await reconcileScheduledAlerts(
      'compliance',
      buildComplianceAlertPlans(),
      'reconcile:compliance',
    );
  }, [buildComplianceAlertPlans, reconcileScheduledAlerts]);

  const seedAlertWindowFromState = useCallback((machineState: TachoState, nowMs: number) => {
    const displayState = deriveDisplayFromTachoState(machineState, nowMs);
    const segmentStartMs = machineState.currentSegmentStart
      ? new Date(machineState.currentSegmentStart).getTime()
      : nowMs;
    const inFlightDrivingSeconds =
      machineState.status === 'working' && machineState.isDriving && Number.isFinite(segmentStartMs)
        ? Math.max(0, Math.floor((nowMs - segmentStartMs) / 1000))
        : 0;
    const totalDrivingSeconds = machineState.totals.driving + inFlightDrivingSeconds;

    return {
      ...machineState,
      lastBreakDuration: displayState.lastBreakDuration,
      lastBreakEndTime: displayState.lastBreakEndTime,
      alerts: {
        prevShiftElapsed: displayState.shift,
        prevRemaining: {
          work: displayState.workTimeRemaining,
          drive: displayState.drivingTimeRemaining,
          driveExtension: MAX_DAILY_DRIVE_EXTENDED - totalDrivingSeconds,
          weeklyDrive: displayState.weeklyDrivingRemaining,
          maxShiftTime: displayState.maxShiftTimeRemaining,
        },
      },
    };
  }, []);

  const persistFromRefs = useCallback(async (options?: { forceDuringRefresh?: boolean }) => {
     if (!userStorageKey || isPersistingRef.current) return;
     if (isRefreshingSessionRef.current && !options?.forceDuringRefresh) return;
     if (isEndingRef.current && statusRef.current !== 'idle') return;
     isPersistingRef.current = true;
     const snapshotBefore = buildTimerDiagnosticSnapshot();
     try {
       const nowMs = Date.now();
       if (statusRef.current !== 'idle' && segmentStartRef.current) {
         // ========== CRITICAL FIX #4: Validate segment start before using ==========
         if (!isValidSegmentStart(segmentStartRef.current)) {
           console.warn('Invalid segmentStart, resetting to now:', segmentStartRef.current);
           appendTimerDiagnostic({
             event: 'local_persist',
             source: 'persistFromRefs',
             reason: 'invalid_segment_start',
             snapshotBefore,
             snapshotAfter: buildTimerDiagnosticSnapshot(),
             success: false,
             errorSummary: `Invalid segmentStart: ${segmentStartRef.current}`,
           });
           segmentStartRef.current = new Date(nowMs).toISOString();
           return;
         }
       }
       const machineState = createMachineStateFromRefs(nowMs);
       const normalizedState = statusRef.current === 'idle'
         ? machineState
         : reduceTachoEvent(machineState, { type: 'TIMER_TICK', nowMs }).state;

       applyMachineStateToRefs(normalizedState);
       const state: PersistedState = {
         ...toPersistedTachoState(normalizedState, userStorageKey, {
           userId,
           savedAtMs: nowMs,
           lastCheckpointAtMs: lastDbCheckpointAtRef.current,
           activitySegmentStartTime: activitySegmentStartRef.current,
         }),
         drivingDetectionPaused: isDrivingDetectionPausedRef.current,
       };
      if (state.status !== 'idle') {
        await saveActiveTimerState(state);
      } else {
        await clearActiveTimerState(userStorageKey);
        await clearBackgroundAlertState();
      }
      appendTimerDiagnostic({
        event: 'local_persist',
        source: 'persistFromRefs',
        reason: state.status !== 'idle' ? 'save_active_state' : 'clear_idle_state',
        statusBefore: snapshotBefore.status,
        statusAfter: normalizedState.status,
        snapshotBefore,
        snapshotAfter: buildTimerDiagnosticSnapshot(),
        success: true,
        details: {
          forceDuringRefresh: !!options?.forceDuringRefresh,
          stateVersion: state.stateVersion,
          lastSavedAtMs: state.lastSavedAtMs ?? null,
          lastCheckpointAtMs: state.lastCheckpointAtMs ?? null,
        },
      });
    } finally {
      isPersistingRef.current = false;
    }
  }, [
    appendTimerDiagnostic,
    applyMachineStateToRefs,
    buildTimerDiagnosticSnapshot,
    createMachineStateFromRefs,
    userId,
    userStorageKey,
  ]);

  const refreshCriticalTimerWriteHealth = useCallback(async () => {
    const health = await offlineQueueService.getHealth();
    setCriticalTimerWriteHealth(health);
    if (health.pendingTooLong) {
      console.warn('Critical timer writes have been pending too long:', health);
    }
    return health;
  }, []);

  const flushCriticalWrites = useCallback(async () => {
    try {
      await offlineQueueService.flushCriticalTimerWrites();
      await workSessionSegmentService.flushPending();
    } catch (e) {
      console.warn('Critical timer write flush failed:', e);
    }
    return refreshCriticalTimerWriteHealth();
  }, [refreshCriticalTimerWriteHealth]);

  const syncSessionToDb = useCallback(async (
    reason: SessionSyncReason,
    options?: { maxRetries?: number; logLabel?: string },
  ) => {
    if (!sessionIdRef.current) return null;
    if (
      reason === 'drive_stop' &&
      (suppressDriveStopSyncRef.current || statusRef.current !== 'working')
    ) {
      return null;
    }

    const nowMs = Date.now();
    const snapshotBefore = buildTimerDiagnosticSnapshot();
    const normalizedState =
      statusRef.current !== 'idle' && segmentStartRef.current
        ? reduceTachoEvent(createMachineStateFromRefs(nowMs), { type: 'TIMER_TICK', nowMs }).state
        : createMachineStateFromRefs(nowMs);

    applyMachineStateToRefs(normalizedState);

    const payload = buildSessionSyncPayload({
      reason,
      status: normalizedState.status,
      totals: normalizedState.totals,
      legalBreakDisplayTotal: normalizedState.legalBreakDisplayTotal,
      has15minBreak: normalizedState.has15minBreak,
      workCycle: normalizedState.workCycle,
      drivingCycle: normalizedState.drivingCycle,
      timerMode: normalizedState.timerMode,
      existingOtherData: sessionDataRef.current?.other_data,
      currentSegmentStart: normalizedState.currentSegmentStart,
      currentBreakStart:
        normalizedState.status === 'break'
          ? (activitySegmentStartRef.current || (
              normalizedState.breakStartMs > 0
                ? new Date(normalizedState.breakStartMs).toISOString()
                : normalizedState.currentSegmentStart
            ))
          : null,
      currentPoaStart:
        normalizedState.status === 'poa'
          ? (activitySegmentStartRef.current || normalizedState.currentSegmentStart)
          : null,
      breakStartMs: normalizedState.breakStartMs,
      isDriving: normalizedState.isDriving,
      activitySegmentStartTime: activitySegmentStartRef.current,
      nowMs,
    });

    const result = await updateSessionWithRetry(
      () => supabase
        .from('work_sessions')
        .update(payload)
        .eq('id', sessionIdRef.current)
        .select()
        .single(),
      options?.maxRetries ?? 3,
    );

    if (!result.success) {
      console.warn(options?.logLabel ?? `Session ${reason} DB sync failed:`, result.error);
      if (userId && sessionIdRef.current) {
        await offlineQueueService.enqueueCriticalTimerWrite({
          id: buildCriticalTimerWriteId({
            kind: 'update_session',
            sessionId: sessionIdRef.current,
            reason,
            at: reason === 'checkpoint' ? null : normalizedState.currentSegmentStart ?? nowMs,
          }),
          kind: 'update_session',
          sessionId: sessionIdRef.current,
          userId,
          payload,
        });
        await refreshCriticalTimerWriteHealth();
      }
      appendTimerDiagnostic({
        event: 'db_sync',
        source: 'syncSessionToDb',
        reason,
        statusBefore: snapshotBefore.status,
        statusAfter: normalizedState.status,
        snapshotBefore,
        snapshotAfter: buildTimerDiagnosticSnapshot(),
        success: false,
        errorSummary: summarizeDiagnosticError(result.error),
        details: {
          queuedOfflineWrite: !!userId && !!sessionIdRef.current,
          payloadStatus: (payload as any).status ?? null,
          totalWorkMinutes: (payload as any).total_work_minutes ?? null,
          totalBreakMinutes: (payload as any).total_break_minutes ?? null,
          totalPoaMinutes: (payload as any).total_poa_minutes ?? null,
          currentBreakStart: (payload as any).current_break_start ?? null,
          currentPoaStart: (payload as any).current_poa_start ?? null,
          otherDataCurrentSegmentStart: (payload as any).other_data?.currentSegmentStart ?? null,
          otherDataActivitySegmentStartTime: (payload as any).other_data?.activitySegmentStartTime ?? null,
        },
      });
    } else if (result.data) {
      lastDbCheckpointAtRef.current = nowMs;
      setSessionData(result.data);
      sessionDataRef.current = result.data;
      if (userStorageKey && normalizedState.status !== 'idle') {
        await saveActiveTimerState({
          ...toPersistedTachoState(normalizedState, userStorageKey, {
            userId,
            savedAtMs: Date.now(),
            lastCheckpointAtMs: nowMs,
            activitySegmentStartTime: activitySegmentStartRef.current,
          }),
          drivingDetectionPaused: isDrivingDetectionPausedRef.current,
        });
      }
      await flushCriticalWrites();
      appendTimerDiagnostic({
        event: 'db_sync',
        source: 'syncSessionToDb',
        reason,
        statusBefore: snapshotBefore.status,
        statusAfter: normalizedState.status,
        snapshotBefore,
        snapshotAfter: buildTimerDiagnosticSnapshot(),
        success: true,
        details: {
          payloadStatus: (payload as any).status ?? null,
          totalWorkMinutes: (payload as any).total_work_minutes ?? null,
          totalBreakMinutes: (payload as any).total_break_minutes ?? null,
          totalPoaMinutes: (payload as any).total_poa_minutes ?? null,
          currentBreakStart: (payload as any).current_break_start ?? null,
          currentPoaStart: (payload as any).current_poa_start ?? null,
          otherDataCurrentSegmentStart: (payload as any).other_data?.currentSegmentStart ?? null,
          otherDataActivitySegmentStartTime: (payload as any).other_data?.activitySegmentStartTime ?? null,
        },
      });
    }

    return result;
  }, [
    appendTimerDiagnostic,
    applyMachineStateToRefs,
    buildTimerDiagnosticSnapshot,
    createMachineStateFromRefs,
    flushCriticalWrites,
    refreshCriticalTimerWriteHealth,
    userId,
    userStorageKey,
  ]);

  const executeReducerCommands = useCallback(async (
    commands: TachoCommand[],
    options?: { skipPersist?: boolean; skipSyncSession?: boolean },
  ) => {
    const significantCommands = commands.filter(command => command.type !== 'persist');
    if (significantCommands.length > 0) {
      appendTimerDiagnostic({
        event: 'reducer_commands',
        source: 'executeReducerCommands',
        snapshotAfter: buildTimerDiagnosticSnapshot(),
        success: true,
        details: {
          commands: significantCommands.map(command => ({
            type: command.type,
            target: (command as any).target ?? null,
            reason: (command as any).reason ?? null,
            alertKey: (command as any).alertKey ?? null,
            speechKey: (command as any).speechKey ?? null,
          })),
          skipPersist: !!options?.skipPersist,
          skipSyncSession: !!options?.skipSyncSession,
        },
      });
    }

    for (const command of commands) {
      switch (command.type) {
        case 'persist':
          if (options?.skipPersist) break;
          await persistFromRefs();
          break;
        case 'cancel_alerts':
          if (command.target === 'all' || command.target === 'compliance') {
            await cancelScheduledAlertsForScope('compliance');
          }
          if (command.target === 'all' || command.target === 'drive') {
            await cancelScheduledAlertsForScope('drive');
          }
          break;
        case 'schedule_alerts':
          if (isEndingRef.current) break;
          if (
            (command.target === 'all' || command.target === 'compliance') &&
            (statusRef.current === 'working' || statusRef.current === 'poa')
          ) {
            await buildComplianceSchedule();
          }
          if (
            (command.target === 'all' || command.target === 'drive') &&
            statusRef.current === 'working' &&
            isDrivingRef.current
          ) {
            await buildDriveAlertSchedule();
          }
          break;
        case 'trigger_alert':
          await triggerImmediateAlert(command.alertKey);
          break;
        case 'speak_alert':
          speakAlert(command.speechKey);
          break;
        case 'sync_session':
          if (options?.skipSyncSession) break;
          if (command.reason !== 'end_shift') {
            await syncSessionToDb(command.reason);
          }
          break;
        default:
          break;
      }
    }
  }, [
    appendTimerDiagnostic,
    buildTimerDiagnosticSnapshot,
    persistFromRefs,
    cancelScheduledAlertsForScope,
    buildComplianceSchedule,
    buildDriveAlertSchedule,
    triggerImmediateAlert,
    speakAlert,
    syncSessionToDb,
  ]);

  const refreshSession = useCallback(async () => {
    if (!userId || isStartingRef.current || isRefreshingSessionRef.current) return;
    isRefreshingSessionRef.current = true;
    const refreshStartSnapshot = buildTimerDiagnosticSnapshot();
    let refreshSuccess = false;
    let refreshErrorSummary: string | null = null;
    appendTimerDiagnostic({
      event: 'resume_refresh',
      source: 'refreshSession',
      reason: 'start',
      snapshotBefore: refreshStartSnapshot,
      success: true,
    });
    try {
      while (isPersistingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const resumeNowMs = Date.now();
      const currentRuntimeState = statusRef.current !== 'idle' && segmentStartRef.current
        ? reduceTachoEvent(createMachineStateFromRefs(resumeNowMs), { type: 'TIMER_TICK', nowMs: resumeNowMs }).state
        : createMachineStateFromRefs(resumeNowMs);
      const persistedState = await loadActiveTimerState();
      const hasMatchingPersistedUserState =
        !!persistedState &&
        persistedState.userStorageKey === userStorageKey &&
        (!persistedState.userId || persistedState.userId === userId);

      await flushCriticalWrites();

      const { data, error } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('user_id', userId)
        .is('end_time', null)
        .maybeSingle();

      if (error) {
        const persistedRuntimeState =
          hasMatchingPersistedUserState && persistedState && persistedState.status !== 'idle'
            ? reduceTachoEvent(
                createTachoStateFromPersisted(persistedState, resumeNowMs),
                { type: 'TIMER_TICK', nowMs: resumeNowMs },
              ).state
            : null;
        const fallbackRuntimeState =
          currentRuntimeState.status !== 'idle' ? currentRuntimeState : persistedRuntimeState;
        if (fallbackRuntimeState && fallbackRuntimeState.status !== 'idle') {
          applyMachineStateToRefs(fallbackRuntimeState);
          setDisplay(deriveDisplayFromTachoState(fallbackRuntimeState, resumeNowMs));
          syncStateFromRefs();
          await persistFromRefs({ forceDuringRefresh: true });
        }
        appendTimerDiagnostic({
          event: 'restore',
          source: 'refreshSession',
          reason: 'db_error_fallback',
          statusBefore: refreshStartSnapshot.status,
          statusAfter: statusRef.current,
          snapshotBefore: refreshStartSnapshot,
          snapshotAfter: buildTimerDiagnosticSnapshot(),
          success: !!fallbackRuntimeState,
          errorSummary: summarizeDiagnosticError(error),
          details: {
            selectedSource: currentRuntimeState.status !== 'idle' ? 'current_runtime' : 'persisted_runtime',
            persistedStatePresent: !!persistedState,
          },
        });
        refreshSuccess = true;
        return;
      }

      if (!data) {
        const pendingWrites = await offlineQueueService.getQueue();
        const pendingStart = pendingWrites.find(
          write =>
            write.kind === 'start_session' &&
            write.userId === userId &&
            (
              write.sessionId === currentRuntimeState.sessionId ||
              write.sessionId === persistedState?.sessionId
            ),
        );
        const persistedRuntimeState =
          pendingStart &&
          hasMatchingPersistedUserState &&
          persistedState?.sessionId === pendingStart.sessionId
            ? reduceTachoEvent(
                createTachoStateFromPersisted(persistedState, resumeNowMs),
                { type: 'TIMER_TICK', nowMs: resumeNowMs },
              ).state
            : null;
        const queuedRuntimeState =
          pendingStart && currentRuntimeState.sessionId === pendingStart.sessionId
            ? currentRuntimeState
            : persistedRuntimeState;

        if (pendingStart && queuedRuntimeState && queuedRuntimeState.status !== 'idle') {
          applyMachineStateToRefs(queuedRuntimeState);
          setSessionData(pendingStart.payload);
          sessionDataRef.current = pendingStart.payload;
          activitySegmentStartRef.current =
            queuedRuntimeState.currentSegmentStart ||
            (pendingStart.payload.other_data as any)?.activitySegmentStartTime ||
            null;
          setDisplay(deriveDisplayFromTachoState(queuedRuntimeState, resumeNowMs));
          syncStateFromRefs();
          await persistFromRefs({ forceDuringRefresh: true });
          await refreshCriticalTimerWriteHealth();
          appendTimerDiagnostic({
            event: 'restore',
            source: 'refreshSession',
            reason: 'pending_start_restore',
            statusBefore: refreshStartSnapshot.status,
            statusAfter: queuedRuntimeState.status,
            snapshotBefore: refreshStartSnapshot,
            snapshotAfter: buildTimerDiagnosticSnapshot(),
            success: true,
            details: {
              selectedSource: currentRuntimeState.sessionId === pendingStart.sessionId
                ? 'current_runtime'
                : 'persisted_runtime',
            },
          });
          refreshSuccess = true;
          return;
        }

        applyMachineStateToRefs(createInitialTachoState(resumeNowMs));
        setSessionData(null);
        sessionDataRef.current = null;
        activitySegmentStartRef.current = null;
        isDrivingDetectionPausedRef.current = false;
        setIsDrivingDetectionPaused(false);
        setDisplay(createInitialDisplayState());
        syncStateFromRefs();
        await clearActiveTimerState(userStorageKey);
        await cancelAllScheduledAlertNotifications({ clearBackgroundState: true });
        appendTimerDiagnostic({
          event: 'restore',
          source: 'refreshSession',
          reason: 'no_active_db_session',
          statusBefore: refreshStartSnapshot.status,
          statusAfter: 'idle',
          snapshotBefore: refreshStartSnapshot,
          snapshotAfter: buildTimerDiagnosticSnapshot(),
          success: true,
        });
        refreshSuccess = true;
        return;
      }

      setSessionData(data);
      sessionDataRef.current = data;
      const hasMatchingPersistedSessionState =
        hasMatchingPersistedUserState &&
        persistedState?.sessionId === data.id &&
        persistedState.workStartTime === data.start_time;
      isDrivingDetectionPausedRef.current =
        hasMatchingPersistedSessionState && persistedState
          ? !!persistedState.drivingDetectionPaused
          : false;
      setIsDrivingDetectionPaused(isDrivingDetectionPausedRef.current);
      lastDbCheckpointAtRef.current =
        hasMatchingPersistedSessionState && persistedState
          ? (persistedState.lastCheckpointAtMs ?? null)
          : null;
      activitySegmentStartRef.current = getActivitySegmentStartFromSession(
        data,
        hasMatchingPersistedSessionState ? persistedState : null,
      );
      const persistedRuntimeState = hasMatchingPersistedSessionState && persistedState
        ? reduceTachoEvent(
            createTachoStateFromPersisted(persistedState, resumeNowMs),
            { type: 'TIMER_TICK', nowMs: resumeNowMs },
          ).state
        : null;
      const dbState = seedAlertWindowFromState(
        createTachoStateFromSessionRow(data, currentRuntimeState),
        resumeNowMs,
      );
      const reconciledState = chooseResumeRehydrationState({
        dbState,
        currentRuntimeState,
        persistedRuntimeState,
        sessionId: data.id,
        nowMs: resumeNowMs,
      });
      const selectedSource = reconciledState === dbState
        ? 'db'
        : reconciledState === currentRuntimeState
          ? 'current_runtime'
          : reconciledState === persistedRuntimeState
            ? 'persisted_runtime'
            : 'unknown';

      applyMachineStateToRefs(reconciledState);
      if (reconciledState !== dbState) {
        await syncSessionToDb('checkpoint', {
          maxRetries: 2,
          logLabel: 'Resume session state repair failed:',
        });
      }

      const nowMs = Date.now();

      const [weeklyDrivingMins, weekSessions] = await Promise.all([
        workSessionService.fetchWeeklyDrivingMinutes(userId),
        workSessionService.fetchWeekSessions(userId),
      ]);
      weeklyDrivingAccumulatorRef.current = weeklyDrivingMins * 60;
      syncShiftAllowanceState(weekSessions, new Date());

      const refreshedState = createMachineStateFromRefs(nowMs);
      const tickResult = reduceTachoEvent(refreshedState, { type: 'TIMER_TICK', nowMs });
      applyMachineStateToRefs(tickResult.state);

      syncStateFromRefs();
      appendTimerDiagnostic({
        event: 'restore',
        source: 'refreshSession',
        reason: 'active_db_session',
        statusBefore: refreshStartSnapshot.status,
        statusAfter: tickResult.state.status,
        snapshotBefore: refreshStartSnapshot,
        snapshotAfter: buildTimerDiagnosticSnapshot(),
        success: true,
        details: {
          selectedSource,
          dbStatus: data.status ?? null,
          hasMatchingPersistedSessionState,
          repairedDbFromLocal: reconciledState !== dbState,
        },
      });
      refreshSuccess = true;
    } catch (e) {
      refreshErrorSummary = summarizeDiagnosticError(e);
      console.warn('refreshSession failed:', e);
    }
    finally {
      appendTimerDiagnostic({
        event: 'resume_refresh',
        source: 'refreshSession',
        reason: 'finish',
        statusBefore: refreshStartSnapshot.status,
        statusAfter: statusRef.current,
        snapshotBefore: refreshStartSnapshot,
        snapshotAfter: buildTimerDiagnosticSnapshot(),
        success: refreshSuccess,
        errorSummary: refreshErrorSummary,
      });
      isRefreshingSessionRef.current = false;
    }
  }, [
    appendTimerDiagnostic,
    buildTimerDiagnosticSnapshot,
    userId,
    userStorageKey,
    syncStateFromRefs,
    syncShiftAllowanceState,
    createMachineStateFromRefs,
    applyMachineStateToRefs,
    cancelAllScheduledAlertNotifications,
    syncSessionToDb,
    seedAlertWindowFromState,
    getActivitySegmentStartFromSession,
    flushCriticalWrites,
    persistFromRefs,
    refreshCriticalTimerWriteHealth,
  ]);

  const commitAndFlipDriving = useCallback((
    nextDriving: boolean,
    onFlipped?: () => void,
    source: 'location' | 'accelerometer' | 'background' = 'location',
    options?: { bypassPause?: boolean; effectiveTransitionMs?: number | null },
  ): TachoState | null => {
    if (nextDriving && isDrivingDetectionPausedRef.current && !options?.bypassPause) return null;

    const nowMs = Date.now();
    const machineState = createMachineStateFromRefs(nowMs);
    const result = reduceTachoEvent(machineState, {
      type: 'DRIVING_DECISION_RECEIVED',
      nowMs,
      nextDriving,
      source,
      effectiveTransitionMs: options?.effectiveTransitionMs,
    });
    if (result.state.isDriving === machineState.isDriving && result.commands.length === 0) return null;

    applyMachineStateToRefs(result.state);
    syncStateFromRefs();
    onFlipped?.();

    executeReducerCommands(result.commands)
      .catch(e => console.warn('Driving command execution failed:', e));
    return result.state;
  }, [applyMachineStateToRefs, createMachineStateFromRefs, executeReducerCommands, syncStateFromRefs]);

  const exportTimerDiagnostics = useCallback(async () => {
    appendTimerDiagnostic({
      event: 'resume_refresh',
      source: 'exportTimerDiagnostics',
      reason: 'manual_export',
      snapshotAfter: buildTimerDiagnosticSnapshot(),
      success: true,
    });
    return exportCombinedTimerDiagnostics();
  }, [appendTimerDiagnostic, buildTimerDiagnosticSnapshot]);

  const toggleDrivingDetectionPause = useCallback(async () => {
    const nextPaused = !isDrivingDetectionPausedRef.current;
    isDrivingDetectionPausedRef.current = nextPaused;
    setIsDrivingDetectionPaused(nextPaused);
    resetDrivingMotionState();

    if (nextPaused) {
      if (statusRef.current === 'working' && isDrivingRef.current) {
        commitAndFlipDriving(false);
        return;
      }
      await persistFromRefs();
      return;
    }

    if (statusRef.current === 'working' && !isDrivingRef.current) {
      commitAndFlipDriving(true, undefined, 'location', { bypassPause: true });
      return;
    }

    await persistFromRefs();
  }, [commitAndFlipDriving, persistFromRefs, resetDrivingMotionState]);

   useEffect(() => {
     const sub = AppState.addEventListener('change', async (next) => {
       const prev = appStateRef.current;
       appStateRef.current = next;
       appendTimerDiagnostic({
         event: 'app_state',
         source: 'AppState',
         reason: `${prev}->${next}`,
         snapshotAfter: buildTimerDiagnosticSnapshot(),
         success: true,
         details: { previousAppState: prev, nextAppState: next },
       });

        if ((next === 'inactive' || next === 'background') && statusRef.current !== 'idle') {
         await persistFromRefs({ forceDuringRefresh: true });
         if (sessionIdRef.current) {
           try {
             await syncSessionToDb('checkpoint', {
               maxRetries: 2,
               logLabel: 'Background session checkpoint failed:',
             });
           } catch (e) { console.warn('Background session checkpoint failed:', e); }
         }
         return;
       }

       if (next !== 'active' || prev === 'active') return;
       if (
         statusRef.current !== 'idle' &&
         !shouldRunDebouncedResumeRefresh({
           nowMs: Date.now(),
           lastRefreshAtMs: lastResumeRefreshAtRef.current,
           isRefreshInFlight: !!resumeRefreshPromiseRef.current || isRefreshingSessionRef.current,
         })
       ) {
         return;
       }

       const resumeTask = (async () => {
         if (statusRef.current !== 'idle') {
           lastResumeRefreshAtRef.current = Date.now();
           await refreshSession();
           await buildComplianceSchedule();
           if (statusRef.current === 'working' && isDrivingRef.current && !isDrivingDetectionPausedRef.current) {
             await buildDriveAlertSchedule();
           } else {
             await cancelScheduledAlertsForScope('drive');
           }
         } else {
           await cancelAllScheduledAlertNotifications();
         }
         await logNotificationDiagnostics('resume');
         if (statusRef.current !== 'working') return;
         if (isDrivingDetectionPausedRef.current) return;
         try {
          const raw = await AsyncStorage.getItem(BG_SPEED_KEY);
          if (!raw) return;
          const { speedKmh, ts } = JSON.parse(raw);
          const nowMs = Date.now();
          const machineState = createMachineStateFromRefs(nowMs);
          const result = reduceTachoEvent(machineState, {
            type: 'BACKGROUND_SPEED_SAMPLE_RECEIVED',
            nowMs,
            speedKmh,
            sampleTs: ts,
          });
          if (result.state.isDriving !== machineState.isDriving || result.commands.length > 0) {
            applyMachineStateToRefs(result.state);
            syncStateFromRefs();
            await executeReducerCommands(result.commands);
          }
        } catch (e) { console.warn('BG speed reconciliation failed:', e); }
       })();

       resumeRefreshPromiseRef.current = resumeTask;
       try {
         await resumeTask;
       } finally {
         if (resumeRefreshPromiseRef.current === resumeTask) {
           resumeRefreshPromiseRef.current = null;
         }
       }
    });
    return () => sub.remove();
  }, [
    appendTimerDiagnostic,
    applyMachineStateToRefs,
    buildComplianceSchedule,
    buildDriveAlertSchedule,
    buildTimerDiagnosticSnapshot,
    cancelAllScheduledAlertNotifications,
    cancelScheduledAlertsForScope,
    createMachineStateFromRefs,
    executeReducerCommands,
    logNotificationDiagnostics,
    persistFromRefs,
    refreshSession,
    syncSessionToDb,
    syncStateFromRefs,
  ]);

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
        pendingMotionTransitionTypeRef.current = null;
        pendingMotionTransitionStartedAtRef.current = 0;
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
          if (isDrivingDetectionPausedRef.current) return;
          const receiptMs = Date.now();
          const sampleMs =
            typeof loc.timestamp === 'number' && Number.isFinite(loc.timestamp)
              ? loc.timestamp
              : receiptMs;
          const speedKmh =
            typeof loc.coords.speed === 'number' && Number.isFinite(loc.coords.speed)
              ? Math.max(0, loc.coords.speed * 3.6)
              : null;
          const previousDriving = isDrivingRef.current;
          const totalsBefore = { ...totalsRef.current };
          const movingSinceBefore = movingSinceRef.current;
          const stationarySinceBefore = stationarySinceRef.current;
          const result = processLocationMotionSample({
            nowMs: sampleMs,
            accuracy: loc.coords.accuracy ?? 9999,
            speedKmh,
            latitude: loc.coords.latitude,
            longitude: loc.coords.longitude,
            isDriving: isDrivingRef.current,
            motionState: {
              lastSpeedKmh: lastSpeedKmhRef.current,
              lastSpeedTs: lastSpeedTsRef.current,
              lastLocationTs: lastLocationTsRef.current,
              lastLatitude: lastLatitudeRef.current,
              lastLongitude: lastLongitudeRef.current,
              lastAccuracyM: lastAccuracyMRef.current,
              lastComputedSpeedKmh: lastComputedSpeedKmhRef.current,
              lastSelectedSpeedSource: lastSelectedSpeedSourceRef.current,
              drivingScore: drivingScoreRef.current,
              movingSinceMs: movingSinceRef.current,
              stationarySinceMs: stationarySinceRef.current,
              pendingTransitionType: pendingMotionTransitionTypeRef.current,
              pendingTransitionStartedAtMs: pendingMotionTransitionStartedAtRef.current,
            },
            config: MOTION_DETECTOR_CONFIG,
          });
          lastSpeedKmhRef.current = result.motionState.lastSpeedKmh;
          lastSpeedTsRef.current = result.motionState.lastSpeedTs;
          lastLocationTsRef.current = result.motionState.lastLocationTs;
          lastLatitudeRef.current = result.motionState.lastLatitude;
          lastLongitudeRef.current = result.motionState.lastLongitude;
          lastAccuracyMRef.current = result.motionState.lastAccuracyM;
          lastComputedSpeedKmhRef.current = result.motionState.lastComputedSpeedKmh;
          lastSelectedSpeedSourceRef.current = result.motionState.lastSelectedSpeedSource;
          movingSinceRef.current = result.motionState.movingSinceMs;
          stationarySinceRef.current = result.motionState.stationarySinceMs;
          drivingScoreRef.current = result.motionState.drivingScore;
          pendingMotionTransitionTypeRef.current = result.motionState.pendingTransitionType;
          pendingMotionTransitionStartedAtRef.current = result.motionState.pendingTransitionStartedAtMs;
          let totalsAfter = { ...totalsRef.current };
          let nextDriving = isDrivingRef.current;
          let reducerEventApplied: string | null = null;
          if (result.nextDriving !== null) {
            const reducedState = commitAndFlipDriving(result.nextDriving, undefined, 'location', {
              effectiveTransitionMs: result.drivingChangedAtMs,
            });
            if (reducedState) {
              totalsAfter = { ...reducedState.totals };
              nextDriving = reducedState.isDriving;
              reducerEventApplied = 'DRIVING_DECISION_RECEIVED';
            }
          }
          appendMotionDiagnosticsRing({
            receiptTimeMs: receiptMs,
            sampleTimeMs: sampleMs,
            appState: AppState.currentState === 'active'
              ? 'active'
              : AppState.currentState === 'background'
                ? 'background'
                : AppState.currentState === 'inactive'
                  ? 'inactive'
                  : 'unknown',
            source: 'foreground_location',
            gpsSpeedKmh: result.diagnostic.gpsSpeedKmh,
            computedSpeedKmh: result.diagnostic.computedSpeedKmh,
            selectedSpeedKmh: result.diagnostic.selectedSpeedKmh,
            selectedSpeedSource: result.diagnostic.selectedSpeedSource,
            accuracyM: result.diagnostic.accuracyM,
            previousDriving,
            nextDriving,
            movingSinceMs: result.motionState.movingSinceMs || movingSinceBefore,
            stationarySinceMs: result.motionState.stationarySinceMs || stationarySinceBefore,
            ignoredReason: result.diagnostic.ignoredReason,
            reducerEventApplied,
            totalsBefore,
            totalsAfter,
          }).catch(e => console.warn('Motion diagnostic save failed:', e));
        }
      );
      Accelerometer.setUpdateInterval(800);
      accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
        if (isDrivingDetectionPausedRef.current) return;
        const sampleMs = Date.now();
        const previousDriving = isDrivingRef.current;
        const totalsBefore = { ...totalsRef.current };
        const result = processAccelerometerMotionSample({
          nowMs: sampleMs,
          x,
          y,
          z,
          isDriving: isDrivingRef.current,
          motionState: {
            lastSpeedKmh: lastSpeedKmhRef.current,
            lastSpeedTs: lastSpeedTsRef.current,
            lastLocationTs: lastLocationTsRef.current,
            lastLatitude: lastLatitudeRef.current,
            lastLongitude: lastLongitudeRef.current,
            lastAccuracyM: lastAccuracyMRef.current,
            lastComputedSpeedKmh: lastComputedSpeedKmhRef.current,
            lastSelectedSpeedSource: lastSelectedSpeedSourceRef.current,
            drivingScore: drivingScoreRef.current,
            movingSinceMs: movingSinceRef.current,
            stationarySinceMs: stationarySinceRef.current,
            pendingTransitionType: pendingMotionTransitionTypeRef.current,
            pendingTransitionStartedAtMs: pendingMotionTransitionStartedAtRef.current,
          },
          config: MOTION_DETECTOR_CONFIG,
        });
        drivingScoreRef.current = result.motionState.drivingScore;
        let totalsAfter = { ...totalsRef.current };
        let nextDriving = isDrivingRef.current;
        let reducerEventApplied: string | null = null;
        if (result.nextDriving !== null) {
          const reducedState = commitAndFlipDriving(result.nextDriving, undefined, 'accelerometer', {
            effectiveTransitionMs: result.drivingChangedAtMs,
          });
          if (reducedState) {
            totalsAfter = { ...reducedState.totals };
            nextDriving = reducedState.isDriving;
            reducerEventApplied = 'DRIVING_DECISION_RECEIVED';
          }
        }
        appendMotionDiagnosticsRing({
          receiptTimeMs: sampleMs,
          sampleTimeMs: sampleMs,
          appState: AppState.currentState === 'active'
            ? 'active'
            : AppState.currentState === 'background'
              ? 'background'
              : AppState.currentState === 'inactive'
                ? 'inactive'
                : 'unknown',
          source: 'accelerometer',
          gpsSpeedKmh: result.diagnostic.gpsSpeedKmh,
          computedSpeedKmh: result.diagnostic.computedSpeedKmh,
          selectedSpeedKmh: result.diagnostic.selectedSpeedKmh,
          selectedSpeedSource: result.diagnostic.selectedSpeedSource,
          accuracyM: result.diagnostic.accuracyM,
          previousDriving,
          nextDriving,
          movingSinceMs: result.motionState.movingSinceMs,
          stationarySinceMs: result.motionState.stationarySinceMs,
          ignoredReason: result.diagnostic.ignoredReason,
          reducerEventApplied,
          totalsBefore,
          totalsAfter,
        }).catch(e => console.warn('Motion diagnostic save failed:', e));
      });
      if (bgStatus === 'granted') {
        const backgroundLocationOptions = buildDurableBackgroundLocationOptions({
          accuracy: Location.Accuracy.BestForNavigation,
          notificationTitle: i18n.t('notification.trackingTitle', 'HourWise active'),
          notificationBody: i18n.t('notification.trackingBody', 'Tracking work and driving time'),
        });
        const isBackgroundTaskStarted = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME);
        const existingBackgroundOptions = isBackgroundTaskStarted
          ? await TaskManager.getTaskOptionsAsync(LOCATION_TASK_NAME).catch(() => null)
          : null;
        if (
          isBackgroundTaskStarted &&
          !hasDurableBackgroundLocationOptions(existingBackgroundOptions)
        ) {
          await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
        }
        if (
          !isBackgroundTaskStarted ||
          !hasDurableBackgroundLocationOptions(existingBackgroundOptions)
        ) {
          await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, backgroundLocationOptions as any);
        }
      }
    } catch (e) { console.error('Tracking setup failed', e); }
  }, [commitAndFlipDriving]);

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (status === 'working' || status === 'poa') startTracking(); else stopTracking();
  }, [status]);

  const updateTotalsAndSwitchStatus = useCallback(async (newStatus: WorkStatus) => {
    await cancelAllScheduledAlertNotifications();
    while (isPersistingRef.current) { await new Promise(resolve => setTimeout(resolve, 50)); }

    const nowMs = Date.now();
    const transitionIso = new Date(nowMs).toISOString();
    const previousStatus = statusRef.current;
    const snapshotBefore = buildTimerDiagnosticSnapshot();
    const previousActivitySegmentStart =
      activitySegmentStartRef.current || workStartRef.current || segmentStartRef.current;
    const machineState = createMachineStateFromRefs(nowMs);
    const result = reduceTachoEvent(machineState, {
      type: 'STATUS_CHANGE_REQUESTED',
      nowMs,
      nextStatus: newStatus,
    });

    applyMachineStateToRefs(result.state);
    activitySegmentStartRef.current = transitionIso;
    syncStateFromRefs();
    vibrateAlert();
    appendTimerDiagnostic({
      event: 'status_change',
      source: 'updateTotalsAndSwitchStatus',
      reason: `${previousStatus}->${newStatus}`,
      statusBefore: previousStatus,
      statusAfter: result.state.status,
      snapshotBefore,
      snapshotAfter: buildTimerDiagnosticSnapshot(),
      success: true,
      details: {
        transitionTime: transitionIso,
        previousActivitySegmentStart,
        nextActivitySegmentStart: activitySegmentStartRef.current,
        commandTypes: result.commands.map(command => command.type),
      },
    });

    const syncCommand = result.commands.find(
      (command): command is Extract<TachoCommand, { type: 'sync_session' }> =>
        command.type === 'sync_session'
    );

    await persistFromRefs();
    if (syncCommand && syncCommand.reason !== 'end_shift') {
      await syncSessionToDb(syncCommand.reason, {
        maxRetries: 2,
        logLabel: `Immediate ${syncCommand.reason} sync failed:`,
      });
    }
    if (userId && sessionIdRef.current) {
      await workSessionSegmentService.recordStatusTransition({
        userId,
        sessionId: sessionIdRef.current,
        previousStatus,
        previousSegmentStart: previousActivitySegmentStart,
        nextStatus: newStatus,
        transitionTime: transitionIso,
      });
    }

    await executeReducerCommands(result.commands, {
      skipPersist: true,
      skipSyncSession: true,
    });
  }, [
    appendTimerDiagnostic,
    cancelAllScheduledAlertNotifications,
    createMachineStateFromRefs,
    applyMachineStateToRefs,
    buildTimerDiagnosticSnapshot,
    persistFromRefs,
    syncSessionToDb,
    syncStateFromRefs,
    vibrateAlert,
    executeReducerCommands,
    userId,
  ]);

  useEffect(() => {
    const restore = async () => {
      if (!userStorageKey || !userId) return;
      const restoreKey = `${userStorageKey}:${userId}`;
      if (
        !shouldRunInitialRestore({
          restoreKey,
          lastRestoreKey: lastRestoreKeyRef.current,
        })
      ) {
        return;
      }
      lastRestoreKeyRef.current = restoreKey;
      try {
        await refreshSession();
        if (statusRef.current === 'idle') {
          await cancelAllScheduledAlertNotifications({ clearBackgroundState: true });
        } else {
          await buildComplianceSchedule();
          if (statusRef.current === 'working' && isDrivingRef.current) {
            await buildDriveAlertSchedule();
          }
        }
        await logNotificationDiagnostics('restore');
      } catch (e) {
        lastRestoreKeyRef.current = null;
        console.warn('restore failed:', e);
      }
    };
    restore();
  }, [userId, userStorageKey, refreshSession, cancelAllScheduledAlertNotifications, buildComplianceSchedule, buildDriveAlertSchedule, logNotificationDiagnostics]);

  useEffect(() => { fetchHistory(); }, [fetchHistory]);

  useEffect(() => {
    const interval = setInterval(() => {
      if (isEndingRef.current || statusRef.current === 'idle' || !segmentStartRef.current) return;
      const nowMs = Date.now();
      const machineState = createMachineStateFromRefs(nowMs);
      const result = reduceTachoEvent(machineState, { type: 'TIMER_TICK', nowMs });
      applyMachineStateToRefs(result.state);
      const nextDisplay = deriveDisplayFromTachoState(result.state, nowMs);
      lastBreakDurationUiRef.current = nextDisplay.lastBreakDuration;
      lastBreakEndTimeRef.current = nextDisplay.lastBreakEndTime;
      setDisplay(nextDisplay);
      executeReducerCommands(result.commands, { skipPersist: true, skipSyncSession: true })
        .catch(e => console.warn('Tick command execution failed:', e));
    }, 1000);
    return () => clearInterval(interval);
  }, [applyMachineStateToRefs, createMachineStateFromRefs, executeReducerCommands]);

  // 20-second local persist
  useEffect(() => {
    const interval = setInterval(() => {
      if (isEndingRef.current || statusRef.current === 'idle') return;
      persistFromRefs();
    }, 20000);
    return () => clearInterval(interval);
  }, [persistFromRefs]);

  // 60-second DB checkpoint sync
  useEffect(() => {
    if (!sessionId || status === 'idle') return;
    const interval = setInterval(async () => {
    if (isEndingRef.current || !sessionIdRef.current) return;
      try {
        await syncSessionToDb('checkpoint', { logLabel: 'Periodic session sync failed:' });
      } catch (e) { console.warn('Periodic session sync failed:', e); }
    }, 60000);
    return () => clearInterval(interval);
  }, [sessionId, status, syncSessionToDb]);

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
      isDrivingDetectionPausedRef.current = false;
      setIsDrivingDetectionPaused(false);
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
      const clientSessionId = createClientUuid();
      const startedShift = createStartedShiftState(nowIso, nowMs, weeklyDrivingAccumulatorRef.current);
      statusRef.current = startedShift.status;
      sessionIdRef.current = clientSessionId;
      setSessionId(clientSessionId);
      workStartRef.current = startedShift.workStartTime;
      segmentStartRef.current = startedShift.currentSegmentStart;
      activitySegmentStartRef.current = startedShift.workStartTime;
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
      lastLocationTsRef.current = 0;
      lastLatitudeRef.current = null;
      lastLongitudeRef.current = null;
      lastAccuracyMRef.current = null;
      lastComputedSpeedKmhRef.current = null;
      lastSelectedSpeedSourceRef.current = 'none';
      pendingMotionTransitionTypeRef.current = null;
      pendingMotionTransitionStartedAtRef.current = 0;
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

      const startSessionPayload = {
        id: clientSessionId,
        start_time: nowIso,
        date: toLocalDateString(new Date(nowMs)),
        user_id: userId,
        timezone,
        is_manual_entry: false,
        start_lat: loc?.coords.latitude,
        start_lng: loc?.coords.longitude,
        status: 'working',
        other_data: {
          dailyRestSecondsBeforeShift: dailyRestSecondsBeforeShiftRef.current,
          reducedDailyRestTaken: reducedDailyRestTakenRef.current,
          activitySegmentStartTime: nowIso,
          workIncludesDrivingReference: true,
        },
      };

      const { data, error } = await workSessionService.startSession(
        userId,
        timezone,
        loc?.coords.latitude,
        loc?.coords.longitude,
        nowIso,
        clientSessionId,
      );
      let activeSessionData = data;
      if (error) {
        console.error('startWork DB error:', error);
        await offlineQueueService.enqueueCriticalTimerWrite({
          id: buildCriticalTimerWriteId({
            kind: 'start_session',
            sessionId: clientSessionId,
          }),
          kind: 'start_session',
          sessionId: clientSessionId,
          userId,
          payload: startSessionPayload,
        });
        await refreshCriticalTimerWriteHealth();
        activeSessionData = startSessionPayload;
        Alert.alert(
          'Shift Started Offline',
          'Your shift is running locally. HourWise will sync it when your connection is available.',
        );
      }

      sessionIdRef.current = activeSessionData?.id || clientSessionId;
      if (!error) lastDbCheckpointAtRef.current = Date.now();
      setSessionId(activeSessionData?.id || clientSessionId);
      const sessionWithRuleMetadata = {
        ...activeSessionData,
        other_data: {
          ...(activeSessionData?.other_data ?? {}),
          dailyRestSecondsBeforeShift: dailyRestSecondsBeforeShiftRef.current,
          reducedDailyRestTaken: reducedDailyRestTakenRef.current,
          activitySegmentStartTime: nowIso,
          workIncludesDrivingReference: true,
        },
      };
      setSessionData(sessionWithRuleMetadata);
      sessionDataRef.current = sessionWithRuleMetadata;

      await cancelAllScheduledAlertNotifications({ clearBackgroundState: true });
      await workSessionSegmentService.recordShiftStart({
        userId,
        sessionId: activeSessionData?.id || clientSessionId,
        startedAt: nowIso,
      });
      await persistFromRefs();
      await buildComplianceSchedule();
      speakAlert('audioShiftStarted');
      await flushCriticalWrites();
      await promptBatteryOptimisationIfNeeded();
    } catch (e) { console.error('startWork error:', e); }
    finally { isStartingRef.current = false; setIsStarting(false); }
  }, [
    userId,
    timezone,
    persistFromRefs,
    syncStateFromRefs,
    buildComplianceSchedule,
    cancelAllScheduledAlertNotifications,
    speakAlert,
    triggerImmediateAlert,
    syncShiftAllowanceState,
    refreshCriticalTimerWriteHealth,
    flushCriticalWrites,
  ]);

  const endWork = useCallback(async () => {
    const nowMs = Date.now();
    if (statusRef.current !== 'idle' && segmentStartRef.current && isValidSegmentStart(segmentStartRef.current)) {
      const machineState = createMachineStateFromRefs(nowMs);
      const tickResult = reduceTachoEvent(machineState, { type: 'TIMER_TICK', nowMs });
      applyMachineStateToRefs(tickResult.state);
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
    const shiftSummary = createEndShiftSummaryState({
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
           return false;
         }
         setShiftSummaryData(current =>
           current ? setEndShiftSummaryConfirming(current, true) : current,
          );
          isEndingRef.current = true;
          let completed = false;
          let alertsCancelled = false;

          try {
            const confirmationError = getEndShiftConfirmationError(sessionIdRef.current);
            if (confirmationError === 'missing_active_session') {
              Alert.alert(i18n.t('endShiftConfirmation.alerts.failedTitle'), i18n.t('endShiftConfirmation.alerts.missingSession'));
              return false;
            }
            const activeSessionId = sessionIdRef.current as string;
            const confirmNowMs = Date.now();
            const confirmNowIso = new Date(confirmNowMs).toISOString();

            // Cancel timer alerts before any slow GPS/DB work so they cannot fire after
            // the user has confirmed end shift but before cleanup completes.
            await cancelAllScheduledAlertNotifications({ clearBackgroundState: true });
            alertsCancelled = true;

            if (statusRef.current !== 'idle' && segmentStartRef.current && isValidSegmentStart(segmentStartRef.current)) {
              const machineState = createMachineStateFromRefs(confirmNowMs);
             const tickResult = reduceTachoEvent(machineState, { type: 'TIMER_TICK', nowMs: confirmNowMs });
             applyMachineStateToRefs(tickResult.state);
             const frozenDisplay = deriveDisplayFromTachoState(tickResult.state, confirmNowMs);
             lastBreakDurationUiRef.current = frozenDisplay.lastBreakDuration;
             lastBreakEndTimeRef.current = frozenDisplay.lastBreakEndTime;
              setDisplay(frozenDisplay);
            }
            const endingStatus = statusRef.current;
            const endingActivitySegmentStart =
              activitySegmentStartRef.current || workStartRef.current || segmentStartRef.current;

           const {
             finalTotals: confirmedFinalTotals,
             effectiveWorkCycle: confirmedWorkCycle,
             effectiveDrivingCycle: confirmedDrivingCycle,
             effectiveHas15minBreak: confirmedHas15minBreak,
             currentShift: confirmedCurrentShift,
           } = buildEndShiftSnapshot({
             nowMs: confirmNowMs,
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
            confirmedCurrentShift.other_data.dailyRestSecondsBeforeShift = dailyRestSecondsBeforeShiftRef.current;
            confirmedCurrentShift.other_data.reducedDailyRestTaken = reducedDailyRestTakenRef.current;
            confirmedCurrentShift.other_data.activitySegmentStartTime = endingActivitySegmentStart;
            const {
             score: confirmedScore,
             violations: confirmedViolations,
           } = calculateCompliance(history, confirmedCurrentShift as any);

           const loc = await Promise.race([
             Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }).catch(() => null),
             new Promise<null>(resolve => setTimeout(() => resolve(null), 5000)),
           ]);

           const endSessionRequest = buildEndSessionRequest({
             sessionId: activeSessionId,
             finalTotals: confirmedFinalTotals,
             effectiveHas15minBreak: confirmedHas15minBreak,
             effectiveWorkCycle: confirmedWorkCycle,
             effectiveDrivingCycle: confirmedDrivingCycle,
             shiftMetadata: confirmedCurrentShift.other_data,
             existingOtherData: sessionDataRef.current?.other_data,
             latitude: loc?.coords.latitude,
             longitude: loc?.coords.longitude,
             score: confirmedScore,
             violations: confirmedViolations,
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
              confirmNowIso,
            );

           if (error) {
             console.error('endSession failed:', error);
             if (userId) {
               await offlineQueueService.enqueueCriticalTimerWrite({
                 id: buildCriticalTimerWriteId({
                   kind: 'end_session',
                   sessionId: endSessionRequest.sessionId,
                 }),
                 kind: 'end_session',
                 sessionId: endSessionRequest.sessionId,
                 userId,
                 payload: {
                   end_time: confirmNowIso,
                   total_work_minutes: endSessionRequest.workMins,
                   total_poa_minutes: endSessionRequest.poaMins,
                   total_break_minutes: endSessionRequest.breakMins,
                   other_data: {
                     ...endSessionRequest.existingOtherData,
                     driving: endSessionRequest.drivingMins,
                     has15minBreak: endSessionRequest.has15minBreak,
                   },
                   end_lat: endSessionRequest.latitude,
                   end_lng: endSessionRequest.longitude,
                   compliance_score: endSessionRequest.complianceScore,
                   compliance_violations: endSessionRequest.complianceViolations,
                   status: 'idle',
                   current_break_start: null,
                   current_poa_start: null,
                 },
               });
               await refreshCriticalTimerWriteHealth();
             }
             Alert.alert(
               'Shift Saved Locally',
               'Your ended shift is queued and will sync when your connection is available.',
             );
           }

           if (finalSessionData) sessionDataRef.current = finalSessionData;
           if (userId) {
             await workSessionSegmentService.recordShiftEnd({
               userId,
               sessionId: activeSessionId,
               previousStatus: endingStatus,
               previousSegmentStart: endingActivitySegmentStart,
               endedAt: confirmNowIso,
             });
           }

           suppressDriveStopSyncRef.current = true;
           try {
             await stopTracking();
              await cancelAllScheduledAlertNotifications({ clearBackgroundState: true });

               applyMachineStateToRefs(createInitialTachoState(Date.now()));
               activitySegmentStartRef.current = null;
               isDrivingDetectionPausedRef.current = false;
             setIsDrivingDetectionPaused(false);
             syncStateFromRefs();
            setSessionData(null);
            sessionDataRef.current = null;
            setDisplay(createInitialDisplayState());

            await persistFromRefs();
            await fetchHistory();
            await flushCriticalWrites();
            completed = true;
            setShiftSummaryData(null);
            speakAlert('audioShiftEnded');
            return true;
          } finally {
            suppressDriveStopSyncRef.current = false;
          }
        } catch (e) {
          console.error('End shift confirmation failed:', e);
          Alert.alert(i18n.t('endShiftConfirmation.alerts.failedTitle'), i18n.t('endShiftConfirmation.alerts.unexpected'));
          return false;
        } finally {
          if (!completed && alertsCancelled && statusRef.current !== 'idle') {
            try {
              await buildComplianceSchedule();
              if (
                statusRef.current === 'working' &&
                isDrivingRef.current &&
                !isDrivingDetectionPausedRef.current
              ) {
                await buildDriveAlertSchedule();
              }
            } catch (scheduleError) {
              console.warn('Failed to restore alert schedules after end shift failure:', scheduleError);
            }
          }
          if (!completed) {
            setShiftSummaryData(current =>
              current ? setEndShiftSummaryConfirming(current, false) : current,
            );
          }
          isEndingRef.current = false;
        }
     },
   });
  }, [
    applyMachineStateToRefs,
    createMachineStateFromRefs,
    history,
    persistFromRefs,
    cancelAllScheduledAlertNotifications,
    buildComplianceSchedule,
    buildDriveAlertSchedule,
    speakAlert,
    fetchHistory,
    stopTracking,
    syncStateFromRefs,
    userId,
    refreshCriticalTimerWriteHealth,
    flushCriticalWrites,
  ]);

  const toggleBreak = useCallback(() =>
    updateTotalsAndSwitchStatus(statusRef.current === 'break' ? 'working' : 'break'),
  [updateTotalsAndSwitchStatus]);

  const togglePOA = useCallback(() =>
    updateTotalsAndSwitchStatus(statusRef.current === 'poa' ? 'working' : 'poa'),
  [updateTotalsAndSwitchStatus]);

  return {
    status,
    sessionId,
    timerMode,
    isDriving,
    isDrivingDetectionPaused,
    isStarting,
    criticalTimerWriteHealth,
    displaySeconds: display,
    shiftSummaryData,
    setShiftSummaryData,
    startWork,
    endWork,
    togglePOA,
    toggleBreak,
    toggleDrivingDetectionPause,
    exportTimerDiagnostics,
  };
};
