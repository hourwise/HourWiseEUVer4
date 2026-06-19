import { useEffect, useMemo, useRef } from 'react';

import { useAuth } from '../providers/AuthProvider';
import { usePermissions } from '../providers/PermissionsProvider';
import { useSubscriptionData } from '../providers/SubscriptionProvider';
import { deriveBootState, type BootState } from '../lib/startup/bootState';

export const useBootState = (): BootState => {
  const lastInteractiveBootStateRef = useRef<BootState | null>(null);
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

  const derivedBootState = useMemo(
    () => deriveBootState({
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

  const lastInteractiveBootState = lastInteractiveBootStateRef.current;
  const loadingStage =
    derivedBootState.stage === 'app_init' ||
    derivedBootState.stage === 'auth_resolving' ||
    derivedBootState.stage === 'profile_bootstrapping';
  const currentUserId = derivedBootState.session?.user?.id ?? null;
  const lastUserId = lastInteractiveBootState?.session?.user?.id ?? null;
  const shouldKeepInteractiveRoute =
    loadingStage &&
    lastInteractiveBootState !== null &&
    currentUserId !== null &&
    currentUserId === lastUserId &&
    lastInteractiveBootState.stage !== 'error';

  useEffect(() => {
    if (!loadingStage && derivedBootState.stage !== 'error') {
      lastInteractiveBootStateRef.current = derivedBootState;
    }
  }, [derivedBootState, loadingStage]);

  if (shouldKeepInteractiveRoute) {
    return {
      ...lastInteractiveBootState,
      session: derivedBootState.session,
      profile: derivedBootState.profile ?? lastInteractiveBootState.profile,
      needsSetup: derivedBootState.needsSetup,
      needsLastShiftEntry: derivedBootState.needsLastShiftEntry,
      permissionsReady: derivedBootState.permissionsReady,
      paywallPolicy: derivedBootState.paywallPolicy,
      subscriptionReady: derivedBootState.subscriptionReady,
      subscriptionActive: derivedBootState.subscriptionActive,
      hasAccess: derivedBootState.hasAccess,
    };
  }

  return derivedBootState;
};
