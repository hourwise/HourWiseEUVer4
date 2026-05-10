import React, { useEffect, useState } from 'react';
import { View, ActivityIndicator, StatusBar } from 'react-native';
import * as Notifications from 'expo-notifications';
import { ensureI18nInitialized } from './lib/i18n';
import { ensureNotificationChannelsInitialized } from './lib/notifications';

import { AuthProvider } from './providers/AuthProvider';
import { SubscriptionProvider } from './providers/SubscriptionProvider';
import { PermissionsProvider } from './providers/PermissionsProvider';
import AppNavigator from './navigation/AppNavigator';
import ErrorBoundary from './components/ErrorBoundary';

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
        await ensureI18nInitialized();
        await ensureNotificationChannelsInitialized();
        if (mounted) setI18nReady(true);
      } catch (e) {
        console.error('Init error:', e);
      }
    };

    init();
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
    <ErrorBoundary>
      <AuthProvider>
        <SubscriptionProvider>
          <PermissionsProvider>
            <AppNavigator />
          </PermissionsProvider>
        </SubscriptionProvider>
      </AuthProvider>
    </ErrorBoundary>
  );
}
