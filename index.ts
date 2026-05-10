// File: index.ts
import { registerRootComponent } from 'expo';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import App from './src/App';
import i18n, { ensureI18nInitialized } from './src/lib/i18n';
import { ensureNotificationChannelsInitialized } from './src/lib/notifications';
import { ALERT_TEXT } from './src/lib/tacho/alerts';
import {
  DRIVING_SPEED_THRESHOLD_KMH,
  DRIVING_IMMEDIATE_START_THRESHOLD_KMH,
  LOW_SPEED_STOP_THRESHOLD_KMH,
  MAX_DAILY_DRIVE_EXTENDED,
  MAX_DRIVE,
  MAX_WEEKLY_DRIVE,
  SPREADOVER_13H,
  STILL_SPEED_THRESHOLD_KMH,
} from './src/lib/tacho/constants';
import { deriveLiveDisplayState } from './src/lib/tacho/display';
import { evaluateBackgroundSpeedDecision } from './src/lib/tacho/drivingDetection';
import {
  clearBackgroundAlertState,
  loadActiveTimerState,
  loadBackgroundAlertState,
  saveActiveTimerState,
  saveBackgroundAlertState,
  type BackgroundAlertState,
} from './src/lib/tacho/runtimeStorage';
import { applyElapsedToCounters } from './src/lib/tacho/timing';

export const LOCATION_TASK_NAME = 'background-location-task';
export const BACKGROUND_SPEED_KEY = 'bg_last_speed_v1';

const crossedDown = (current: number, prev: number, threshold: number) =>
  current <= threshold && prev > threshold;

const scheduleBackgroundAlert = async (alertKey: keyof typeof ALERT_TEXT) => {
  const cfg = ALERT_TEXT[alertKey];
  if (!cfg.titleKey || !cfg.bodyKey) return;

  await ensureNotificationChannelsInitialized();
  await ensureI18nInitialized();

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
};

const buildBackgroundAlertState = (
  display: ReturnType<typeof deriveLiveDisplayState>,
  status: 'idle' | 'working' | 'poa' | 'break',
  isDriving: boolean
): BackgroundAlertState => ({
  status,
  isDriving,
  drivingTimeRemaining: display.drivingTimeRemaining,
  driveExtensionRemaining: MAX_DAILY_DRIVE_EXTENDED - display.driving,
  weeklyDrivingRemaining: display.weeklyDrivingRemaining,
});

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error('Background Location Task Error:', error);
    return;
  }

  if (!data?.locations?.length) return;

  const speed = Math.max(0, (data.locations[0].coords.speed || 0) * 3.6);
  const nowMs = Date.now();

  await AsyncStorage.setItem(
    BACKGROUND_SPEED_KEY,
    JSON.stringify({ speedKmh: speed, ts: nowMs })
  );

  const persistedState = await loadActiveTimerState();
  if (!persistedState || !persistedState.currentSegmentStart) {
    await clearBackgroundAlertState();
    return;
  }

  const segmentStartMs = new Date(persistedState.currentSegmentStart).getTime();
  if (!Number.isFinite(segmentStartMs)) {
    await clearBackgroundAlertState();
    return;
  }

  const elapsedSec = Math.max(0, Math.floor((nowMs - segmentStartMs) / 1000));
  if (elapsedSec > 0) {
    const nextCounters = applyElapsedToCounters(
      {
        totals: persistedState.totals,
        workCycle: persistedState.workCycleTotal,
        drivingCycle: persistedState.drivingCycleTotal ?? persistedState.totals.driving,
      },
      elapsedSec,
      persistedState.status,
      persistedState.isDriving
    );

    persistedState.totals = nextCounters.totals;
    persistedState.workCycleTotal = nextCounters.workCycle;
    persistedState.drivingCycleTotal = nextCounters.drivingCycle;
  }

  if (persistedState.status === 'working') {
    const decision = evaluateBackgroundSpeedDecision({
      nowMs,
      sampleTs: nowMs,
      speedKmh: speed,
      isDriving: persistedState.isDriving,
      drivingThresholdKmh: DRIVING_SPEED_THRESHOLD_KMH,
      stillThresholdKmh: STILL_SPEED_THRESHOLD_KMH,
      immediateStartThresholdKmh: DRIVING_IMMEDIATE_START_THRESHOLD_KMH,
      lowSpeedStopThresholdKmh: LOW_SPEED_STOP_THRESHOLD_KMH,
      staleThresholdMs: 30000,
    });

    if (decision.shouldApply && decision.nextDriving !== null) {
      persistedState.isDriving = decision.nextDriving;
    }
  }

  persistedState.currentSegmentStart = new Date(nowMs).toISOString();
  persistedState.lastTickMs = nowMs;
  await saveActiveTimerState(persistedState);

  const display = deriveLiveDisplayState({
    nowMs,
    status: persistedState.status,
    segmentStartIso: persistedState.currentSegmentStart,
    workStartIso: persistedState.workStartTime,
    totals: persistedState.totals,
    legalBreakDisplayTotal: persistedState.legalBreakDisplayTotal || 0,
    workCycle: persistedState.workCycleTotal,
    drivingCycle: persistedState.drivingCycleTotal ?? persistedState.totals.driving,
    isDriving: persistedState.isDriving,
    timerMode: persistedState.timerMode,
    weeklyDrivingAccumulator: persistedState.weeklyDrivingAccumulator,
    breakStartMs: persistedState.breakStartMs || 0,
    has15minBreak: persistedState.breakTracker.has15min,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
    maxDriveSeconds: MAX_DRIVE,
    maxWeeklyDriveSeconds: MAX_WEEKLY_DRIVE,
    maxShiftTimeSeconds: SPREADOVER_13H,
  });

  const currentAlertState = buildBackgroundAlertState(
    display,
    persistedState.status,
    persistedState.isDriving
  );

  const previousAlertState = await loadBackgroundAlertState();
  if (
    previousAlertState &&
    previousAlertState.status === 'working' &&
    previousAlertState.isDriving &&
    currentAlertState.status === 'working' &&
    currentAlertState.isDriving
  ) {
    const alertKeys: Array<keyof typeof ALERT_TEXT> = [];

    if (crossedDown(currentAlertState.drivingTimeRemaining, previousAlertState.drivingTimeRemaining, 30 * 60)) {
      alertKeys.push('driveCycleWarn30mRemaining');
    }
    if (crossedDown(currentAlertState.drivingTimeRemaining, previousAlertState.drivingTimeRemaining, 15 * 60)) {
      alertKeys.push('driveCycleWarn15mRemaining');
    }
    if (crossedDown(currentAlertState.drivingTimeRemaining, previousAlertState.drivingTimeRemaining, 5 * 60)) {
      alertKeys.push('driveCycleWarn5mRemaining');
    }
    if (crossedDown(currentAlertState.drivingTimeRemaining, previousAlertState.drivingTimeRemaining, 0)) {
      alertKeys.push('driveCycleLimitReached');
    }
    if (crossedDown(currentAlertState.driveExtensionRemaining, previousAlertState.driveExtensionRemaining, 30 * 60)) {
      alertKeys.push('driveExtensionWarn30mRemaining');
    }
    if (crossedDown(currentAlertState.driveExtensionRemaining, previousAlertState.driveExtensionRemaining, 15 * 60)) {
      alertKeys.push('driveExtensionWarn15mRemaining');
    }
    if (crossedDown(currentAlertState.driveExtensionRemaining, previousAlertState.driveExtensionRemaining, 5 * 60)) {
      alertKeys.push('driveExtensionWarn5mRemaining');
    }
    if (crossedDown(currentAlertState.driveExtensionRemaining, previousAlertState.driveExtensionRemaining, 0)) {
      alertKeys.push('driveExtensionLimitReached');
    }
    if (crossedDown(currentAlertState.weeklyDrivingRemaining, previousAlertState.weeklyDrivingRemaining, 3600)) {
      alertKeys.push('weeklyDriveWarn1hRemaining');
    }
    if (crossedDown(currentAlertState.weeklyDrivingRemaining, previousAlertState.weeklyDrivingRemaining, 0)) {
      alertKeys.push('weeklyDriveLimitReached');
    }

    for (const alertKey of alertKeys) {
      await scheduleBackgroundAlert(alertKey);
    }
  }

  await saveBackgroundAlertState(currentAlertState);
});

registerRootComponent(App);
