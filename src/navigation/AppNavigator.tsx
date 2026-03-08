import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { View, TouchableOpacity, Text, SafeAreaView, StatusBar } from 'react-native';

import { useAuth } from '../providers/AuthProvider';
import { useSubscriptionData } from '../providers/SubscriptionProvider';
import { usePermissions } from '../providers/PermissionsProvider';

import Auth from '../components/Auth';
import LoadingScreen from '../components/LoadingScreen';
import Dashboard from '../screens/Dashboard';
import PermissionsScreen from '../screens/PermissionsScreen';
import FirstTimeSetupGuide from '../components/FirstTimeSetupGuide';
import DriverSetup from '../components/DriverSetup';
import PaywallScreen from '../screens/PaywallScreen';
import AccountManagementScreen from '../screens/AccountManagementScreen';
import MessagesScreen from '../screens/MessagesScreen';
import CalendarView from '../components/CalendarView';

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
  const { session, needsSetup, needsLastShiftEntry, loading: authLoading } = useAuth();
  const { isSubscribed, isLoading: subscriptionLoading } = useSubscriptionData();
  const { areAllGranted } = usePermissions();

  console.log("NAVIGATOR STATE:", {
    authLoading,
    subscriptionLoading,
    session: !!session,
    needsSetup,
    needsLastShiftEntry,
    areAllGranted,
    isSubscribed,
  });

  if (authLoading || subscriptionLoading) {
    return <LoadingScreen />;
  }

  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session ? (
          <Stack.Screen name="Auth" component={Auth} />
        ) : needsSetup ? (
          <Stack.Screen name="Setup" component={SetupStack} />
        ) : needsLastShiftEntry ? (
          <Stack.Screen name="OnboardingCalendar" component={OnboardingCalendar} />
        ) : areAllGranted !== true ? (
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
