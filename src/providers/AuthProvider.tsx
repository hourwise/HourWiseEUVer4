import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
} from 'react';
import { Alert } from 'react-native';
import { supabase } from '../lib/supabase';
import type { Session, SignInWithPasswordCredentials, SignUpWithPasswordCredentials } from '@supabase/supabase-js';
import type { Database } from '../lib/database.types';

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
  refreshProfile: () => Promise<void>;
  completeLastShiftEntry: () => void;
  signOut: () => Promise<void>;
  signIn: (credentials: SignInWithPasswordCredentials) => Promise<void>;
  signUp: (params: SignUpWithPasswordCredentials & { fullName: string; accountType: 'solo' | 'fleet'; invite: Invite | null; }) => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileWithPay | null>(null);
  const [needsSetup, setNeedsSetup] = useState(true);
  const [needsLastShiftEntry, setNeedsLastShiftEntry] = useState(true);
  const [loading, setLoading] = useState(true);
  const [transientInvite, setTransientInvite] = useState<Invite | null>(null);

  const fetchProfile = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setProfile(null); setNeedsSetup(true); setNeedsLastShiftEntry(true); return;
    }
    try {
      // Reverted to separate queries to avoid relationship schema cache errors
      const [
        { data: profileData, error: profileError },
        { data: payConfig, error: payError },
        { data: anySession, error: sessionError }
      ] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', session.user.id).single(),
          supabase.from('pay_configurations').select('*').eq('user_id', session.user.id).single(),
          supabase.from('work_sessions').select('id').eq('user_id', session.user.id).limit(1).single(),
      ]);

      if (profileError && profileError.code !== 'PGRST116') throw profileError;
      if (payError && payError.code !== 'PGRST116') throw payError;
      if (sessionError && sessionError.code !== 'PGRST116') throw sessionError;

      const setupComplete = !!(profileData?.full_name);
      setNeedsSetup(!setupComplete);
      setNeedsLastShiftEntry(!anySession);

      setProfile(profileData ? { ...profileData, pay_configurations: payConfig || null } : null);

    } catch (error: any) {
      console.error("Error fetching profile/setup status:", error.message);
      setProfile(null); setNeedsSetup(true); setNeedsLastShiftEntry(true);
    }
  }, []);

  const completeLastShiftEntry = () => setNeedsLastShiftEntry(false);
  const signOut = async () => { await supabase.auth.signOut(); };

  const signIn = async (credentials: SignInWithPasswordCredentials) => {
    const { error } = await supabase.auth.signInWithPassword(credentials);
    if (error) throw error;
  };

  const signUp = async ({ email, password, fullName, accountType, invite }: SignUpWithPasswordCredentials & { fullName: string; accountType: 'solo' | 'fleet'; invite: Invite | null; }) => {
    const { data, error: authError } = await supabase.auth.signUp({ email, password });
    if (authError) throw authError;
    if (!data.user) throw new Error('Sign up failed.');

    if (accountType === 'fleet' && invite) {
      setTransientInvite(invite);
      const payConfigSnapshot = invite.pay_config_snapshot as any;

      const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id, user_id: data.user.id, email: data.user.email, full_name: invite.full_name,
          account_type: 'fleet', company_id: invite.company_id, role: 'driver',
          payroll_number: payConfigSnapshot?.payroll_number,
      });
      if (profileError) throw profileError;

      if (payConfigSnapshot) {
        const { error: payConfigError } = await supabase.from('pay_configurations').insert({ user_id: data.user.id, ...payConfigSnapshot });
        if (payConfigError) console.warn("Pay config insertion failed:", payConfigError.message);
      }

      const { error: acceptError } = await supabase.rpc('accept_driver_invite', { invite_id: invite.id, user_id: data.user.id });
      if (acceptError) console.warn("Accept invite RPC failed:", acceptError.message);

    } else {
      const { error: profileError } = await supabase.from('profiles').insert({
          id: data.user.id, user_id: data.user.id, email: data.user.email,
          full_name: fullName, account_type: 'solo', role: 'driver'
      });
      if (profileError) throw profileError;
    }

    if (!data.session && data.user) Alert.alert("Check Your Email", "A confirmation link has been sent.");
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      if (currentSession) await fetchProfile(currentSession);
      setLoading(false);

      const { data: authListener } = supabase.auth.onAuthStateChange(
        async (_event, newSession) => {
          setSession(newSession);
          setLoading(true);
          if (newSession) {
            await fetchProfile(newSession);
          } else {
            setProfile(null); setNeedsSetup(true); setNeedsLastShiftEntry(true);
          }
          setLoading(false);
        }
      );
      return () => authListener.subscription.unsubscribe();
    };
    init();
  }, [fetchProfile]);

  const refreshProfile = useCallback(async () => {
    const { data: { session: currentSession } } = await supabase.auth.getSession();
    if (currentSession) {
        setLoading(true);
        await fetchProfile(currentSession);
        setLoading(false);
    }
  }, [fetchProfile]);

  const isLoading = loading || (session && profile === undefined);

  return (
    <AuthContext.Provider value={{ session, profile, loading: isLoading, needsSetup, needsLastShiftEntry, transientInvite, refreshProfile, completeLastShiftEntry, signOut, signIn, signUp }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
