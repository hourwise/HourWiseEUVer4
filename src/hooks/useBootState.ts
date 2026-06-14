import { useMemo } from 'react';

import { useAuth } from '../providers/AuthProvider';
import { usePermissions } from '../providers/PermissionsProvider';
import { useSubscriptionData } from '../providers/SubscriptionProvider';
import { deriveBootState, type BootState } from '../lib/startup/bootState';

export const useBootState = (): BootState => {
  const {
    session,
    profile,
    needsSetup,
    needsLastShiftEntry,
    loading: authLoading,
    bootstrapping,
  } = useAuth();
  const {
    hasAccess,
    isLoading: subscriptionLoading,
    paywallPolicy,
    subscriptionActive,
  } = useSubscriptionData();
  const { areAllGranted } = usePermissions();

  return useMemo(
    () =>
      deriveBootState({
        session,
        profile,
        authLoading,
        bootstrapping,
        needsSetup,
        needsLastShiftEntry,
        permissionsGranted: areAllGranted,
        subscriptionLoading,
        paywallPolicy,
        subscriptionActive,
        hasAccess,
      }),
    [
      areAllGranted,
      authLoading,
      bootstrapping,
      hasAccess,
      needsLastShiftEntry,
      needsSetup,
      paywallPolicy,
      profile,
      session,
      subscriptionActive,
      subscriptionLoading,
    ],
  );
};
