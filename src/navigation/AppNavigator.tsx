import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, TouchableOpacity, Text, SafeAreaView, StatusBar } from 'react-native';

import { useAuth } from '../providers/AuthProvider';
import { useSubscriptionData } from '../providers/SubscriptionProvider';
import { usePermissions } from '../providers/PermissionsProvider';

import Auth from '../components/Auth';
import Dashboard from '../screens/Dashboard';
import PermissionsScreen from '../screens/PermissionsScreen';
import FirstTimeSetupGuide from '../components/FirstTimeSetupGuide';
import DriverSetup from '../components/DriverSetup';
import PaywallScreen from '../screens/PaywallScreen';
import AccountManagementScreen from '../screens/AccountManagementScreen';
import MessagesScreen from '../screens/MessagesScreen';
import SettingsScreen from '../screens/SettingsScreen';
import MyScheduleScreen from '../screens/MyScheduleScreen';
import BootstrappingScreen from '../screens/BootstrappingScreen';
import CalendarView from '../components/CalendarView';

type BootStage =
  | 'bootstrapping'
  | 'signed_out'
  | 'onboarding_setup'
  | 'onboarding_last_shift'
  | 'permissions_gate'
  | 'paywall_gate'
  | 'ready';

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

const OnboardingCalendar = () => {
  const { session, completeLastShiftEntry } = useAuth();
  if (!session) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1 }}>
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: 'white', textAlign: 'center' }}>Add Your Last Completed Shift</Text>
          <Text style={{ color: '#94A3B8', textAlign: 'center', marginTop: 4 }}>This is crucial for correct daily rest calculation. Tap a date to add a shift.</Text>
        </View>
        <CalendarView
          userId={session.user.id}
          timezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
          onClose={() => {}}
          onDataChanged={() => {}}
        />
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#334155' }}>
          <TouchableOpacity onPress={completeLastShiftEntry} style={{ backgroundColor: '#2563EB', padding: 12, borderRadius: 8 }}>
            <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>Done, Continue Setup</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};


export default function AppNavigator() {
  const {
    session,
    needsSetup,
    needsLastShiftEntry,
    loading: authLoading,
    bootstrapping,
  } = useAuth();
  const {
    hasAccess,
    isLoading: subscriptionLoading,
    paywallPolicy,
    subscriptionActive,
  } = useSubscriptionData();
  const { areAllGranted } = usePermissions();

  const shouldBlockOnSubscription =
    !!session && paywallPolicy === 'enforce' && subscriptionLoading;

  let bootStage: BootStage;
  if (authLoading || bootstrapping || shouldBlockOnSubscription) {
    bootStage = 'bootstrapping';
  } else if (!session) {
    bootStage = 'signed_out';
  } else if (needsSetup) {
    bootStage = 'onboarding_setup';
  } else if (needsLastShiftEntry) {
    bootStage = 'onboarding_last_shift';
  } else if (areAllGranted !== true) {
    bootStage = 'permissions_gate';
  } else if (!hasAccess) {
    bootStage = 'paywall_gate';
  } else {
    bootStage = 'ready';
  }

  console.log('[AppNavigator] boot stage', {
    bootStage,
    authLoading,
    bootstrapping,
    subscriptionLoading,
    paywallPolicy,
    session: !!session,
    needsSetup,
    needsLastShiftEntry,
    areAllGranted,
    subscriptionActive,
  });

  if (bootStage === 'bootstrapping') {
    return <BootstrappingScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {bootStage === 'signed_out' ? (
          <Stack.Screen name="Auth" component={Auth} />
        ) : bootStage === 'onboarding_setup' ? (
          <Stack.Screen name="Setup" component={SetupStack} />
        ) : bootStage === 'onboarding_last_shift' ? (
          <Stack.Screen name="OnboardingCalendar" component={OnboardingCalendar} />
        ) : bootStage === 'permissions_gate' ? (
          <Stack.Screen name="Permissions" component={PermissionsScreen} />
        ) : bootStage === 'paywall_gate' ? (
          <Stack.Screen name="Paywall" component={PaywallScreen} />
        ) : (
          <>
            <Stack.Screen name="Dashboard">
              {(props) => <Dashboard {...props} session={session!} />}
            </Stack.Screen>
            <Stack.Screen name="AccountManagement" component={AccountManagementScreen} />
            <Stack.Screen name="Messages" component={MessagesScreen} />
            <Stack.Screen name="Subscription" component={SettingsScreen} />
            <Stack.Screen name="MySchedule" component={MyScheduleScreen} />
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}
