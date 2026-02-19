import React, { useState } from 'react';
import { View, ActivityIndicator } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import { useAuth } from '../providers/AuthProvider';
import { useSubscriptionData } from '../providers/SubscriptionProvider';
import { usePermissions, PermissionMap } from '../hooks/usePermissions';

import Auth from '../components/Auth';
import { Dashboard } from '../screens/Dashboard';
import PaywallScreen from '../screens/PaywallScreen';
import DriverSetup from '../components/DriverSetup';
import PermissionsScreen from '../screens/PermissionsScreen';
import FirstTimeSetupGuide from '../components/FirstTimeSetupGuide'; // Import the guide

const Stack = createNativeStackNavigator();

const LoadingScreen = () => (
  <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
    <ActivityIndicator size="large" color="white" />
  </View>
);

const areAllPermissionsGranted = (state: PermissionMap | null): boolean => {
  if (!state) return false;
  const criticalPermissions: (keyof PermissionMap)[] = ['location', 'backgroundLocation', 'notifications', 'camera'];
  return criticalPermissions.every(p => state[p] === 'granted');
};

const AppNavigator = () => {
  const { session, profile, loading: authLoading, refreshProfile } = useAuth();
  const { isSubscribed, isLoading: subscriptionLoading } = useSubscriptionData();
  const { permissionState, requestAllPermissions, refreshPermissions } = usePermissions();
  const [showFirstTimeGuide, setShowFirstTimeGuide] = useState(true);


  if (authLoading || subscriptionLoading || (session?.user && !permissionState)) {
    return <LoadingScreen />;
  }

  const isProfileComplete = profile?.full_name && profile.full_name !== profile.email;
  const allPermissionsGranted = areAllPermissionsGranted(permissionState);
  const needsSetup = !isProfileComplete || !allPermissionsGranted;

  const handleCloseFirstTimeGuide = () => {
    setShowFirstTimeGuide(false);
  };
  
  return (
    <NavigationContainer>
      <Stack.Navigator screenOptions={{ headerShown: false }}>
        {!session?.user ? (
          <Stack.Screen name="Auth" component={Auth} />
        ) : needsSetup && showFirstTimeGuide ? (
            <Stack.Screen name="FirstTimeSetup">
                {() => <FirstTimeSetupGuide visible={true} onClose={handleCloseFirstTimeGuide} />}
            </Stack.Screen>
        ) : !allPermissionsGranted ? ( // <-- Permission check is now first
          <Stack.Screen name="Permissions">
            {(props) => (
              <PermissionsScreen
                {...props}
                permissionState={permissionState}
                requestAllPermissions={requestAllPermissions}
                onPermissionsGranted={refreshPermissions} 
              />
            )}
          </Stack.Screen>
        ) : !isProfileComplete ? ( // <-- Profile setup is second
          <Stack.Screen name="DriverSetup">
            {() => (
                <View style={{ flex: 1, backgroundColor: '#0f172a' }}>
                    <DriverSetup
                    isOpen={true}
                    session={session}
                    onClose={refreshProfile}
                    onSave={refreshProfile}
                    />
                </View>
            )}
          </Stack.Screen>
        ) : (
          <>
            {!isSubscribed ? (
              <Stack.Screen name="Paywall" component={PaywallScreen} />
            ) : (
              <Stack.Screen name="Dashboard">
                {(props) => <Dashboard {...props} session={session} />}
              </Stack.Screen>
            )}
          </>
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
};

export default AppNavigator;
