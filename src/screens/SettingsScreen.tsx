import React, { useCallback, useState } from 'react';
import { View, TouchableOpacity, Text, Alert, ActivityIndicator } from 'react-native';
import { presentCustomerCenter } from 'react-native-purchases-ui';
import { useTranslation } from 'react-i18next';

const SettingsScreen = () => {
  const { t, ready } = useTranslation();
  const [loading, setLoading] = useState(false);

  const openCustomerCenter = useCallback(async () => {
    if (loading) return;

    try {
      setLoading(true);
      // Presents RevenueCat's pre-built UI for managing subscriptions.
      await presentCustomerCenter();
    } catch (e) {
      console.error('Error opening customer center', e);
      Alert.alert(
        t('common.error'),
        t('settings.subscription.openError')
      );
    } finally {
      setLoading(false);
    }
  }, [loading, t]);

  if (!ready) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-950">
        <ActivityIndicator size="large" color="#60a5fa" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-slate-950 pt-12 px-4">
      <TouchableOpacity
        onPress={openCustomerCenter}
        disabled={loading}
        className={`bg-slate-800 p-4 rounded-xl w-full border border-slate-700 ${
          loading ? 'opacity-70' : ''
        }`}
      >
        {loading ? (
          <View className="flex-row items-center justify-center gap-2">
            <ActivityIndicator color="white" />
            <Text className="text-white font-bold text-center">
              {t('settings.subscription.opening')}
            </Text>
          </View>
        ) : (
          <Text className="text-white text-center font-bold">
            {t('settingsMenu.manageSubscription')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default SettingsScreen;
