import { useState, useEffect, useCallback } from 'react';
import { Platform } from 'react-native';
import * as Notifications from 'expo-notifications';
import * as Location from 'expo-location';
import * as ImagePicker from 'expo-image-picker';
import * as MediaLibrary from 'expo-media-library';
import { Accelerometer } from 'expo-sensors';

export type PermissionState = Location.PermissionStatus | 'granted' | 'denied' | 'undetermined';

export interface PermissionMap {
  notifications: PermissionState;
  location: PermissionState;
  backgroundLocation: PermissionState;
  camera: PermissionState;
  mediaLibrary: PermissionState;
  accelerometer: PermissionState;
}

export const usePermissions = () => {
  const [permissionState, setPermissionState] = useState<PermissionMap | null>(null);

  const getPermissionsStatus = useCallback(async (): Promise<PermissionMap> => {
    try {
      const [
        notifications,
        location,
        backgroundLocation,
        camera,
        mediaLibrary,
        accelerometer,
      ] = await Promise.all([
        Notifications.getPermissionsAsync(),
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
        ImagePicker.getCameraPermissionsAsync(),
        Platform.OS === 'web' ? { status: 'granted' } : MediaLibrary.getPermissionsAsync(),
        Accelerometer.getPermissionsAsync(),
      ]);

      return {
        notifications: notifications.status,
        location: location.status,
        backgroundLocation: backgroundLocation.status,
        camera: camera.status,
        mediaLibrary: mediaLibrary.status,
        accelerometer: accelerometer.status,
      };
    } catch (e) {
      console.error('getPermissionsStatus failed:', e);
      // IMPORTANT: return a safe default so AppNavigator can continue
      return {
        notifications: 'undetermined',
        location: 'undetermined',
        backgroundLocation: 'undetermined',
        camera: 'undetermined',
        mediaLibrary: 'undetermined',
        accelerometer: 'undetermined',
      };
    }
  }, []);

  const requestAllPermissions = useCallback(async (): Promise<PermissionMap> => {
    await Notifications.requestPermissionsAsync();
    const { status: fgStatus } = await Location.requestForegroundPermissionsAsync();
    
    if (fgStatus === 'granted') {
        await Location.requestBackgroundPermissionsAsync();
    }
    
    await ImagePicker.requestCameraPermissionsAsync();

    if (Platform.OS !== 'web') {
        await MediaLibrary.requestPermissionsAsync();
    }
    
    await Accelerometer.requestPermissionsAsync();
    
    // After requesting, refresh the state with the final results
    const finalStatuses = await getPermissionsStatus();
    setPermissionState(finalStatuses);
    return finalStatuses;
  }, [getPermissionsStatus]);
  
  const refreshPermissions = useCallback(async () => {
    const statuses = await getPermissionsStatus();
    setPermissionState(statuses);
  }, [getPermissionsStatus]);

  useEffect(() => {
    // Initial check on mount
    refreshPermissions();
  }, [refreshPermissions]);

  return { permissionState, requestAllPermissions, refreshPermissions };
};
