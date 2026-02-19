import { useContext } from 'react';
import { SubscriptionContext } from '../providers/SubscriptionProvider';

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);

  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }

  return context;
};
