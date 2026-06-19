import * as Notifications from 'expo-notifications';

import { ALERT_TEXT } from './alerts';
import type { ScheduledAlertScope } from './types';

const ALERT_CHANNEL_IDS = new Set<string>(
  Object.values(ALERT_TEXT)
    .map(config => config.channelId)
    .filter(channelId => !!channelId),
);

export const isHourwiseTimerAlertNotification = (notification: any) => {
  const content = notification?.content ?? notification?.request?.content;
  const data = content?.data as Record<string, any> | undefined;
  if (data?.hourwiseAlert === true) return true;

  const channelId = content?.channelId ?? data?.channelId;
  const categoryIdentifier = content?.categoryIdentifier;
  return (
    typeof channelId === 'string' &&
    ALERT_CHANNEL_IDS.has(channelId) &&
    (!categoryIdentifier || categoryIdentifier === 'alarm')
  );
};

const hasHourwiseScope = (
  notification: any,
  scope: ScheduledAlertScope,
) => {
  const content = notification?.content ?? notification?.request?.content;
  const data = content?.data as Record<string, any> | undefined;
  return data?.hourwiseAlert === true && data.scope === scope;
};

export const clearHourwiseTimerNotificationsByScope = async (
  scope?: ScheduledAlertScope,
  options?: { cancelAllScheduledFallback?: boolean },
) => {
  const [scheduledRequests, presentedNotifications] = await Promise.all([
    Notifications.getAllScheduledNotificationsAsync().catch(() => [] as any[]),
    Notifications.getPresentedNotificationsAsync().catch(() => [] as any[]),
  ]);

  const shouldClear = (notification: any) =>
    scope
      ? hasHourwiseScope(notification, scope)
      : isHourwiseTimerAlertNotification(notification);

  await Promise.all([
    ...scheduledRequests
      .filter(shouldClear)
      .map(request =>
        Notifications.cancelScheduledNotificationAsync(request.identifier).catch(() => {}),
      ),
    ...presentedNotifications
      .filter(shouldClear)
      .map(notification =>
        Notifications.dismissNotificationAsync(notification.request.identifier).catch(() => {}),
      ),
  ]);

  if (!scope && options?.cancelAllScheduledFallback) {
    await Notifications.cancelAllScheduledNotificationsAsync().catch(() => {});
  }
};

export const clearAllHourwiseTimerNotifications = async () =>
  clearHourwiseTimerNotificationsByScope(undefined, { cancelAllScheduledFallback: true });
