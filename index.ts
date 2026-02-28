// File: index.ts
import { registerRootComponent } from 'expo';
import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import App from './src/App';

export const LOCATION_TASK_NAME = 'background-location-task';

// This handles the data when the app is in the background
TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }: any) => {
  if (error) {
    console.error('Background Location Task Error:', error);
    return;
  }
  if (data) {
    const { locations } = data;
    // You can optionally persist the last known speed to AsyncStorage
    // here so useWorkTimer can pick it up immediately on wake-up.
    const speed = locations[0].coords.speed * 3.6;
    // console.log('Background Speed:', speed);
  }
});

registerRootComponent(App);