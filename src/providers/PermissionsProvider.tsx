import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { Platform, AppState } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';

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

const setupNotificationChannels = async () => {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('messages', {
      name: 'Messages',
      importance: Notifications.AndroidImportance.DEFAULT,
    });
    await Notifications.setNotificationChannelAsync('compliance-alerts', {
      name: 'Compliance Alerts',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      sound: 'default',
    });
  }
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

export const PermissionsProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<PermissionState | null>(null);
  const [areAllGranted, setAreAllGranted] = useState<boolean | null>(null);

  const refresh = useCallback(async (retryCount = 0): Promise<PermissionState> => {
    await setupNotificationChannels();
    let statuses = await getPermissions();

    // Android background location cache fix
    if (Platform.OS === 'android' && !statuses.backgroundLocation.isGranted && retryCount < 2) {
      await new Promise(resolve => setTimeout(resolve, 800));
      return refresh(retryCount + 1);
    }

    setState(statuses);
    const criticalGranted = statuses.location.isGranted && statuses.backgroundLocation.isGranted && statuses.notifications.isGranted;
    setAreAllGranted(criticalGranted);
    return statuses;
  }, []);

  const request = useCallback(async (): Promise<PermissionState> => {
    await setupNotificationChannels();
    try {
      await Notifications.requestPermissionsAsync();
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') await Location.requestBackgroundPermissionsAsync();
    } catch (e) { console.error("Permission error:", e); }
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
