import React, { createContext, useContext, useMemo } from 'react';
import { useAuth } from './AuthProvider';

interface SubscriptionContextType {
  isSubscribed: boolean;
  isLoading: boolean;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

// ========================================================================
// ⬇️ TEMPORARY DEVELOPMENT VERSION (logged in = subscribed) ⬇️
// ========================================================================
export const SubscriptionProvider = ({ children }: { children: React.ReactNode }) => {
  // isLoading is now DIRECTLY from the AuthProvider. They are always in sync.
  const { session, loading: authLoading } = useAuth();

  const value = useMemo<SubscriptionContextType>(() => {
    const isUserLoggedIn = !!session?.user;

    return {
      isSubscribed: isUserLoggedIn, // For dev, any logged-in user is considered subscribed.
      isLoading: authLoading, // Pass the loading state directly through.
    };
  }, [session, authLoading]);

  return (
    <SubscriptionContext.Provider value={value}>
      {children}
    </SubscriptionContext.Provider>
  );
};
// ========================================================================

export const useSubscriptionData = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscriptionData must be used within a SubscriptionProvider');
  }
  return context;
};
