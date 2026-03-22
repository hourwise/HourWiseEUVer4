import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StatusBar, Platform, Linking, Alert } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import AsyncStorage from '@react-native-async-storage/async-storage';
import i18n, { i18nConfig } from './lib/i18n';

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
  const [i18nReady, setI18nReady] = useState(false);

  useEffect(() => {
    let mounted = true;

    const init = async () => {
      try {
        if (!i18n.isInitialized) {
          await i18n.init(i18nConfig);
        }
        if (mounted) setI18nReady(true);
      } catch (e) {
        console.error('Init error:', e);
      }
    };

    init();
    return () => { mounted = false; };
  }, []);

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
