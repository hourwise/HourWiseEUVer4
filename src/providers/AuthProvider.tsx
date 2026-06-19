import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  useRef,
} from 'react';
import { Alert } from 'react-native';
import * as Location from 'expo-location';
import { supabase } from '../lib/supabase';
import i18n from '../lib/i18n';
import type { Session, SignInWithPasswordCredentials, SignUpWithPasswordCredentials } from '@supabase/supabase-js';
import type { Database } from '../lib/database.types';
import {
  clearBiometricSession,
  getStoredBiometricSessionMetadata,
  hasStoredBiometricSession,
  saveBiometricSession,
} from '../lib/biometricAuth';
import { LOCATION_TASK_NAME } from '../lib/tacho/constants';
import { clearAllHourwiseTimerNotifications } from '../lib/tacho/notificationCleanup';
import {
  clearBackgroundAlertState,
  clearBackgroundTaskDiagnostics,
  clearScheduledComplianceAlerts,
  clearScheduledDriveAlerts,
} from '../lib/tacho/runtimeStorage';
import { acceptInvite } from '../lib/inviteService';

type Profile = Database['public']['Tables']['profiles']['Row'];
type Invite = Database['public']['Tables']['driver_invites']['Row'];
type PayConfiguration = Database['public']['Tables']['pay_configurations']['Row'];

export type ProfileWithPay = Profile & {
  pay_configurations: PayConfiguration | null;
};

interface AuthContextType {
  session: Session | null;
  profile: ProfileWithPay | null;
  loading: boolean;
  bootstrapping: boolean;
  needsSetup: boolean;
  needsLastShiftEntry: boolean;
  transientInvite: Invite | null;
  isFleetDriver: boolean;
  refreshProfile: () => Promise<void>;
  completeLastShiftEntry: () => Promise<void>;
  clearStoredBiometricSignIn: () => Promise<void>;
  signOut: (options?: { forgetBiometric?: boolean }) => Promise<void>;
  signIn: (credentials: SignInWithPasswordCredentials) => Promise<Session | null>;
  signUp: (params: SignUpWithPasswordCredentials & { fullName: string; accountType: 'solo' | 'fleet'; invite: Invite | null; inviteCode?: string; }) => Promise<Session | null>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const PROFILE_QUERY_TIMEOUT_MS = 6000;
const BACKGROUND_PROFILE_QUERY_TIMEOUT_MS = 3000;
const OPTIONAL_QUERY_TIMEOUT_MS = 2500;
const BACKGROUND_OPTIONAL_QUERY_TIMEOUT_MS = 1500;
const AUTH_INIT_TIMEOUT_MS = 5000;
const AUTH_LISTENER_GRACE_MS = 2500;
const BACKGROUND_PROFILE_REFRESH_MIN_INTERVAL_MS = 10 * 60 * 1000;

const withTimeout = async <T,>(p: Promise<T>, ms = 8000): Promise<T> => {
  let timeoutId: ReturnType<typeof setTimeout> | null = null;
  try {
    return await Promise.race([
      p,
      new Promise<T>((_, reject) => {
        timeoutId = setTimeout(() => reject(new Error('timeout')), ms);
      }),
    ]);
  } finally {
    if (timeoutId) clearTimeout(timeoutId);
  }
};

const isTimeoutError = (error: unknown) =>
  error instanceof Error && error.message === 'timeout';

const isMissingRowError = (error: unknown) =>
  !!error && typeof error === 'object' && 'code' in error && (error as any).code === 'PGRST116';

const buildFleetPayConfigPayload = (
  userId: string,
  payConfigSnapshot: Record<string, any> | null | undefined,
): (Record<string, any> & { user_id: string }) | null => {
  if (!payConfigSnapshot) return null;

  const {
    id: _snapshotId,
    user_id: _snapshotUserId,
    created_at: _snapshotCreatedAt,
    updated_at: _snapshotUpdatedAt,
    ...payConfigFields
  } = payConfigSnapshot;

  return {
    ...payConfigFields,
    user_id: userId,
  };
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileWithPay | null>(null);
  const [needsSetup, setNeedsSetup] = useState(true);
  const [needsLastShiftEntry, setNeedsLastShiftEntry] = useState(true);
  const [loading, setLoading] = useState(true);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [transientInvite, setTransientInvite] = useState<Invite | null>(null);

  // Use a ref to track profile presence without triggering dependency loops
  const hasProfileRef = useRef(false);
  const profileRef = useRef<ProfileWithPay | null>(null);
  const sessionRef = useRef<Session | null>(null);
  const lastProfileFetchAtRef = useRef(0);
  const lastKnownBootstrapRef = useRef<{
    userId: string;
    profile: ProfileWithPay | null;
    needsSetup: boolean;
    needsLastShiftEntry: boolean;
  } | null>(null);
  const needsLastShiftEntryRef = useRef(true);
  const isFleetDriver = !!profile?.company_id;

  const isSetupMarkedComplete = (profileData: Profile | null) =>
    !!profileData &&
    'first_time_setup_completed_at' in profileData &&
    !!profileData.first_time_setup_completed_at;

  const applyFailClosedBootstrapState = useCallback(() => {
    setProfile(null);
    profileRef.current = null;
    hasProfileRef.current = false;
    setNeedsSetup(true);
    setNeedsLastShiftEntry(true);
    needsLastShiftEntryRef.current = true;
  }, []);

  const applyNeedsLastShiftEntry = useCallback((next: boolean) => {
    setNeedsLastShiftEntry(next);
    needsLastShiftEntryRef.current = next;
  }, []);

  const applyCachedBootstrapState = useCallback(
    (cachedBootstrap: NonNullable<typeof lastKnownBootstrapRef.current>) => {
      setProfile(cachedBootstrap.profile);
      profileRef.current = cachedBootstrap.profile;
      hasProfileRef.current = !!cachedBootstrap.profile;
      setNeedsSetup(cachedBootstrap.needsSetup);
      applyNeedsLastShiftEntry(cachedBootstrap.needsLastShiftEntry);
    },
    [applyNeedsLastShiftEntry],
  );

  const readOptionalBootstrapQuery = useCallback(async <T,>(
    query: PromiseLike<{ data: T | null; error: any }>,
    timeoutMs = OPTIONAL_QUERY_TIMEOUT_MS,
  ): Promise<T | null> => {
    try {
      const { data, error } = await withTimeout(Promise.resolve(query), timeoutMs);
      if (error && !isMissingRowError(error)) throw error;
      return data ?? null;
    } catch {
      return null;
    }
  }, []);

  const fetchProfile = useCallback(async (session: Session | null, isBackground = false) => {
    if (!session?.user) {
      applyFailClosedBootstrapState();
      return false;
    }

    const shouldShowLoading = !hasProfileRef.current && !isBackground;
    if (shouldShowLoading) setLoading(true);

    try {
      const profileTimeoutMs = isBackground
        ? BACKGROUND_PROFILE_QUERY_TIMEOUT_MS
        : PROFILE_QUERY_TIMEOUT_MS;
      const optionalTimeoutMs = isBackground
        ? BACKGROUND_OPTIONAL_QUERY_TIMEOUT_MS
        : OPTIONAL_QUERY_TIMEOUT_MS;
      const { data: profileData, error: profileError } = await withTimeout(
        Promise.resolve(supabase.from('profiles').select('*').eq('id', session.user.id).maybeSingle()),
        profileTimeoutMs,
      );
      if (profileError && !isMissingRowError(profileError)) throw profileError;

      const [payConfig, anySession] = await Promise.all([
        readOptionalBootstrapQuery(
          supabase.from('pay_configurations').select('*').eq('user_id', session.user.id).maybeSingle(),
          optionalTimeoutMs,
        ),
        readOptionalBootstrapQuery(
          supabase.from('work_sessions').select('id').eq('user_id', session.user.id).limit(1).maybeSingle(),
          optionalTimeoutMs,
        ),
      ]);

      // Determine setup status:
      // 1. Check persistent flag from DB
      // 2. Fallback to data presence (full_name, pay_config for solo)
      const setupAlreadyMarkedComplete = isSetupMarkedComplete(profileData);
      const isSolo = profileData?.account_type === 'solo';
      const cachedPayConfig = profileRef.current?.pay_configurations ?? null;
      const effectivePayConfig = payConfig ?? cachedPayConfig;
      const requiredDataPresent = !!(profileData?.full_name) && (!isSolo || !!effectivePayConfig);
      const lastShiftOnboardingComplete =
        !!profileData?.last_shift_onboarding_completed_at || !!anySession;

      // Setup is complete if marked in DB OR if all data is present
      const setupComplete = setupAlreadyMarkedComplete || requiredDataPresent;

      if (__DEV__) {
        console.log('[AuthProvider] Setup Determination:', {
          setupAlreadyMarkedComplete,
          requiredDataPresent,
          account_type: profileData?.account_type,
          has_full_name: !!profileData?.full_name,
          has_pay_config: !!effectivePayConfig,
          has_last_shift_onboarding_completed_at: !!profileData?.last_shift_onboarding_completed_at,
          legacy_any_session_found: !!anySession,
          willShowSetup: !setupComplete,
        });
      }

      setNeedsSetup(!setupComplete);
      applyNeedsLastShiftEntry(!lastShiftOnboardingComplete);

      const newProfile = profileData ? { ...profileData, pay_configurations: effectivePayConfig || null } : null;
      setProfile(newProfile);
      profileRef.current = newProfile;
      hasProfileRef.current = !!newProfile;
      lastKnownBootstrapRef.current = {
        userId: session.user.id,
        profile: newProfile,
        needsSetup: !setupComplete,
        needsLastShiftEntry: !lastShiftOnboardingComplete,
      };
      lastProfileFetchAtRef.current = Date.now();
      return true;

    } catch (error: any) {
      const message = error?.message || error;
      const cachedBootstrap = lastKnownBootstrapRef.current;
      const canReuseCachedBootstrap =
        !!cachedBootstrap &&
        cachedBootstrap.userId === session.user.id &&
        isTimeoutError(error);

      if (canReuseCachedBootstrap) {
        if (__DEV__) {
          console.log('[AuthProvider] Reusing cached bootstrap state after timeout', {
            reason: message,
            needsSetup: cachedBootstrap.needsSetup,
            needsLastShiftEntry: cachedBootstrap.needsLastShiftEntry,
          });
        }
        applyCachedBootstrapState(cachedBootstrap);
        lastProfileFetchAtRef.current = Date.now();
        return true;
      }
      if (!isBackground || !hasProfileRef.current || !isTimeoutError(error)) {
        console.warn("fetchProfile failed or timed out:", message);
      }
      // Preserve the last known-good auth/profile state during background refreshes
      // so transient network issues do not bounce the user back into setup flows.
      if (!hasProfileRef.current && !isBackground) {
        applyFailClosedBootstrapState();
      }
      return false;
    } finally {
      if (shouldShowLoading) setLoading(false);
    }
  }, [applyCachedBootstrapState, applyFailClosedBootstrapState, applyNeedsLastShiftEntry, readOptionalBootstrapQuery]);

  const completeLastShiftEntry = useCallback(async () => {
    if (!session?.user) return;

    const completedAt =
      profileRef.current?.last_shift_onboarding_completed_at || new Date().toISOString();

    applyNeedsLastShiftEntry(false);
    setProfile((currentProfile) => {
      if (!currentProfile) return currentProfile;

      const nextProfile = {
        ...currentProfile,
        last_shift_onboarding_completed_at: completedAt,
      };
      profileRef.current = nextProfile;
      return nextProfile;
    });

    try {
      const { error } = await supabase
        .from('profiles')
        .update({ last_shift_onboarding_completed_at: completedAt })
        .eq('id', session.user.id);

      if (error) throw error;
    } catch (error: any) {
      console.warn('Failed to persist last-shift onboarding completion:', error?.message || error);
      applyNeedsLastShiftEntry(true);
    }
  }, [applyNeedsLastShiftEntry, session]);

  const clearStoredBiometricSignIn = useCallback(async () => {
    await clearBiometricSession();
  }, []);

  const syncStoredBiometricSession = useCallback(async (nextSession: Session | null) => {
    if (!nextSession?.access_token || !nextSession.refresh_token) return;

    try {
      const biometricConfigured = await hasStoredBiometricSession();
      if (!biometricConfigured) return;
      const metadata = await getStoredBiometricSessionMetadata();
      if (!metadata || metadata.userId !== nextSession.user.id) return;

      await saveBiometricSession(nextSession.access_token, nextSession.refresh_token, {
        userId: nextSession.user.id,
        email: nextSession.user.email ?? metadata.email ?? null,
      });
    } catch (error) {
      console.warn('Failed to synchronize stored biometric session:', error);
    }
  }, []);

  const signOut = async (options?: { forgetBiometric?: boolean }) => {
    const biometricConfigured = await hasStoredBiometricSession();

    try {
      if (await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME)) {
        await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
      }
    } catch (error) {
      console.warn('Failed to stop timer background tracking during sign-out:', error);
    }
    try {
      await Promise.all([
        clearAllHourwiseTimerNotifications(),
        clearScheduledComplianceAlerts(),
        clearScheduledDriveAlerts(),
        clearBackgroundAlertState(),
        clearBackgroundTaskDiagnostics(),
      ]);
    } catch (error) {
      console.warn('Failed to clear timer alerts during sign-out:', error);
    }

    if (options?.forgetBiometric) {
      await clearBiometricSession();
    }
    setTransientInvite(null);

    if (biometricConfigured && !options?.forgetBiometric) {
      // Soft sign-out clears local app auth state without revoking the server-side
      // session that biometric restore depends on.
      await (supabase.auth as any)._removeSession();
      return;
    }

    await supabase.auth.signOut({ scope: 'local' });
  };

  const signIn = async (credentials: SignInWithPasswordCredentials) => {
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw error;
    return data.session;
  };

  const signUp = async ({ password, fullName, accountType, invite, inviteCode, ...credentials }: SignUpWithPasswordCredentials & { fullName: string; accountType: 'solo' | 'fleet'; invite: Invite | null; inviteCode?: string; }) => {
    const email = 'email' in credentials ? credentials.email : undefined;
    if (!email) throw new Error('Email is required.');
    const { data, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) throw authError;
    if (!data.user) throw new Error('Sign up failed.');

    let finalProfile: ProfileWithPay | null = null;

    if (accountType === 'fleet' && invite) {
      setTransientInvite(invite);
      const payConfigSnapshot = invite.pay_config_snapshot as any;
      const payConfigPayload = buildFleetPayConfigPayload(data.user.id, payConfigSnapshot);

      const profilePayload = {
          id: data.user.id, user_id: data.user.id, email: data.user.email, full_name: invite.full_name,
          account_type: 'fleet', company_id: invite.company_id, role: 'driver',
          payroll_number: payConfigPayload?.payroll_number,
      };

      const { error: profileError } = await supabase.from('profiles').insert(profilePayload);
      if (profileError) throw profileError;

      if (payConfigPayload) {
        const { error: payConfigError } = await supabase.from('pay_configurations').insert(payConfigPayload);
        if (payConfigError) {
          console.warn('Pay config insertion failed:', payConfigError.message, {
            inviteId: invite.id,
            userId: data.user.id,
          });
        }
      }

      await acceptInvite(inviteCode || invite.invite_code);

      finalProfile = { ...profilePayload, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), pay_configurations: payConfigSnapshot || null } as any;

    } else {
      const profilePayload = {
          id: data.user.id, user_id: data.user.id, email: data.user.email,
          full_name: fullName, account_type: 'solo', role: 'driver'
      };
      const { error: profileError } = await supabase.from('profiles').insert(profilePayload);
      if (profileError) throw profileError;

      finalProfile = { ...profilePayload, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), pay_configurations: null } as any;
    }

    if (finalProfile) {
        setProfile(finalProfile);
        profileRef.current = finalProfile;
        hasProfileRef.current = true;

        // IMPORTANT: Proactively set setup/calendar needs based on logic above
        const isSolo = finalProfile.account_type === 'solo';
        // Solo drivers ALWAYS need setup after sign up because pay_configurations is initially null
        setNeedsSetup(isSolo);
        setNeedsLastShiftEntry(true);
    }

    if (!data.session && data.user) Alert.alert(i18n.t('auth.alerts.checkEmailTitle'), i18n.t('auth.alerts.confirmationSent'));
    return data.session ?? null;
  };

  useEffect(() => {
    let isMounted = true;
    let initialAuthResolved = false;
    let fallbackTimer: ReturnType<typeof setTimeout> | null = null;

    const finishInitialAuth = () => {
      if (!isMounted || initialAuthResolved) return;
      initialAuthResolved = true;
      if (fallbackTimer) {
        clearTimeout(fallbackTimer);
        fallbackTimer = null;
      }
      setLoading(false);
    };

    const applySessionBootstrap = async (
      currentSession: Session | null,
      isBackground: boolean,
    ) => {
      if (!isMounted) return;
      const previousSession = sessionRef.current;
      const previousUserId = previousSession?.user?.id ?? null;
      const currentUserId = currentSession?.user?.id ?? null;
      const isSameUserRefresh =
        !!currentUserId &&
        previousUserId === currentUserId;
      const isBackgroundRefresh = isBackground && isSameUserRefresh;

      if (currentSession && previousUserId && previousUserId !== currentUserId) {
        applyFailClosedBootstrapState();
      }

      setSession(currentSession);
      sessionRef.current = currentSession;
      if (currentSession) {
        await syncStoredBiometricSession(currentSession);
        const hasCurrentProfile =
          hasProfileRef.current &&
          profileRef.current?.id === currentSession.user.id;
        const cachedBootstrap = lastKnownBootstrapRef.current;
        const recentlyFetchedProfile =
          Date.now() - lastProfileFetchAtRef.current < BACKGROUND_PROFILE_REFRESH_MIN_INTERVAL_MS;

        if (isBackgroundRefresh && hasCurrentProfile && recentlyFetchedProfile) {
          setBootstrapping(false);
          return;
        }

        if (
          isBackgroundRefresh &&
          !hasCurrentProfile &&
          cachedBootstrap?.userId === currentSession.user.id
        ) {
          applyCachedBootstrapState(cachedBootstrap);
        }

        const shouldShowBootstrap = !isBackgroundRefresh && !hasCurrentProfile;
        if (shouldShowBootstrap) {
          setBootstrapping(true);
        } else {
          setBootstrapping(false);
        }
        try {
          await fetchProfile(currentSession, isBackgroundRefresh);
        } finally {
          if (isMounted && shouldShowBootstrap) setBootstrapping(false);
        }
      } else {
        setBootstrapping(false);
        applyFailClosedBootstrapState();
      }
    };

    const init = async () => {
      setLoading(true);
      try {
        const { data: { session: currentSession } } = await withTimeout(supabase.auth.getSession(), AUTH_INIT_TIMEOUT_MS);
        if (!isMounted || initialAuthResolved) return;
        await applySessionBootstrap(currentSession, false);
        finishInitialAuth();
      } catch (e) {
        if (!isMounted || initialAuthResolved) return;
        console.warn("Auth init delayed, waiting for auth listener", e);
        fallbackTimer = setTimeout(() => {
          if (!isMounted || initialAuthResolved) return;
          setSession(null);
          sessionRef.current = null;
          setBootstrapping(false);
          applyFailClosedBootstrapState();
          finishInitialAuth();
        }, AUTH_LISTENER_GRACE_MS);
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!isMounted) return;
        const isInitialEvent = !initialAuthResolved;
        await applySessionBootstrap(newSession, !isInitialEvent);
        if (isInitialEvent) finishInitialAuth();
      }
    );

    init();

    return () => {
      isMounted = false;
      if (fallbackTimer) clearTimeout(fallbackTimer);
      authListener.subscription.unsubscribe();
    };
  }, [applyCachedBootstrapState, applyFailClosedBootstrapState, fetchProfile, syncStoredBiometricSession]);

  const refreshProfile = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession) {
        await fetchProfile(currentSession, true);
    }
  }, [fetchProfile]);

  return (
    <AuthContext.Provider value={{ session, profile, loading, bootstrapping, needsSetup, needsLastShiftEntry, transientInvite, isFleetDriver, refreshProfile, completeLastShiftEntry, clearStoredBiometricSignIn, signOut, signIn, signUp }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
