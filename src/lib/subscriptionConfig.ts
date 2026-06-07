import { Platform } from 'react-native';

export type PaywallPolicy = 'bypass' | 'observe' | 'enforce';

const parseBooleanEnv = (value: string | undefined, fallback = false) => {
  if (value == null) return fallback;
  return value.trim().toLowerCase() === 'true';
};

const parsePaywallPolicy = (
  value: string | undefined,
  fallback: PaywallPolicy,
): PaywallPolicy => {
  if (!value) return fallback;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'bypass' || normalized === 'observe' || normalized === 'enforce') {
    return normalized;
  }

  return fallback;
};

const legacyBypassEnabled = parseBooleanEnv(
  process.env.EXPO_PUBLIC_BYPASS_SUBSCRIPTION,
  true,
);
const paywallPolicy = parsePaywallPolicy(
  process.env.EXPO_PUBLIC_PAYWALL_POLICY,
  legacyBypassEnabled ? 'bypass' : 'enforce',
);

export const SUBSCRIPTION_CONFIG = {
  // Current field-testing default remains bypass until launch hardening is complete.
  paywallPolicy,
  bypassSubscription: paywallPolicy === 'bypass',
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
