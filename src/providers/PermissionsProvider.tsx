import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { Platform, AppState, Alert } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import * as IntentLauncher from 'expo-intent-launcher';

export interface PermissionStatus {
  isGranted: boolean;
  canAskAgain: boolean;
}

export interface PermissionState {
  notifications: PermissionStatus;
  location: PermissionStatus;
  backgroundLocation: PermissionStatus;
  camera: PermissionStatus;
  mediaLibrary: PermissionStatus;
}

interface PermissionsContextType {
  state: PermissionState | null;
  areAllGranted: boolean | null;
  request: () => Promise<PermissionState>;
  refresh: () => Promise<PermissionState>;
}

const PermissionsContext = createContext<PermissionsContextType | undefined>(undefined);

const withTimeout = async <T,>(p: Promise<T>, ms = 5000): Promise<T> => {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
};

const setupNotificationChannels = async () => {
  if (Platform.OS !== 'android') return;

  // 1. Standard Messages
  await Notifications.setNotificationChannelAsync('messages', {
    name: 'Messages',
    importance: Notifications.AndroidImportance.DEFAULT,
  });

  // 2. Default Compliance Alerts (Fallback)
  await Notifications.setNotificationChannelAsync('compliance-alerts-v6', {
    name: 'Compliance Alerts',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 250, 250, 250, 500, 250, 250, 250],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });

  // 3. 15 Minute Warning
  await Notifications.setNotificationChannelAsync('channel-15min-v6', {
    name: '15 Minute Warning',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });

  // 4. 30 Minute Warning
  await Notifications.setNotificationChannelAsync('channel-30min-v6', {
    name: '30 Minute Warning',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 500, 200, 500, 200, 500],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });

  // 5. Critical Warning
  await Notifications.setNotificationChannelAsync('channel-critical-v6', {
    name: 'Critical Warning',
    importance: Notifications.AndroidImportance.MAX,
    sound: 'default',
    enableVibrate: true,
    vibrationPattern: [0, 500, 100, 500, 100, 500, 100, 1000],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: true,
  });
};

const getPermissions = async (): Promise<PermissionState> => {
  const [notifications, location, backgroundLocation, camera, mediaLibrary] = await Promise.all([
    Notifications.getPermissionsAsync(),
    Location.getForegroundPermissionsAsync(),
    Location.getBackgroundPermissionsAsync(),
    ImagePicker.getCameraPermissionsAsync(),
    MediaLibrary.getPermissionsAsync(),
  ]);

  return {
    notifications: { isGranted: notifications.status === 'granted', canAskAgain: notifications.canAskAgain },
    location: { isGranted: location.status === 'granted', canAskAgain: location.canAskAgain },
    backgroundLocation: { isGranted: backgroundLocation.status === 'granted', canAskAgain: backgroundLocation.canAskAgain },
    camera: { isGranted: camera.status === 'granted', canAskAgain: camera.canAskAgain },
    mediaLibrary: { isGranted: mediaLibrary.status === 'granted', canAskAgain: mediaLibrary.canAskAgain },
  };
};

const requestBatteryOptimizationExemption = async () => {
  if (Platform.OS !== 'android') return;
  Alert.alert(
    'Battery Optimization',
    "To ensure driving timers and alerts work reliably in the background, please set HourWise to 'Unrestricted'.",
    [
      { text: 'Not Now', style: 'cancel' },
      {
        text: 'Open Settings',
        onPress: async () => {
          try {
            await IntentLauncher.startActivityAsync(
              IntentLauncher.ActivityAction.REQUEST_IGNORE_BATTERY_OPTIMIZATIONS,
              { data: 'package:com.PCGsoft.hourwise.eu' }
            );
          } catch (e) {
            // Fallback to general battery settings if direct intent fails
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
};

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PermissionState | null>(null);
  const [areAllGranted, setAreAllGranted] = useState<boolean | null>(null);

  const refresh = useCallback(async (): Promise<PermissionState> => {
    try {
      await withTimeout(setupNotificationChannels(), 5000);
    } catch (e) {
      console.warn('Notification channel setup timed out', e);
    }

    let statuses: PermissionState;
    try {
      statuses = await withTimeout(getPermissions(), 5000);
    } catch (e) {
      console.warn('getPermissions timed out', e);
      statuses = {
        notifications: { isGranted: false, canAskAgain: true },
        location: { isGranted: false, canAskAgain: true },
        backgroundLocation: { isGranted: false, canAskAgain: true },
        camera: { isGranted: false, canAskAgain: true },
        mediaLibrary: { isGranted: false, canAskAgain: true },
      };
    }

    setState(statuses);
    const criticalGranted =
      statuses.location.isGranted &&
      statuses.backgroundLocation.isGranted &&
      statuses.notifications.isGranted;

    setAreAllGranted(criticalGranted);
    return statuses;
  }, []);

  const request = useCallback(async (): Promise<PermissionState> => {
    try {
      await withTimeout(setupNotificationChannels(), 5000);
    } catch (e) {
        console.warn('Timed out setting up channels during request', e);
    }

    try {
      await Notifications.requestPermissionsAsync({
        ios: {
          allowAlert: true,
          allowBadge: true,
          allowSound: true,
          allowCriticalAlerts: true,
        },
      });
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const { status: bgStatus } = await Location.requestBackgroundPermissionsAsync();
        if (bgStatus === 'granted') {
          await requestBatteryOptimizationExemption();
        }
      }
    } catch (e) { console.error("Permission request error:", e); }
    try { await ImagePicker.requestCameraPermissionsAsync(); } catch (e) {}
    try { await MediaLibrary.requestPermissionsAsync(); } catch (e) {}

    return refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refresh();
    });
    return () => sub.remove();
  }, [refresh]);

  return (
    <PermissionsContext.Provider value={{ state, areAllGranted, request, refresh }}>
      {children}
    </PermissionsContext.Provider>
  );
};

export const usePermissions = () => {
  const context = useContext(PermissionsContext);
  if (!context) throw new Error('usePermissions must be used within a PermissionsProvider');
  return context;
};
