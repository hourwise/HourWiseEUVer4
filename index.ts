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
  clearBackgroundAlertState,
  loadActiveTimerState,
  saveBackgroundTaskDiagnostics,
  saveActiveTimerState,
} from './src/lib/tacho/runtimeStorage';
import {
  createTachoStateFromPersisted,
  toPersistedTachoState,
} from './src/lib/tacho/machine';
import { reduceTachoEvent } from './src/lib/tacho/reducer';

export const LOCATION_TASK_NAME = 'background-location-task';
export const BACKGROUND_SPEED_KEY = 'bg_last_speed_v1';

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

  const speed = Math.max(0, (data.locations[0].coords.speed || 0) * 3.6);
  const nowMs = Date.now();

  await AsyncStorage.setItem(
    BACKGROUND_SPEED_KEY,
    JSON.stringify({ speedKmh: speed, ts: nowMs })
  );

  const persistedState = await loadActiveTimerState();
  await saveBackgroundTaskDiagnostics({
    lastRunAtMs: nowMs,
    lastSpeedKmh: speed,
    persistedStatus: persistedState?.status ?? 'missing',
    lastTriggeredAlertKey: null,
  });
  if (!persistedState || !persistedState.currentSegmentStart) {
    await clearBackgroundAlertState();
    return;
  }

  const machineState = createTachoStateFromPersisted(persistedState, nowMs);
  const segmentStartMs = new Date(machineState.currentSegmentStart || '').getTime();
  if (!Number.isFinite(segmentStartMs)) {
    await clearBackgroundAlertState();
    return;
  }

  const tickResult = reduceTachoEvent(machineState, {
    type: 'TIMER_TICK',
    nowMs,
  });

  const speedResult = tickResult.state.status === 'working'
    ? reduceTachoEvent(tickResult.state, {
        type: 'BACKGROUND_SPEED_SAMPLE_RECEIVED',
        nowMs,
        speedKmh: speed,
        sampleTs: nowMs,
      })
    : { state: tickResult.state, commands: [] };

  const finalState = speedResult.state;
  const commands = [...tickResult.commands, ...speedResult.commands];

  await saveActiveTimerState(
    toPersistedTachoState(
      finalState,
      persistedState.userStorageKey ? persistedState.userStorageKey : undefined,
    ),
  );

  for (const command of commands) {
    if (
      command.type === 'trigger_alert' &&
      BACKGROUND_DRIVE_ALERT_KEYS.includes(command.alertKey)
    ) {
      await scheduleBackgroundAlert(command.alertKey);
      await saveBackgroundTaskDiagnostics({
        lastRunAtMs: nowMs,
        lastSpeedKmh: speed,
        persistedStatus: finalState.status,
        lastTriggeredAlertKey: command.alertKey,
      });
    }
  }
});

registerRootComponent(App);
