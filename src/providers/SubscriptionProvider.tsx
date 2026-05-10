import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import Purchases from 'react-native-purchases';
import { useAuth } from './AuthProvider';
import {
  SUBSCRIPTION_CONFIG,
} from '../lib/subscriptionConfig';
import {
  configureRevenueCatForUser,
  isEntitlementActive,
  isRevenueCatReady,
} from '../lib/revenuecat';

interface SubscriptionContextType {
  isSubscribed: boolean;
  isLoading: boolean;
}

export const SubscriptionContext =
  createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { loading: authLoading, session, profile } = useAuth();
  const [isSubscribed, setIsSubscribed] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const configuredUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    let isMounted = true;
    let listener: ((customerInfo: any) => void) | null = null;

    const syncSubscriptionState = async () => {
      if (authLoading) return;

      if (!session?.user || !profile) {
        setIsSubscribed(false);
        setIsLoading(false);
        return;
      }

      if (profile.account_type === 'fleet') {
        setIsSubscribed(true);
        setIsLoading(false);
        return;
      }

      if (SUBSCRIPTION_CONFIG.bypassSubscription) {
        setIsSubscribed(true);
        setIsLoading(false);
        return;
      }

      if (!isRevenueCatReady()) {
        console.warn('RevenueCat config missing. Solo subscriptions will be treated as inactive.');
        setIsSubscribed(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const applyCustomerInfo = (customerInfo: any) => {
        if (!isMounted) return;
        setIsSubscribed(isEntitlementActive(customerInfo));
      };

      try {
        await configureRevenueCatForUser(session.user.id);
        configuredUserIdRef.current = session.user.id;

        listener = (customerInfo: any) => applyCustomerInfo(customerInfo);
        Purchases.addCustomerInfoUpdateListener(listener);

        const customerInfo = await Purchases.getCustomerInfo();
        applyCustomerInfo(customerInfo);
      } catch (error) {
        console.warn('RevenueCat subscription sync failed:', error);
        if (isMounted) setIsSubscribed(false);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    syncSubscriptionState();

    return () => {
      isMounted = false;
      if (listener) {
        Purchases.removeCustomerInfoUpdateListener(listener);
      }
    };
  }, [authLoading, profile, session]);

  return (
    <SubscriptionContext.Provider value={{ isSubscribed, isLoading }}>
      {children}
    </SubscriptionContext.Provider>
  );
};

export const useSubscriptionData = () => {
  const context = useContext(SubscriptionContext);
  if (!context)
    throw new Error(
      'useSubscriptionData must be used within SubscriptionProvider'
    );
  return context;
};
