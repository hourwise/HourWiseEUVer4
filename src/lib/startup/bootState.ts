import type { Session } from '@supabase/supabase-js';
import type { PaywallPolicy } from '../subscriptionConfig';
import type { ProfileWithPay } from '../../providers/AuthProvider';

export type BootStage =
  | 'app_init'
  | 'auth_resolving'
  | 'signed_out'
  | 'profile_bootstrapping'
  | 'onboarding_setup'
  | 'onboarding_last_shift'
  | 'permissions_gate'
  | 'paywall_gate'
  | 'ready'
  | 'error';

export type BootState = {
  stage: BootStage;
  session: Session | null;
  profile: ProfileWithPay | null;
  needsSetup: boolean;
  needsLastShiftEntry: boolean;
  permissionsReady: boolean;
  paywallPolicy: PaywallPolicy;
  subscriptionReady: boolean;
  subscriptionActive: boolean;
  hasAccess: boolean;
  error?: string;
};

export type BootStateInput = {
  session: Session | null;
  profile: ProfileWithPay | null;
  authLoading: boolean;
  bootstrapping: boolean;
  needsSetup: boolean;
  needsLastShiftEntry: boolean;
  permissionsGranted: boolean | null;
  subscriptionLoading: boolean;
  paywallPolicy: PaywallPolicy;
  subscriptionActive: boolean;
  hasAccess: boolean;
  error?: string;
};

export const deriveBootState = ({
  session,
  profile,
  authLoading,
  bootstrapping,
  needsSetup,
  needsLastShiftEntry,
  permissionsGranted,
  subscriptionLoading,
  paywallPolicy,
  subscriptionActive,
  hasAccess,
  error,
}: BootStateInput): BootState => {
  const subscriptionReady = !subscriptionLoading;
  const permissionsReady = permissionsGranted === true;
  const profileReadyForSession =
    !!session &&
    !!profile &&
    profile.id === session.user.id;
  const shouldWaitForSubscription =
    !!session && paywallPolicy === 'enforce' && subscriptionLoading;
  const shouldWaitForProfileBootstrap =
    !!session && bootstrapping && !profileReadyForSession;

  let stage: BootStage;
  if (error) {
    stage = 'error';
  } else if (authLoading) {
    stage = 'auth_resolving';
  } else if (!session) {
    stage = 'signed_out';
  } else if (shouldWaitForProfileBootstrap || shouldWaitForSubscription) {
    stage = 'profile_bootstrapping';
  } else if (needsSetup) {
    stage = 'onboarding_setup';
  } else if (needsLastShiftEntry) {
    stage = 'onboarding_last_shift';
  } else if (!permissionsReady) {
    stage = 'permissions_gate';
  } else if (!hasAccess) {
    stage = 'paywall_gate';
  } else {
    stage = 'ready';
  }

  return {
    stage,
    session,
    profile,
    needsSetup,
    needsLastShiftEntry,
    permissionsReady,
    paywallPolicy,
    subscriptionReady,
    subscriptionActive,
    hasAccess,
    error,
  };
};
