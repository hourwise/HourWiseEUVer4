import React, { useEffect } from 'react';
import { View, Text, TouchableOpacity, Linking, Alert, StyleSheet, AppState, ActivityIndicator, SafeAreaView, StatusBar } from 'react-native';
import { usePermissions } from '../providers/PermissionsProvider'; // Correct import
import i18n from '../lib/i18n';
import { CheckCircle, XCircle, RefreshCw, Settings, ArrowRight } from 'react-native-feather';

const StatusRow = ({ label, isGranted }: { label: string; isGranted: boolean }) => (
  <View style={styles.statusRow}>
    <Text style={styles.statusLabel}>{label}</Text>
    {isGranted ? (
      <CheckCircle size={20} color="#4ade80" />
    ) : (
      <XCircle size={20} color="#f87171" />
    )}
  </View>
);

const PermissionsScreen = () => {
  const { state, request, refresh, areAllGranted } = usePermissions();

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

    if (permanentlyDenied && !areAllGranted) {
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
        <ActivityIndicator size="large" color="#60a5fa" />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" />

      <View style={styles.card}>
        <Text style={styles.title}>{i18n.t('permissions.title', 'One Last Step')}</Text>
        <Text style={styles.description}>
          {i18n.t('permissions.body', "HourWise requires the following permissions to track your work accurately and provide compliance alerts.")}
        </Text>

        <View style={styles.statusContainer}>
          <StatusRow label="Foreground Location" isGranted={state.location.isGranted} />
          <StatusRow label="Background Location" isGranted={state.backgroundLocation.isGranted} />
          <StatusRow label="Notifications" isGranted={state.notifications.isGranted} />
        </View>

        {areAllGranted ? (
          <View className="items-center py-2">
             <Text className="text-green-400 font-bold mb-4 text-center">All permissions granted!</Text>
             {/* Note: In a bug-free world, AppNavigator would have already switched screens.
                 This button is here as a failsafe. */}
             <TouchableOpacity style={[styles.grantButton, { backgroundColor: '#16a34a', width: '100%' }]} onPress={() => refresh()}>
                <View className="flex-row items-center gap-2">
                    <Text style={styles.grantButtonText}>Continue to App</Text>
                    <ArrowRight size={20} color="white" />
                </View>
             </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.grantButton} onPress={handleGrantPermissions}>
            <Text style={styles.grantButtonText}>{i18n.t('permissions.button', "Grant Permissions")}</Text>
          </TouchableOpacity>
        )}

        <View style={styles.footerRow}>
            <TouchableOpacity style={styles.footerBtn} onPress={() => refresh()}>
                <RefreshCw size={16} color="#94a3b8" />
                <Text style={styles.footerBtnText}>Refresh Status</Text>
            </TouchableOpacity>

            <TouchableOpacity style={styles.footerBtn} onPress={() => Linking.openSettings()}>
                <Settings size={16} color="#94a3b8" />
                <Text style={styles.footerBtnText}>Open Settings</Text>
            </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 24,
        backgroundColor: '#0f172a',
    },
    card: {
        backgroundColor: '#1e293b',
        borderRadius: 16,
        padding: 24,
        width: '100%',
        borderWidth: 1,
        borderColor: '#334155',
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 5,
    },
    title: {
        fontSize: 24,
        fontWeight: 'bold',
        color: 'white',
        textAlign: 'center',
        marginBottom: 12,
    },
    description: {
        color: '#94a3b8',
        textAlign: 'center',
        lineHeight: 20,
        marginBottom: 24,
        fontSize: 14,
    },
    statusContainer: {
        backgroundColor: '#0f172a',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },
    statusRow: {
        flexDirection: 'row',
        justifyContent: 'space-between', // Fixed to space-between
        alignItems: 'center',
        paddingVertical: 8,
        borderBottomWidth: 1,
        borderBottomColor: '#1e293b',
    },
    statusLabel: {
        color: '#e2e8f0',
        fontSize: 15,
        flex: 1,
    },
    grantButton: {
        backgroundColor: '#2563eb',
        borderRadius: 10,
        paddingVertical: 14,
        alignItems: 'center',
        marginBottom: 16,
    },
    grantButtonText: {
        color: 'white',
        fontWeight: 'bold',
        fontSize: 16,
    },
    footerRow: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        borderTopWidth: 1,
        borderTopColor: '#334155',
        paddingTop: 16,
    },
    footerBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
    },
    footerBtnText: {
        color: '#94a3b8',
        fontSize: 13,
        fontWeight: '500',
    },
});

export default PermissionsScreen;
