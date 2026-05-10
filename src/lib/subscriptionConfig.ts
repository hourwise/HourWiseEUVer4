import { Platform } from 'react-native';

const parseBooleanEnv = (value: string | undefined, fallback = false) => {
  if (value == null) return fallback;
  return value.trim().toLowerCase() === 'true';
};

export const SUBSCRIPTION_CONFIG = {
  // Temporary default-on bypass while RevenueCat is not live.
  bypassSubscription: parseBooleanEnv(process.env.EXPO_PUBLIC_BYPASS_SUBSCRIPTION, true),
  entitlementId: process.env.EXPO_PUBLIC_REVENUECAT_ENTITLEMENT_ID || '',
  androidApiKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_ANDROID || '',
  iosApiKey: process.env.EXPO_PUBLIC_REVENUECAT_API_KEY_IOS || '',
} as const;

export const getRevenueCatApiKey = () => {
  if (Platform.OS === 'android') return SUBSCRIPTION_CONFIG.androidApiKey;
  if (Platform.OS === 'ios') return SUBSCRIPTION_CONFIG.iosApiKey;
  return '';
};

export const hasRevenueCatConfig = () =>
  !!getRevenueCatApiKey() && !!SUBSCRIPTION_CONFIG.entitlementId;
