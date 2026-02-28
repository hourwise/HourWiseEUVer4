import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StatusBar } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import i18n, { i18nConfig } from './lib/i18n';

import { AuthProvider } from './providers/AuthProvider';
import { SubscriptionProvider } from './providers/SubscriptionProvider';
import AppNavigator from './navigation/AppNavigator';

// Define the background location task
const LOCATION_TASK_NAME = 'background-location-task';

TaskManager.defineTask(LOCATION_TASK_NAME, ({ data, error }) => {
  if (error) {
    console.error('Background location task error:', error);
    return;
  }
  if (data) {
    // You can process location updates here if needed, for example,
    // by saving the latest speed to AsyncStorage for the useWorkTimer hook
    // to use when the app resumes.
    const { locations } = data as any;
    console.log('Received background location update:', locations);
  }
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

    initI18n();

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
        <AppNavigator />
      </SubscriptionProvider>
    </AuthProvider>
  );
}
