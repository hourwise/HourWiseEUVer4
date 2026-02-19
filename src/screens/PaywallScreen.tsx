import React, { useCallback, useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import RevenueCatUI, { PAYWALL_RESULT } from 'react-native-purchases-ui';
import Purchases from 'react-native-purchases';
import { useTranslation } from 'react-i18next';

const PaywallScreen = () => {
  const { t, ready } = useTranslation();
  const [loadingPaywall, setLoadingPaywall] = useState(false);
  const [loadingRestore, setLoadingRestore] = useState(false);

  const presentPaywall = useCallback(async () => {
    if (loadingPaywall || loadingRestore) return;

    try {
      setLoadingPaywall(true);

      // Present the default paywall for the current offering
      const paywallResult = await RevenueCatUI.presentPaywall();

      switch (paywallResult) {
        case PAYWALL_RESULT.PURCHASED:
          Alert.alert(
            t('paywall.alert.successTitle'),
            t('paywall.alert.purchased')
          );
          // SubscriptionProvider should update entitlements and route user away
          break;

        case PAYWALL_RESULT.RESTORED:
          Alert.alert(
            t('paywall.alert.successTitle'),
            t('paywall.alert.restored')
          );
          break;

        case PAYWALL_RESULT.CANCELLED:
          // User cancelled the paywall - no action
          break;

        case PAYWALL_RESULT.ERROR:
          Alert.alert(
            t('common.error'),
            t('paywall.alert.paywallError')
          );
          break;

        default:
          break;
      }
    } catch (e) {
      console.error('Paywall presentation error:', e);
      Alert.alert(
        t('common.error'),
        t('paywall.alert.couldNotDisplay')
      );
    } finally {
      setLoadingPaywall(false);
    }
  }, [loadingPaywall, loadingRestore, t]);

  const restorePurchases = useCallback(async () => {
    if (loadingPaywall || loadingRestore) return;

    try {
      setLoadingRestore(true);

      const customerInfo = await Purchases.restorePurchases();

      if (customerInfo.activeSubscriptions?.length > 0) {
        Alert.alert(
          t('paywall.alert.successTitle'),
          t('paywall.alert.restoreSuccess')
        );
      } else {
        Alert.alert(
          t('paywall.alert.noPurchasesTitle'),
          t(
            'paywall.alert.noPurchasesBody'
          )
        );
      }
    } catch (e) {
      console.error('Restore purchases error:', e);
      Alert.alert(
        t('common.error'),
        t('paywall.alert.restoreError')
      );
    } finally {
      setLoadingRestore(false);
    }
  }, [loadingPaywall, loadingRestore, t]);

  if (!ready) {
    return (
      <View className="flex-1 justify-center items-center bg-slate-950">
        <ActivityIndicator size="large" color="#60a5fa" />
      </View>
    );
  }

  const isBusy = loadingPaywall || loadingRestore;

  return (
    <View className="flex-1 justify-center items-center bg-slate-950 px-6">
      <Text className="text-white text-2xl font-bold mb-4 text-center">
        {t('paywall.title')}
      </Text>

      <Text className="text-slate-400 text-center mb-8 leading-6">
        {t(
          'paywall.subtitle'
        )}
      </Text>

      <TouchableOpacity
        onPress={presentPaywall}
        disabled={isBusy}
        className={`w-full py-4 rounded-xl ${isBusy ? 'bg-blue-600/60' : 'bg-blue-600'}`}
      >
        {loadingPaywall ? (
          <View className="flex-row justify-center items-center gap-2">
            <ActivityIndicator color="white" />
            <Text className="text-white font-bold text-center">
              {t('paywall.loading')}
            </Text>
          </View>
        ) : (
          <Text className="text-white font-bold text-center text-lg">
            {t('paywall.subscribeNow')}
          </Text>
        )}
      </TouchableOpacity>

      <TouchableOpacity
        onPress={restorePurchases}
        disabled={isBusy}
        className="mt-6"
      >
        {loadingRestore ? (
          <View className="flex-row items-center gap-2">
            <ActivityIndicator color="#94a3b8" />
            <Text className="text-slate-400">
              {t('paywall.restoring')}
            </Text>
          </View>
        ) : (
          <Text className={`text-slate-400 ${isBusy ? 'opacity-60' : ''}`}>
            {t('paywall.restorePurchases')}
          </Text>
        )}
      </TouchableOpacity>
    </View>
  );
};

export default PaywallScreen;
