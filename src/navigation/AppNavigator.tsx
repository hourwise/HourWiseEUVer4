import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, TouchableOpacity, Text, SafeAreaView, StatusBar } from 'react-native';

import { useAuth } from '../providers/AuthProvider';
import { useBootState } from '../hooks/useBootState';

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
import { useTranslation } from 'react-i18next';

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
  const { t } = useTranslation();
  const { session, completeLastShiftEntry } = useAuth();
  if (!session) return null;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#0f172a' }}>
      <StatusBar barStyle="light-content" />
      <View style={{ flex: 1 }}>
        <View style={{ padding: 16, borderBottomWidth: 1, borderBottomColor: '#334155' }}>
          <Text style={{ fontSize: 18, fontWeight: 'bold', color: 'white', textAlign: 'center' }}>{t('onboardingLastShift.title')}</Text>
          <Text style={{ color: '#94A3B8', textAlign: 'center', marginTop: 4 }}>{t('onboardingLastShift.body')}</Text>
        </View>
        <CalendarView
          userId={session.user.id}
          timezone={Intl.DateTimeFormat().resolvedOptions().timeZone}
          onClose={() => {}}
          onDataChanged={() => {}}
        />
        <View style={{ padding: 16, borderTopWidth: 1, borderTopColor: '#334155' }}>
          <TouchableOpacity onPress={completeLastShiftEntry} style={{ backgroundColor: '#2563EB', padding: 12, borderRadius: 8 }}>
            <Text style={{ color: 'white', fontWeight: 'bold', textAlign: 'center' }}>{t('onboardingLastShift.done')}</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};


export default function AppNavigator() {
  const { t } = useTranslation();
  const bootState = useBootState();
  const { session, stage } = bootState;

  if (__DEV__) {
    console.log('[AppNavigator] boot stage', {
      bootStage: stage,
      session: !!session,
      needsSetup: bootState.needsSetup,
      needsLastShiftEntry: bootState.needsLastShiftEntry,
      permissionsReady: bootState.permissionsReady,
      subscriptionReady: bootState.subscriptionReady,
      paywallPolicy: bootState.paywallPolicy,
      subscriptionActive: bootState.subscriptionActive,
      hasAccess: bootState.hasAccess,
    });
  }

  if (stage === 'error') {
    return (
      <BootstrappingScreen
        title={t('startup.needsAttention')}
        message={bootState.error || t('startup.failed')}
      />
    );
  }

  if (stage === 'app_init' || stage === 'auth_resolving' || stage === 'profile_bootstrapping') {
    return <BootstrappingScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {stage === 'signed_out' ? (
          <Stack.Screen name="Auth" component={Auth} />
        ) : stage === 'onboarding_setup' ? (
          <Stack.Screen name="Setup" component={SetupStack} />
        ) : stage === 'onboarding_last_shift' ? (
          <Stack.Screen name="OnboardingCalendar" component={OnboardingCalendar} />
        ) : stage === 'permissions_gate' ? (
          <Stack.Screen name="Permissions" component={PermissionsScreen} />
        ) : stage === 'paywall_gate' ? (
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
