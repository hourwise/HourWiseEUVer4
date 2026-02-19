import React, { useEffect } from 'react';
import { View, Text, Button, Linking, Alert, StyleSheet, AppState, ActivityIndicator } from 'react-native';
import type { PermissionMap } from '../hooks/usePermissions';
import i18n from '../lib/i18n';

interface PermissionsScreenProps {
  permissionState: PermissionMap | null;
  requestAllPermissions: () => Promise<PermissionMap>;
  onPermissionsGranted: () => void;
}

const allPermissionsGranted = (permissionState: PermissionMap | null): boolean => {
    if (!permissionState) return false;
    
    const criticalPermissions: (keyof PermissionMap)[] = ['location', 'backgroundLocation', 'notifications', 'camera'];

    return criticalPermissions.every(p => permissionState[p] === 'granted');
};

const PermissionsScreen: React.FC<PermissionsScreenProps> = ({ 
  permissionState, 
  requestAllPermissions,
  onPermissionsGranted 
}) => {

  useEffect(() => {
    if (allPermissionsGranted(permissionState)) {
      onPermissionsGranted();
    }
  }, [permissionState, onPermissionsGranted]);

  // This effect re-checks permissions when the user returns to the app
  // from the settings screen.
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        onPermissionsGranted(); // Re-check permissions on return to app
      }
    });

    return () => {
      subscription.remove();
    };
  }, [onPermissionsGranted]);


  const handleRequestPermissions = async () => {
    const finalState = await requestAllPermissions();
    if (!allPermissionsGranted(finalState)) {
       const permanentlyDenied = Object.entries(finalState)
        .filter(([key]) => ['location', 'backgroundLocation', 'notifications', 'camera'].includes(key))
        .some(([, status]) => status === 'denied');
        
       if (permanentlyDenied) {
           Alert.alert(
            i18n.t('permissions.deniedTitle', 'Permissions Denied'),
            i18n.t('permissions.deniedBody', 'You have permanently denied some permissions. Please go to your device settings to enable them.'),
            [
              { text: i18n.t('common.cancel', 'Cancel'), style: 'cancel' },
              { text: i18n.t('common.openSettings', 'Open Settings'), onPress: () => Linking.openSettings() }
            ]
           );
       }
    }
  };

  if (allPermissionsGranted(permissionState)) {
    // Show a loading indicator instead of null to prevent blank screens
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color="white" />
        <Text style={styles.description}>Permissions granted. Continuing...</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Permissions Required</Text>
      <Text style={styles.description}>
        HourWise needs access to your location, camera, and notifications to track your work hours accurately and handle expenses.
      </Text>
      <Button title="Grant Permissions" onPress={handleRequestPermissions} />
    </View>
  );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
        backgroundColor: '#111827',
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center',
        marginBottom: 16,
    },
    description: {
        color: '#D1D5DB',
        textAlign: 'center',
        marginBottom: 32,
    },
});


export default PermissionsScreen;
