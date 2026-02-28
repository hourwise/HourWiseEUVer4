import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
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

// Helper to get all relevant permission statuses
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

export const usePermissions = () => {
  const [state, setState] = useState<PermissionState | null>(null);
  const [areAllGranted, setAreAllGranted] = useState(false);

  const refresh = useCallback(async (retryCount = 0): Promise<PermissionState> => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    // 1. Get the current status
    let statuses = await getPermissions();

    // 2. THE ANDROID FIX: If background is denied but we just returned from settings,
    // wait 800ms and try one more time. This clears the OS permission cache.
    if (Platform.OS === 'android' && !statuses.backgroundLocation.isGranted && retryCount < 2) {
      await new Promise(resolve => setTimeout(resolve, 800));
      return refresh(retryCount + 1);
    }

    setState(statuses);
    // The navigator ONLY cares about these three.
    const criticalPermissionsGranted = statuses.location.isGranted && statuses.backgroundLocation.isGranted && statuses.notifications.isGranted;
    setAreAllGranted(criticalPermissionsGranted);
    return statuses;
  }, []);

  const request = useCallback(async (): Promise<PermissionState> => {
    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('messages', {
        name: 'Messages',
        importance: Notifications.AndroidImportance.MAX,
      });
    }

    try {
      await Notifications.requestPermissionsAsync();
      const { status: foreStatus } = await Location.requestForegroundPermissionsAsync();

      if (foreStatus === 'granted') {
        // This will often send the user to System Settings
        await Location.requestBackgroundPermissionsAsync();
      }
    } catch (e) { console.error("Location permission error:", e); }
    try { await ImagePicker.requestCameraPermissionsAsync(); } catch (e) { console.error("Camera permission error:", e); }
    try { await MediaLibrary.requestPermissionsAsync(); } catch (e) { console.error("MediaLibrary permission error:", e); }

    // Refresh once immediately, then again with the Android-specific delay
    return refresh();
  }, [refresh]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  return {
    state,
    areAllGranted,
    request,
    refresh,
  };
};
