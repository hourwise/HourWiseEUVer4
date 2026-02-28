import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../providers/AuthProvider';
import { useSubscriptionData } from '../providers/SubscriptionProvider';
import { usePermissions } from '../hooks/usePermissions';

import Auth from '../components/Auth';
import LoadingScreen from '../components/LoadingScreen';
import Dashboard from '../screens/Dashboard';
import PermissionsScreen from '../screens/PermissionsScreen';
import FirstTimeSetupGuide from '../components/FirstTimeSetupGuide';
import DriverSetup from '../components/DriverSetup';
import PaywallScreen from '../screens/PaywallScreen';
import AccountManagementScreen from '../screens/AccountManagementScreen';
import MessagesScreen from '../screens/MessagesScreen'; // 1. Import the new screen

const Stack = createNativeStackNavigator();

const SetupStack = () => {
  const { session } = useAuth();
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="FirstTimeSetup" component={FirstTimeSetupGuide} />
      <Stack.Screen name="DriverSetup">
        {(props) => <DriverSetup {...props} session={session} />}
      </Stack.Screen>
    </Stack.Navigator>
  );
};

export default function AppNavigator() {
  const { session, needsSetup, loading: authLoading } = useAuth();
  const { isSubscribed, isLoading: subscriptionLoading } = useSubscriptionData();
  const { areAllGranted, state: permissionState } = usePermissions();

  if (authLoading || subscriptionLoading || (session && permissionState === null)) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Auth" component={Auth} />
        ) : needsSetup ? (
          <Stack.Screen name="Setup" component={SetupStack} />
        ) : !areAllGranted ? (
          <Stack.Screen name="Permissions" component={PermissionsScreen} />
        ) : !isSubscribed ? (
          <Stack.Screen name="Paywall" component={PaywallScreen} />
        ) : (
          <>
            <Stack.Screen name="Dashboard">
              {(props) => <Dashboard {...props} session={session} />}
            </Stack.Screen>
            <Stack.Screen name="AccountManagement" component={AccountManagementScreen} />
            <Stack.Screen name="Messages" component={MessagesScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
