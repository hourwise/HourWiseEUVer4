import React, {
  useState,
  useEffect,
  createContext,
  useContext,
  useCallback,
} from 'react';
import { supabase } from '../lib/supabase';
import type { Session } from '@supabase/supabase-js';
import type { Database } from '../lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];
type PayConfiguration = Database['public']['Tables']['pay_configurations']['Row'];

export type ProfileWithPay = Profile & {
  pay_configurations: PayConfiguration | null;
};

interface AuthContextType {
  session: Session | null;
  profile: ProfileWithPay | null;
  loading: boolean;
  needsSetup: boolean; // 1. Add needsSetup to the context
  refreshProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<ProfileWithPay | null>(null);
  const [needsSetup, setNeedsSetup] = useState(true);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (session: Session | null) => {
    if (!session?.user) {
      setProfile(null);
      setNeedsSetup(true); // No user, no setup
      return;
    }
    try {
      // Fetch profile and pay config in parallel for efficiency
      const [{ data: profileData, error: profileError }, { data: payConfig, error: payError }] = await Promise.all([
          supabase.from('profiles').select('*').eq('id', session.user.id).single(),
          supabase.from('pay_configurations').select('user_id').eq('user_id', session.user.id).single()
      ]);

      if (profileError && profileError.code !== 'PGRST116') throw profileError;
      if (payError && payError.code !== 'PGRST116') throw payError;

      // Determine if setup is needed. It's needed if there is no full name OR no pay config.
      const setupComplete = !!(profileData?.full_name && payConfig);
      setNeedsSetup(!setupComplete);

      // We don't need the full pay config here, just the profile.
      // Other parts of the app can fetch it if/when they need it.
      setProfile(profileData ? { ...profileData, pay_configurations: null } : null);

    } catch (error: any) {
      console.error("Error fetching profile/setup status:", error.message);
      setProfile(null);
      setNeedsSetup(true);
    }
  }, []);

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  useEffect(() => {
    const init = async () => {
      setLoading(true);
      const { data: { session: currentSession } } = await supabase.auth.getSession();
      setSession(currentSession);
      if (currentSession) {
        await fetchProfile(currentSession);
      }
      setLoading(false); // Only set loading false after the initial fetch is done

      const { data: authListener } = supabase.auth.onAuthStateChange(
        async (_event, newSession) => {
          setSession(newSession);
          setLoading(true);
          if (newSession) {
            await fetchProfile(newSession);
          } else {
            // Clear state on sign out
            setProfile(null);
            setNeedsSetup(true);
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

  // Combine initial auth loading with profile loading
  const isLoading = loading || (session && profile === undefined);

  return (
    <AuthContext.Provider value={{ session, profile, loading: isLoading, needsSetup, refreshProfile, signOut }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
};
