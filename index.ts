// File: index.ts
import { registerRootComponent } from 'expo';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import App from './src/App';
import i18n, { ensureI18nInitialized } from './src/lib/i18n';
import { ensureNotificationChannelsInitialized } from './src/lib/notifications';
import { ALERT_TEXT, BACKGROUND_DRIVE_ALERT_KEYS, type AlertKey } from './src/lib/tacho/alerts';
import {
  BACKGROUND_SAMPLE_STALE_MS,
  STILL_SPEED_THRESHOLD_KMH,
} from './src/lib/tacho/constants';
import { clearHourwiseTimerNotificationsByScope } from './src/lib/tacho/notificationCleanup';
import {
  clearBackgroundAlertState,
  clearScheduledDriveAlerts,
  loadActiveTimerState,
  appendMotionDiagnosticsRing,
  appendTimerDiagnosticsRing,
  saveBackgroundTaskDiagnostics,
  saveActiveTimerState,
} from './src/lib/tacho/runtimeStorage';
import {
  createTachoStateFromPersisted,
  toPersistedTachoState,
  type TachoCommand,
  type TachoState,
} from './src/lib/tacho/machine';
import { reduceTachoEvent } from './src/lib/tacho/reducer';
import type {
  MotionDiagnosticRecord,
  TimerDiagnosticSnapshot,
} from './src/lib/tacho/diagnostics';

export const LOCATION_TASK_NAME = 'background-location-task';
export const BACKGROUND_SPEED_KEY = 'bg_last_speed_v1';

const getSafeLocationTimestamp = (timestamp: unknown, receiptMs: number): number => {
  if (typeof timestamp !== 'number' || !Number.isFinite(timestamp) || timestamp <= 0) {
    return receiptMs;
  }
  return timestamp > receiptMs ? receiptMs : timestamp;
};

const buildBackgroundTimerSnapshot = (
  state: TachoState,
  activitySegmentStartTime?: string | null,
): TimerDiagnosticSnapshot => ({
  status: state.status,
  sessionId: state.sessionId,
  workStartTime: state.workStartTime,
  currentSegmentStart: state.currentSegmentStart,
  activitySegmentStartTime: activitySegmentStartTime ?? null,
  totals: { ...state.totals },
  legalBreakDisplayTotal: state.legalBreakDisplayTotal,
  workCycle: state.workCycle,
  drivingCycle: state.drivingCycle,
  timerMode: state.timerMode,
  isDriving: state.isDriving,
  breakStartMs: state.breakStartMs,
  lastTickMs: state.lastTickMs,
});

const scheduleBackgroundAlert = async (alertKey: AlertKey) => {
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
      data: {
        hourwiseAlert: true,
        scope: 'drive',
        alertKey,
        scheduleKey: `background:${alertKey}:${Date.now()}`,
        fireDateMs: Date.now(),
      },
    } as any,
    trigger: null,
  });
};

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error('Background Location Task Error:', error);
    return;
  }

  if (!data?.locations?.length) return;

  const receiptMs = Date.now();
  const samples = data.locations
    .map((location: any) => ({
      speedKmh:
        typeof location?.coords?.speed === 'number' && Number.isFinite(location.coords.speed)
          ? Math.max(0, location.coords.speed * 3.6)
          : null,
      accuracyM:
        typeof location?.coords?.accuracy === 'number' && Number.isFinite(location.coords.accuracy)
          ? location.coords.accuracy
          : null,
      sampleTs: getSafeLocationTimestamp(location?.timestamp, receiptMs),
    }))
    .filter((sample: { sampleTs: number }) => Number.isFinite(sample.sampleTs))
    .sort((a: { sampleTs: number }, b: { sampleTs: number }) => a.sampleTs - b.sampleTs);

  if (!samples.length) return;

  const latestSample = samples[samples.length - 1];
  const latestSampleAgeMs = receiptMs - latestSample.sampleTs;
  const hasFreshLatestSample = latestSampleAgeMs <= BACKGROUND_SAMPLE_STALE_MS;

  await AsyncStorage.setItem(
    BACKGROUND_SPEED_KEY,
    JSON.stringify({
      speedKmh: latestSample.speedKmh ?? 0,
      ts: latestSample.sampleTs,
      receiptTs: receiptMs,
    })
  );

  const persistedState = await loadActiveTimerState();
  await saveBackgroundTaskDiagnostics({
    lastRunAtMs: receiptMs,
    lastSpeedKmh: latestSample.speedKmh ?? 0,
    persistedStatus: persistedState?.status ?? 'missing',
    lastTriggeredAlertKey: null,
  });
  if (!persistedState || !persistedState.currentSegmentStart) {
    await clearBackgroundAlertState();
    return;
  }

  let machineState = createTachoStateFromPersisted(persistedState, receiptMs);
  const initialMachineState = machineState;
  const segmentStartMs = new Date(machineState.currentSegmentStart || '').getTime();
  if (!Number.isFinite(segmentStartMs)) {
    await clearBackgroundAlertState();
    return;
  }

  const commands: TachoCommand[] = [];
  const diagnosticRecords: MotionDiagnosticRecord[] = [];
  if (machineState.status === 'working') {
    for (const sample of samples) {
      const totalsBefore = { ...machineState.totals };
      const previousDriving = machineState.isDriving;
      const isDuplicate = sample.sampleTs <= machineState.motion.lastLocationTs;
      const isStale =
        !hasFreshLatestSample &&
        receiptMs - sample.sampleTs > BACKGROUND_SAMPLE_STALE_MS;
      const canApplyStaleStop =
        isStale &&
        machineState.isDriving &&
        typeof sample.speedKmh === 'number' &&
        sample.speedKmh <= STILL_SPEED_THRESHOLD_KMH;
      const ignoredReason = isDuplicate
        ? 'duplicate'
        : isStale && !canApplyStaleStop
          ? 'stale'
          : null;
      if (ignoredReason) {
        diagnosticRecords.push({
          receiptTimeMs: receiptMs,
          sampleTimeMs: sample.sampleTs,
          appState: 'background',
          source: 'background_location',
          gpsSpeedKmh: sample.speedKmh,
          computedSpeedKmh: null,
          selectedSpeedKmh: sample.speedKmh,
          selectedSpeedSource: sample.speedKmh === null ? 'none' : 'gps',
          accuracyM: sample.accuracyM,
          previousDriving,
          nextDriving: previousDriving,
          movingSinceMs: machineState.motion.movingSinceMs,
          stationarySinceMs: machineState.motion.stationarySinceMs,
          ignoredReason,
          reducerEventApplied: null,
          totalsBefore,
          totalsAfter: totalsBefore,
        });
        continue;
      }
      const speedResult = reduceTachoEvent(machineState, {
        type: 'BACKGROUND_SPEED_SAMPLE_RECEIVED',
        nowMs: sample.sampleTs,
        receiptTs: receiptMs,
        speedKmh: sample.speedKmh ?? 0,
        sampleTs: sample.sampleTs,
      });
      machineState = speedResult.state;
      commands.push(...speedResult.commands);
      diagnosticRecords.push({
        receiptTimeMs: receiptMs,
        sampleTimeMs: sample.sampleTs,
        appState: 'background',
        source: 'background_location',
        gpsSpeedKmh: sample.speedKmh,
        computedSpeedKmh: null,
        selectedSpeedKmh: sample.speedKmh ?? 0,
        selectedSpeedSource: sample.speedKmh === null ? 'none' : 'gps',
        accuracyM: sample.accuracyM,
        previousDriving,
        nextDriving: machineState.isDriving,
        movingSinceMs: machineState.motion.movingSinceMs,
        stationarySinceMs: machineState.motion.stationarySinceMs,
        ignoredReason: speedResult.commands.length === 0 && machineState.isDriving === previousDriving
          ? 'no_reducer_change'
          : null,
        reducerEventApplied: 'BACKGROUND_SPEED_SAMPLE_RECEIVED',
        totalsBefore,
        totalsAfter: { ...machineState.totals },
      });
    }
  }

  let forcedStaleDrivingStop = false;
  if (
    machineState.status === 'working' &&
    machineState.isDriving &&
    latestSampleAgeMs > BACKGROUND_SAMPLE_STALE_MS
  ) {
    const stopAtMs = Math.max(machineState.lastTickMs, latestSample.sampleTs);
    const staleStopResult = reduceTachoEvent(machineState, {
      type: 'DRIVING_DECISION_RECEIVED',
      nowMs: stopAtMs,
      nextDriving: false,
      source: 'background',
      effectiveTransitionMs: latestSample.sampleTs,
    });
    forcedStaleDrivingStop =
      staleStopResult.state.isDriving !== machineState.isDriving ||
      staleStopResult.commands.length > 0;
    machineState = staleStopResult.state;
    commands.push(...staleStopResult.commands);
  }

  const tickResult = reduceTachoEvent(machineState, {
    type: 'TIMER_TICK',
    nowMs: receiptMs,
  });
  const finalState = tickResult.state;
  commands.push(...tickResult.commands);
  if (diagnosticRecords.length > 0) {
    await appendMotionDiagnosticsRing(diagnosticRecords);
  }

  await saveActiveTimerState(
    toPersistedTachoState(
      finalState,
      persistedState.userStorageKey ? persistedState.userStorageKey : undefined,
      {
        userId: persistedState.userId,
        savedAtMs: receiptMs,
        lastCheckpointAtMs: persistedState.lastCheckpointAtMs,
        activitySegmentStartTime: persistedState.activitySegmentStartTime,
      },
    ),
  );

  await appendTimerDiagnosticsRing({
    ts: receiptMs,
    event: 'background_task',
    sessionId: finalState.sessionId,
    source: 'expo_location_task',
    reason: 'locations_processed',
    statusBefore: initialMachineState.status,
    statusAfter: finalState.status,
    snapshotBefore: buildBackgroundTimerSnapshot(
      initialMachineState,
      persistedState.activitySegmentStartTime,
    ),
    snapshotAfter: buildBackgroundTimerSnapshot(
      finalState,
      persistedState.activitySegmentStartTime,
    ),
    success: true,
    details: {
      sampleCount: samples.length,
      diagnosticRecordCount: diagnosticRecords.length,
      latestSpeedKmh: latestSample.speedKmh ?? null,
      latestSampleAgeMs,
      hasFreshLatestSample,
      forcedStaleDrivingStop,
      commandTypes: commands.map(command => command.type),
    },
  });

  for (const command of commands) {
    if (
      command.type === 'trigger_alert' &&
      BACKGROUND_DRIVE_ALERT_KEYS.includes(command.alertKey)
    ) {
      await scheduleBackgroundAlert(command.alertKey);
      await saveBackgroundTaskDiagnostics({
        lastRunAtMs: receiptMs,
        lastSpeedKmh: latestSample.speedKmh ?? 0,
        persistedStatus: finalState.status,
        lastTriggeredAlertKey: command.alertKey,
      });
    }
    if (
      command.type === 'cancel_alerts' &&
      (command.target === 'all' || command.target === 'drive')
    ) {
      await clearHourwiseTimerNotificationsByScope('drive');
      await clearScheduledDriveAlerts();
    }
  }
});

registerRootComponent(App);
