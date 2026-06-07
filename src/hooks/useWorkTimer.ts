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
  loadBackgroundTaskDiagnostics,
  loadScheduledComplianceAlerts,
  loadScheduledComplianceNotificationIds,
  loadScheduledDriveAlerts,
  loadScheduledDriveNotificationIds,
  saveActiveTimerState,
  saveScheduledComplianceAlerts,
  saveScheduledDriveAlerts,
} from '../lib/tacho/runtimeStorage';
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
  createFailedStartRollbackState,
  createInitialDisplayState,
  createStartedShiftState,
} from '../lib/tacho/lifecycle';
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

const isValidResumableSessionState = (
  state: TachoState | null | undefined,
  sessionId?: string | null,
): state is TachoState => {
  if (!state || state.status === 'idle' || !state.sessionId) return false;
  if (sessionId && state.sessionId !== sessionId) return false;
  return isValidSegmentStart(state.currentSegmentStart);
};

type ShiftSummaryModalState = EndShiftSummaryState & {
  onConfirm: () => Promise<void>;
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
  const appStateRef = useRef(AppState.currentState);
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
    drivingScoreRef.current = machineState.motion.drivingScore;
    movingSinceRef.current = machineState.motion.movingSinceMs;
    stationarySinceRef.current = machineState.motion.stationarySinceMs;
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
        drivingScore: drivingScoreRef.current,
        movingSinceMs: movingSinceRef.current,
        stationarySinceMs: stationarySinceRef.current,
      },
      alerts: {
        prevShiftElapsed: prevShiftElapsedRef.current,
        prevRemaining: prevRemainingRef.current,
      },
    }),
  []);

  const resetDrivingMotionState = useCallback(() => {
    drivingScoreRef.current = 0;
    movingSinceRef.current = 0;
    stationarySinceRef.current = 0;
    lastSpeedKmhRef.current = 0;
    lastSpeedTsRef.current = 0;
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
  }, [clearScopeScheduledAlerts, extractScheduledAlertDescriptor]);

  const cancelAllScheduledAlertNotifications = useCallback(async (
    options?: { clearBackgroundState?: boolean },
  ) => {
    await cancelScheduledAlertsForScope('compliance');
    await cancelScheduledAlertsForScope('drive');
    if (options?.clearBackgroundState) {
      await clearBackgroundAlertState();
    }
  }, [cancelScheduledAlertsForScope]);

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
    await logNotificationDiagnostics(context);
  }, [
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

  const persistFromRefs = useCallback(async () => {
     if (!userStorageKey || isPersistingRef.current || isRefreshingSessionRef.current) return;
     if (isEndingRef.current && statusRef.current !== 'idle') return;
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
       }
       const machineState = createMachineStateFromRefs(nowMs);
       const normalizedState = statusRef.current === 'idle'
         ? machineState
         : reduceTachoEvent(machineState, { type: 'TIMER_TICK', nowMs }).state;

       applyMachineStateToRefs(normalizedState);
       const state: PersistedState = {
         ...toPersistedTachoState(normalizedState, userStorageKey),
         drivingDetectionPaused: isDrivingDetectionPausedRef.current,
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
  }, [applyMachineStateToRefs, createMachineStateFromRefs, userStorageKey]);

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
      currentPoaStart: normalizedState.currentSegmentStart,
      breakStartMs: normalizedState.breakStartMs,
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
    } else if (result.data) {
      setSessionData(result.data);
      sessionDataRef.current = result.data;
    }

    return result;
  }, [applyMachineStateToRefs, createMachineStateFromRefs]);

  const executeReducerCommands = useCallback(async (
    commands: TachoCommand[],
    options?: { skipPersist?: boolean; skipSyncSession?: boolean },
  ) => {
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
    try {
      while (isPersistingRef.current) {
        await new Promise(resolve => setTimeout(resolve, 50));
      }

      const resumeNowMs = Date.now();
      const currentRuntimeState = statusRef.current !== 'idle' && segmentStartRef.current
        ? reduceTachoEvent(createMachineStateFromRefs(resumeNowMs), { type: 'TIMER_TICK', nowMs: resumeNowMs }).state
        : createMachineStateFromRefs(resumeNowMs);
      const persistedState = await loadActiveTimerState();
      const hasMatchingPersistedState =
        !!persistedState &&
        persistedState.userStorageKey === userStorageKey;
      isDrivingDetectionPausedRef.current =
        hasMatchingPersistedState && persistedState
          ? !!persistedState.drivingDetectionPaused
          : false;
      setIsDrivingDetectionPaused(isDrivingDetectionPausedRef.current);
      const persistedRuntimeState = hasMatchingPersistedState && persistedState
        ? reduceTachoEvent(
            createTachoStateFromPersisted(persistedState, resumeNowMs),
            { type: 'TIMER_TICK', nowMs: resumeNowMs },
          ).state
        : null;

      const { data, error } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('user_id', userId)
        .is('end_time', null)
        .single();

      if (error || !data) return;

      setSessionData(data);
      sessionDataRef.current = data;
      const dbState = createTachoStateFromSessionRow(data, currentRuntimeState);
      const reconciledState = isValidResumableSessionState(currentRuntimeState, data.id)
        ? currentRuntimeState
        : isValidResumableSessionState(persistedRuntimeState, data.id)
          ? persistedRuntimeState
          : dbState;

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
    } catch (e) { console.warn('refreshSession failed:', e); }
    finally { isRefreshingSessionRef.current = false; }
  }, [
    userId,
    userStorageKey,
    syncStateFromRefs,
    syncShiftAllowanceState,
    createMachineStateFromRefs,
    applyMachineStateToRefs,
    syncSessionToDb,
  ]);

  const commitAndFlipDriving = useCallback((
    nextDriving: boolean,
    onFlipped?: () => void,
    source: 'location' | 'accelerometer' | 'background' = 'location',
    options?: { bypassPause?: boolean },
  ) => {
    if (nextDriving && isDrivingDetectionPausedRef.current && !options?.bypassPause) return;

    const nowMs = Date.now();
    const machineState = createMachineStateFromRefs(nowMs);
    const result = reduceTachoEvent(machineState, {
      type: 'DRIVING_DECISION_RECEIVED',
      nowMs,
      nextDriving,
      source,
    });
    if (result.state.isDriving === machineState.isDriving && result.commands.length === 0) return;

    applyMachineStateToRefs(result.state);
    syncStateFromRefs();
    onFlipped?.();

    executeReducerCommands(result.commands)
      .catch(e => console.warn('Driving command execution failed:', e));
  }, [applyMachineStateToRefs, createMachineStateFromRefs, executeReducerCommands, syncStateFromRefs]);

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

        if ((next === 'inactive' || next === 'background') && statusRef.current !== 'idle') {
         // CRITICAL FIX #8: Ensure driving state is synced before backgrounding
         // This prevents stale driving state from being replayed on resume
         if (isDrivingRef.current && sessionIdRef.current) {
           try {
             await syncSessionToDb('drive_stop', {
               maxRetries: 2,
               logLabel: 'Background driving state sync failed:',
             });
           } catch (e) { console.warn('Background driving state sync failed:', e); }
         }
         if (sessionIdRef.current) {
           try {
             await syncSessionToDb('checkpoint', {
               maxRetries: 2,
               logLabel: 'Background session checkpoint failed:',
             });
           } catch (e) { console.warn('Background session checkpoint failed:', e); }
         }
         await persistFromRefs();
         return;
       }

       if (next !== 'active' || prev === 'active') return;
       if (statusRef.current !== 'idle') {
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
    });
    return () => sub.remove();
  }, [applyMachineStateToRefs, buildComplianceSchedule, buildDriveAlertSchedule, cancelAllScheduledAlertNotifications, cancelScheduledAlertsForScope, createMachineStateFromRefs, executeReducerCommands, logNotificationDiagnostics, persistFromRefs, refreshSession, syncSessionToDb, syncStateFromRefs]);

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
          if (isDrivingDetectionPausedRef.current) return;
          const speedKmh = Math.max(0, (loc.coords.speed ?? 0) * 3.6);
          const result = processLocationMotionSample({
            nowMs: Date.now(),
            accuracy: loc.coords.accuracy ?? 9999,
            speedKmh,
            isDriving: isDrivingRef.current,
            motionState: {
              lastSpeedKmh: lastSpeedKmhRef.current,
              lastSpeedTs: lastSpeedTsRef.current,
              drivingScore: drivingScoreRef.current,
              movingSinceMs: movingSinceRef.current,
              stationarySinceMs: stationarySinceRef.current,
            },
            config: MOTION_DETECTOR_CONFIG,
          });
          lastSpeedKmhRef.current = result.motionState.lastSpeedKmh;
          lastSpeedTsRef.current = result.motionState.lastSpeedTs;
          movingSinceRef.current = result.motionState.movingSinceMs;
          stationarySinceRef.current = result.motionState.stationarySinceMs;
          drivingScoreRef.current = result.motionState.drivingScore;
          if (result.nextDriving !== null) {
            commitAndFlipDriving(result.nextDriving);
          }
        }
      );
      Accelerometer.setUpdateInterval(800);
      accelSubRef.current = Accelerometer.addListener(({ x, y, z }) => {
        if (isDrivingDetectionPausedRef.current) return;
        const result = processAccelerometerMotionSample({
          nowMs: Date.now(),
          x,
          y,
          z,
          isDriving: isDrivingRef.current,
          motionState: {
            lastSpeedKmh: lastSpeedKmhRef.current,
            lastSpeedTs: lastSpeedTsRef.current,
            drivingScore: drivingScoreRef.current,
            movingSinceMs: movingSinceRef.current,
            stationarySinceMs: stationarySinceRef.current,
          },
          config: MOTION_DETECTOR_CONFIG,
        });
        drivingScoreRef.current = result.motionState.drivingScore;
        if (result.nextDriving !== null) {
          commitAndFlipDriving(result.nextDriving);
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
    await cancelAllScheduledAlertNotifications();
    while (isPersistingRef.current) { await new Promise(resolve => setTimeout(resolve, 50)); }

    const nowMs = Date.now();
    const machineState = createMachineStateFromRefs(nowMs);
    const result = reduceTachoEvent(machineState, {
      type: 'STATUS_CHANGE_REQUESTED',
      nowMs,
      nextStatus: newStatus,
    });

    applyMachineStateToRefs(result.state);
    syncStateFromRefs();
    vibrateAlert();

    await executeReducerCommands(result.commands);
  }, [
    cancelAllScheduledAlertNotifications,
    createMachineStateFromRefs,
    applyMachineStateToRefs,
    syncStateFromRefs,
    vibrateAlert,
    executeReducerCommands,
  ]);

  useEffect(() => {
    const restore = async () => {
      if (!userStorageKey || !userId) return;
      try {
        const saved = await AsyncStorage.getItem(userStorageKey);
        if (saved) {
          const s: PersistedState = JSON.parse(saved);
          isDrivingDetectionPausedRef.current = !!s.drivingDetectionPaused;
          setIsDrivingDetectionPaused(isDrivingDetectionPausedRef.current);
          const machineState = createTachoStateFromPersisted(s, Date.now());
          applyMachineStateToRefs(machineState);
          syncStateFromRefs();
        }
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
      } catch (e) { console.warn('restore failed:', e); }
    };
    restore();
  }, [userId, userStorageKey, syncStateFromRefs, refreshSession, cancelAllScheduledAlertNotifications, buildComplianceSchedule, buildDriveAlertSchedule, applyMachineStateToRefs, logNotificationDiagnostics]);

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
        isDrivingDetectionPausedRef.current = false;
        setIsDrivingDetectionPaused(false);
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

      await cancelAllScheduledAlertNotifications({ clearBackgroundState: true });
      await persistFromRefs();
      await buildComplianceSchedule();
      speakAlert('audioShiftStarted');
      await promptBatteryOptimisationIfNeeded();
    } catch (e) { console.error('startWork error:', e); }
    finally { isStartingRef.current = false; setIsStarting(false); }
  }, [userId, timezone, persistFromRefs, syncStateFromRefs, buildComplianceSchedule, cancelAllScheduledAlertNotifications, speakAlert, triggerImmediateAlert, syncShiftAllowanceState]);

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
           return;
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
              Alert.alert('End Shift Failed', 'No active shift session was found. Please try again without closing the shift summary.');
              return;
            }
            const activeSessionId = sessionIdRef.current as string;
            const confirmNowMs = Date.now();

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
            );

           if (error) {
             console.error('endSession failed:', error);
             Alert.alert('End Shift Failed', 'Could not save your shift. Please check your connection and try again.');
             return;
           }

           if (finalSessionData) sessionDataRef.current = finalSessionData;

           suppressDriveStopSyncRef.current = true;
           try {
             await stopTracking();
              await cancelAllScheduledAlertNotifications({ clearBackgroundState: true });

              applyMachineStateToRefs(createInitialTachoState(Date.now()));
              isDrivingDetectionPausedRef.current = false;
             setIsDrivingDetectionPaused(false);
             syncStateFromRefs();
            setSessionData(null);
            sessionDataRef.current = null;
            setDisplay(createInitialDisplayState());

            await persistFromRefs();
            await fetchHistory();
            completed = true;
            setShiftSummaryData(null);
            speakAlert('audioShiftEnded');
          } finally {
            suppressDriveStopSyncRef.current = false;
          }
        } catch (e) {
          console.error('End shift confirmation failed:', e);
          Alert.alert('End Shift Failed', 'An unexpected error occurred while saving your shift. Please try again.');
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
  }, [applyMachineStateToRefs, createMachineStateFromRefs, history, persistFromRefs, cancelAllScheduledAlertNotifications, buildComplianceSchedule, buildDriveAlertSchedule, speakAlert, fetchHistory, stopTracking, syncStateFromRefs]);

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
    displaySeconds: display,
    shiftSummaryData,
    setShiftSummaryData,
    startWork,
    endWork,
    togglePOA,
    toggleBreak,
    toggleDrivingDetectionPause,
  };
};
