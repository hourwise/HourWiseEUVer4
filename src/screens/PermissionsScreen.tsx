import React, { useEffect } from 'react';
import { Text, Button, Linking, Alert, StyleSheet, AppState, ActivityIndicator, SafeAreaView, StatusBar } from 'react-native';
import { usePermissions } from '../hooks/usePermissions';
import i18n from '../lib/i18n';

const PermissionsScreen = () => {
  const { state, request, refresh } = usePermissions();

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextAppState) => {
      if (nextAppState === 'active') {
        refresh();
      }
    });
    return () => subscription.remove();
  }, [refresh]);

  const handleGrantPermissions = async () => {
    const finalState = await request();
    const permanentlyDenied = Object.values(finalState).some(p => !p.isGranted && !p.canAskAgain);

    if (permanentlyDenied) {
      Alert.alert(
        i18n.t('permissions.deniedTitle', 'Permissions Required'),
        i18n.t('permissions.deniedBody', 'You have permanently denied essential permissions. Please go to your device settings to enable Location (Allow all the time) and Notifications.'),
        [
          { text: i18n.t('common.cancel', 'Cancel'), style: 'cancel' },
          { text: i18n.t('common.openSettings', 'Open Settings'), onPress: () => Linking.openSettings() }
        ]
      );
    }
  };

  if (!state) {
    return (
      <SafeAreaView style={styles.container}>
        <ActivityIndicator size="large" color="white" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />
      <Text style={styles.title}>{i18n.t('permissions.title', 'One Last Step')}</Text>
      <Text style={styles.description}>
        {i18n.t('permissions.body', "HourWise requires Location and Notification permissions to function correctly. Your location is used only to detect driving automatically, even when the app is in the background.")}
      </Text>
      <Button title={i18n.t('permissions.button', "Grant Permissions")} onPress={handleGrantPermissions} />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 32,
        backgroundColor: '#0f172a',
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
        lineHeight: 22,
        marginBottom: 32,
    },
});

export default PermissionsScreen;
