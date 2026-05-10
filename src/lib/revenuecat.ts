import Purchases, { LOG_LEVEL } from 'react-native-purchases';
import { getRevenueCatApiKey, hasRevenueCatConfig, SUBSCRIPTION_CONFIG } from './subscriptionConfig';

let configuredUserId: string | null = null;

export const isRevenueCatReady = () => hasRevenueCatConfig();

export const getRevenueCatEntitlementId = () => SUBSCRIPTION_CONFIG.entitlementId;

export const configureRevenueCatForUser = async (userId: string) => {
  if (!isRevenueCatReady()) {
    throw new Error('RevenueCat is not configured for this build.');
  }

  const apiKey = getRevenueCatApiKey();
  if (!apiKey) {
    throw new Error('RevenueCat API key missing for current platform.');
  }

  await Purchases.setLogLevel(__DEV__ ? LOG_LEVEL.DEBUG : LOG_LEVEL.INFO);

  if (!configuredUserId) {
    Purchases.configure({ apiKey, appUserID: userId });
    configuredUserId = userId;
    return;
  }

  if (configuredUserId !== userId) {
    await Purchases.logIn(userId);
    configuredUserId = userId;
  }
};

export const clearRevenueCatUser = async () => {
  if (!configuredUserId || !isRevenueCatReady()) return;
  try {
    await Purchases.logOut();
  } catch (error) {
    console.warn('RevenueCat logout failed:', error);
  } finally {
    configuredUserId = null;
  }
};

export const isEntitlementActive = (customerInfo: any) => {
  const entitlementId = getRevenueCatEntitlementId();
  return !!customerInfo?.entitlements?.active?.[entitlementId];
};
