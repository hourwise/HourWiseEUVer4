// File: index.ts
import { registerRootComponent } from 'expo';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import AsyncStorage from '@react-native-async-storage/async-storage';
import App from './src/App';

export const LOCATION_TASK_NAME = 'background-location-task';
export const BACKGROUND_SPEED_KEY = 'bg_last_speed_v1';

// This handles the data when the app is in the background
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }: any) => {
  if (error) {
    console.error('Background Location Task Error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    if (locations && locations.length > 0) {
      const speed = Math.max(0, (locations[0].coords.speed || 0) * 3.6);
      // Persist speed for useWorkTimer to pick up
      await AsyncStorage.setItem(BACKGROUND_SPEED_KEY, JSON.stringify({ speedKmh: speed, ts: Date.now() }));
    }
  }
});

registerRootComponent(App);
