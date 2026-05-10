import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
  useRef,
} from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Session, SignInWithPasswordCredentials, SignUpWithPasswordCredentials } from '@supabase/supabase-js';
import type { Database } from '../lib/database.types';
import { clearBiometricSession } from '../lib/biometricAuth';

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
  needsSetup: boolean;
  needsLastShiftEntry: boolean;
  transientInvite: Invite | null;
  isFleetDriver: boolean;
  refreshProfile: () => Promise<void>;
  completeLastShiftEntry: () => void;
  signOut: () => Promise<void>;
  signIn: (credentials: SignInWithPasswordCredentials) => Promise<Session | null>;
  signUp: (params: SignUpWithPasswordCredentials & { fullName: string; accountType: 'solo' | 'fleet'; invite: Invite | null; }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const withTimeout = async <T,>(p: Promise<T>, ms = 8000): Promise<T> => {
  return await Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error('timeout')), ms)),
  ]);
};

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileWithPay | null>(null);
  const [needsSetup, setNeedsSetup] = useState(true);
  const [needsLastShiftEntry, setNeedsLastShiftEntry] = useState(true);
  const [loading, setLoading] = useState(true);
  const [transientInvite, setTransientInvite] = useState<Invite | null>(null);

  // Use a ref to track profile presence without triggering dependency loops
  const hasProfileRef = useRef(false);
  const isFleetDriver = !!profile?.company_id;

  const applyFailClosedBootstrapState = useCallback(() => {
    setProfile(null);
    hasProfileRef.current = false;
    setNeedsSetup(true);
    setNeedsLastShiftEntry(true);
  }, []);

  const fetchProfile = useCallback(async (session: Session | null, isBackground = false) => {
    if (!session?.user) {
      applyFailClosedBootstrapState();
      return false;
    }

    const shouldShowLoading = !hasProfileRef.current && !isBackground;
    if (shouldShowLoading) setLoading(true);

    try {
      const [
        { data: profileData, error: profileError },
        { data: payConfig, error: payError },
        { data: anySession, error: sessionError }
      ] = await withTimeout(
        Promise.all([
          supabase.from('profiles').select('*').eq('id', session.user.id).single(),
          supabase.from('pay_configurations').select('*').eq('user_id', session.user.id).single(),
          supabase.from('work_sessions').select('id').eq('user_id', session.user.id).limit(1).single(),
        ]),
        8000
      );

      if (profileError && profileError.code !== 'PGRST116') throw profileError;
      if (payError && payError.code !== 'PGRST116') throw payError;
      if (sessionError && sessionError.code !== 'PGRST116') throw sessionError;

      // Determine setup status:
      // 1. Check persistent flag from DB
      // 2. Fallback to data presence (full_name, pay_config for solo)
      const setupAlreadyMarkedComplete = !!profileData?.first_time_setup_completed_at;
      const isSolo = profileData?.account_type === 'solo';
      const requiredDataPresent = !!(profileData?.full_name) && (!isSolo || !!payConfig);

      // Setup is complete if marked in DB OR if all data is present
      const setupComplete = setupAlreadyMarkedComplete || requiredDataPresent;

      // Debug logging for setup determination
      console.log('[AuthProvider] Setup Determination:', {
        user_id: session.user?.id?.substring(0, 8),
        setupAlreadyMarkedComplete,
        requiredDataPresent,
        account_type: profileData?.account_type,
        has_full_name: !!profileData?.full_name,
        has_pay_config: !!payConfig,
        willShowSetup: !setupComplete,
      });

      setNeedsSetup(!setupComplete);
      setNeedsLastShiftEntry(!anySession);

      const newProfile = profileData ? { ...profileData, pay_configurations: payConfig || null } : null;
      setProfile(newProfile);
      hasProfileRef.current = !!newProfile;
      return true;

    } catch (error: any) {
      console.warn("fetchProfile failed or timed out:", error.message || error);
      // Preserve the last known-good auth/profile state during background refreshes
      // so transient network issues do not bounce the user back into setup flows.
      if (!hasProfileRef.current && !isBackground) {
        applyFailClosedBootstrapState();
      }
      return false;
    } finally {
      if (shouldShowLoading) setLoading(false);
    }
  }, [applyFailClosedBootstrapState]);

  const completeLastShiftEntry = () => setNeedsLastShiftEntry(false);
  const signOut = async () => {
    await clearBiometricSession();
    await supabase.auth.signOut();
  };

  const signIn = async (credentials: SignInWithPasswordCredentials) => {
    const { data, error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw error;
    return data.session;
  };

  const signUp = async ({ password, fullName, accountType, invite, ...credentials }: SignUpWithPasswordCredentials & { fullName: string; accountType: 'solo' | 'fleet'; invite: Invite | null; }) => {
    const email = 'email' in credentials ? credentials.email : undefined;
    if (!email) throw new Error('Email is required.');
    const { data, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) throw authError;
    if (!data.user) throw new Error('Sign up failed.');

    let finalProfile: ProfileWithPay | null = null;

    if (accountType === 'fleet' && invite) {
      setTransientInvite(invite);
      const payConfigSnapshot = invite.pay_config_snapshot as any;

      const profilePayload = {
          id: data.user.id, user_id: data.user.id, email: data.user.email, full_name: invite.full_name,
          account_type: 'fleet', company_id: invite.company_id, role: 'driver',
          payroll_number: payConfigSnapshot?.payroll_number,
          first_time_setup_completed_at: new Date().toISOString(),
      };

      const { error: profileError } = await supabase.from('profiles').insert(profilePayload);
      if (profileError) throw profileError;

      if (payConfigSnapshot) {
        const { error: payConfigError } = await supabase.from('pay_configurations').insert({ user_id: data.user.id, ...payConfigSnapshot });
        if (payConfigError) console.warn("Pay config insertion failed:", payConfigError.message);
      }

      const { error: acceptError } = await supabase.rpc('accept_driver_invite', { invite_id: invite.id, user_id: data.user.id });
      if (acceptError) console.warn("Accept invite RPC failed:", acceptError.message);

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
        hasProfileRef.current = true;

        // IMPORTANT: Proactively set setup/calendar needs based on logic above
        const isSolo = finalProfile.account_type === 'solo';
        // Solo drivers ALWAYS need setup after sign up because pay_configurations is initially null
        setNeedsSetup(isSolo);
        setNeedsLastShiftEntry(true);
    }

    if (!data.session && data.user) Alert.alert("Check Your Email", "A confirmation link has been sent.");
  };

  useEffect(() => {
    let isMounted = true;

    const init = async () => {
      setLoading(true);
      try {
        const { data: { session: currentSession } } = await withTimeout(supabase.auth.getSession(), 5000);
        if (!isMounted) return;
        setSession(currentSession);
        if (currentSession) {
          await fetchProfile(currentSession);
        } else {
          applyFailClosedBootstrapState();
        }
      } catch (e) {
        console.warn("Auth init timed out", e);
        if (isMounted) {
          setSession(null);
          applyFailClosedBootstrapState();
        }
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    const { data: authListener } = supabase.auth.onAuthStateChange(
      async (_event, newSession) => {
        if (!isMounted) return;
        setSession(newSession);
        if (newSession) {
          await fetchProfile(newSession, true);
        } else {
          applyFailClosedBootstrapState();
        }
      }
    );

    init();

    return () => {
      isMounted = false;
      authListener.subscription.unsubscribe();
    };
  }, [applyFailClosedBootstrapState, fetchProfile]);

  const refreshProfile = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession) {
        await fetchProfile(currentSession, true);
    }
  }, [fetchProfile]);

  return (
    <AuthContext.Provider value={{ session, profile, loading, needsSetup, needsLastShiftEntry, transientInvite, isFleetDriver, refreshProfile, completeLastShiftEntry, signOut, signIn, signUp }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
