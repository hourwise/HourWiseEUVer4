import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthProvider';

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
  const { loading: authLoading } = useAuth();

  const value = useMemo(() => {
    // BYPASS FOR INTERNAL TESTING: Always return true so the paywall is skipped.
    return {
      isSubscribed: true,
      isLoading: authLoading,
    };
  }, [authLoading]);

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
