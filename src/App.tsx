import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StatusBar } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n from './lib/i18n';

import { AuthProvider } from './providers/AuthProvider';
import { SubscriptionProvider } from './providers/SubscriptionProvider';
import { PermissionsProvider } from './providers/PermissionsProvider';
import AppNavigator from './navigation/AppNavigator';

// Define the background location task
const LOCATION_TASK_NAME = 'background-location-task';
const BG_SPEED_KEY = 'bg_last_speed_v1';

TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  if (!data) return;

  const { locations } = data as any;
  const loc = locations[0];
  if (!loc) return;

  const accuracy = loc.coords.accuracy ?? 9999;
  if (accuracy > 60) return; // ignore poor fixes

  const speedKmh = Math.max(0, (loc.coords.speed ?? 0) * 3.6);

  // Just write a breadcrumb — the hook reads this on foreground return
  await AsyncStorage.setItem(BG_SPEED_KEY, JSON.stringify({
    speedKmh,
    ts: Date.now(),
  }));
});

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    priority: Notifications.AndroidNotificationPriority.MAX,
  }),
});

export default function App() {
  const [i18nReady, setI18nReady] = useState(i18n.isInitialized);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        if (!i18n.isInitialized) {
          // i18n is initialized in src/lib/i18n.ts, but we check here just in case
          // if it's not initialized, it will initialize itself due to the .init() call in src/lib/i18n.ts
          // We just wait for it to be ready.
          await new Promise<void>((resolve) => {
            if (i18n.isInitialized) resolve();
            i18n.on('initialized', () => resolve());
          });
        }
        if (mounted) setI18nReady(true);
      } catch (e) {
        console.error('Init error:', e);
      }
    };

    if (!i18nReady) {
      init();
    }

    return () => { mounted = false; };
  }, [i18nReady]);

  if (!i18nReady) {
    return (
      <View
        style={{
          flex: 1,
          backgroundColor: '#0f172a',
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        <StatusBar barStyle="light-content" />
        <ActivityIndicator size="large" color="#60a5fa" />
      </View>
    );
  }

  return (
    <AuthProvider>
      <SubscriptionProvider>
        <PermissionsProvider>
          <AppNavigator />
        </PermissionsProvider>
      </SubscriptionProvider>
    </AuthProvider>
  );
}
