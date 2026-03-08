import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StatusBar, Platform, Linking, Alert } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as Notifications from 'expo-notifications';
import * as IntentLauncher from 'expo-intent-launcher';
import i18n, { i18nConfig } from './lib/i18n';

import { AuthProvider } from './providers/AuthProvider';
import { SubscriptionProvider } from './providers/SubscriptionProvider';
import { PermissionsProvider } from './providers/PermissionsProvider';
import AppNavigator from './navigation/AppNavigator';

// Define the background location task
const LOCATION_TASK_NAME = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  if (data) {
    const { locations } = data as any;
    console.log('Received background location update:', locations);
  }
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

    const initI18n = async () => {
      try {
        if (!i18n.isInitialized) {
          await i18n.init(i18nConfig);
        }
        if (mounted) {
          setI18nReady(true);
        }
      } catch (e) {
        console.error('Failed to initialize i18next:', e);
      }
    };

    const checkBatteryOptimization = async () => {
      if (Platform.OS === 'android') {
        // In a real production app, you might use a native module to check this status.
        // For now, we provide a way for the user to jump to settings if they experience issues.
        // This is highly recommended for drivers to ensure alarms fire on time.
      }
    };

    initI18n();
    checkBatteryOptimization();

    return () => {
      mounted = false;
    };
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
