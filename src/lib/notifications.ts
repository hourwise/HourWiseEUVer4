import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';

let channelsReady = false;

export const setupNotificationChannels = async () => {
  if (Platform.OS !== 'android') {
    channelsReady = true;
    return;
  }

  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.DEFAULT,
  });

  await Notifications.setNotificationChannelAsync('compliance-alerts-v6', {
    name: 'Compliance Alerts',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250, 500, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });

  await Notifications.setNotificationChannelAsync('channel-15min-v6', {
    name: '15 Minute Warning',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });

  await Notifications.setNotificationChannelAsync('channel-30min-v6', {
    name: '30 Minute Warning',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });

  await Notifications.setNotificationChannelAsync('channel-critical-v6', {
    name: 'Critical Warning',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 500, 100, 500, 100, 500, 100, 1000],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });

  channelsReady = true;
};

export const ensureNotificationChannelsInitialized = async () => {
  if (channelsReady) return;
  await setupNotificationChannels();
};
