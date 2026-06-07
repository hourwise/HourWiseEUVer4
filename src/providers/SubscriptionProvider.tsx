import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import Purchases from 'react-native-purchases';
import { useAuth } from './AuthProvider';
import {
  SUBSCRIPTION_CONFIG,
  type PaywallPolicy,
} from '../lib/subscriptionConfig';
import {
  configureRevenueCatForUser,
  isEntitlementActive,
  isRevenueCatReady,
} from '../lib/revenuecat';

interface SubscriptionContextType {
  hasAccess: boolean;
  isLoading: boolean;
  paywallPolicy: PaywallPolicy;
  subscriptionActive: boolean;
}

export const SubscriptionContext =
  createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { loading: authLoading, session, profile } = useAuth();
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const configuredUserIdRef = useRef<string | null>(null);
  const paywallPolicy = SUBSCRIPTION_CONFIG.paywallPolicy;

  useEffect(() => {
    let isMounted = true;
    let listener: ((customerInfo: any) => void) | null = null;

    const syncSubscriptionState = async () => {
      if (authLoading) return;

      if (!session?.user || !profile) {
        setSubscriptionActive(false);
        setIsLoading(false);
        return;
      }

      if (profile.account_type === 'fleet') {
        setSubscriptionActive(true);
        setIsLoading(false);
        return;
      }

      if (paywallPolicy === 'bypass') {
        setSubscriptionActive(false);
        setIsLoading(false);
        return;
      }

      if (!isRevenueCatReady()) {
        console.warn('RevenueCat config missing. Solo subscriptions will be treated as inactive.');
        setSubscriptionActive(false);
        setIsLoading(false);
        return;
      }

      setIsLoading(true);

      const applyCustomerInfo = (customerInfo: any) => {
        if (!isMounted) return;
        setSubscriptionActive(isEntitlementActive(customerInfo));
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
        if (isMounted) setSubscriptionActive(false);
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
  }, [authLoading, paywallPolicy, profile, session]);

  const hasAccess =
    profile?.account_type === 'fleet' ||
    paywallPolicy === 'bypass' ||
    paywallPolicy === 'observe' ||
    subscriptionActive;

  return (
    <SubscriptionContext.Provider
      value={{ hasAccess, isLoading, paywallPolicy, subscriptionActive }}
    >
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
