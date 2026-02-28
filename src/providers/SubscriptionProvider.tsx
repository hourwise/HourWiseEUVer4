import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthProvider';

// __DEV__ is a global variable set by React Native.
// It is true in development and false in production.
declare const __DEV__: boolean;

interface SubscriptionContextType {
  isSubscribed: boolean;
  isLoading: boolean;
}

const SubscriptionContext =
  createContext<SubscriptionContextType | undefined>(undefined);

export const SubscriptionProvider = ({
  children,
}: {
  children: React.ReactNode;
}) => {
  const { profile, loading: authLoading } = useAuth();

  const value = useMemo(() => {
    // Determine the real subscription status from the user's profile
    const isActuallySubscribed = profile?.subscription_status === 'active';

    // In a development build, we bypass the paywall entirely.
    // In production, we use the real subscription status.
    const isSubscribed = __DEV__ || isActuallySubscribed;

    return {
      isSubscribed: isSubscribed,
      isLoading: authLoading,
    };
  }, [profile, authLoading]);

  return (
    <SubscriptionContext.Provider value={value}>
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
