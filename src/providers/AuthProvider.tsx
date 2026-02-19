import React, { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { supabase } from '../lib/supabase';
import type { Session, Subscription } from '@supabase/supabase-js';
import type { Database } from '../lib/database.types';

type Profile = Database['public']['Tables']['profiles']['Row'];

interface AuthContextType {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export const AuthProvider = ({ children }: { children: React.ReactNode }) => {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchProfile = useCallback(async (session: Session | null) => {
    if (session?.user) {
      const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('user_id', session.user.id)
        .limit(1)
        .single();
      if (error) {
        // Let's re-throw the error so our try/catch can handle it
        throw new Error(`AuthProvider: Error fetching profile: ${error.message}`);
      }
      setProfile(data ?? null);
    } else {
      setProfile(null);
    }
  }, []);

  useEffect(() => {
    let authSubscription: Subscription | null = null;

    const initializeAuth = async () => {
      try {
        // First, get the current session
        const { data: { session: currentSession } } = await supabase.auth.getSession();
        setSession(currentSession);
        
        // Then, fetch the profile based on that session
        await fetchProfile(currentSession);
        
        // Listen for future auth changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange(async (_event, newSession) => {
          setSession(newSession);
          await fetchProfile(newSession);
        });
        authSubscription = subscription;

      } catch (e) {
        console.error('AuthProvider init failed:', e);
        // Clear session/profile on failure
        setSession(null);
        setProfile(null);
      } finally {
        // Only now is the initial loading complete
        setLoading(false);
      }
    };

    initializeAuth();

    // The cleanup function is returned directly from useEffect
    return () => {
      authSubscription?.unsubscribe();
    };
  }, [fetchProfile]);
  
  const refreshProfile = useCallback(async () => {
    // When manually refreshing, it's okay to not show a loading spinner
    await fetchProfile(session);
  }, [session, fetchProfile]);

  const value = { session, profile, loading, refreshProfile };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
