import 'react-native-url-polyfill/auto';
import React, { useState, useEffect, Suspense } from 'react';
import { View, ActivityIndicator, StatusBar, AppState, AppStateStatus, Text } from 'react-native';
import { Session } from '@supabase/supabase-js';
import { supabase } from './lib/supabase';
import { useTranslation } from 'react-i18next';
import Auth from './components/Auth';
import { Dashboard } from './screens/Dashboard';

// Supabase session refresh handling
AppState.addEventListener('change', (state: AppStateStatus) => {
  if (state === 'active') {
    supabase.auth.startAutoRefresh();
  } else {
    supabase.auth.stopAutoRefresh();
  }
});

// --- NEW COMPONENT ---
// This component now contains all the logic and will be wrapped in Suspense.
function AppContent() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const { t } = useTranslation(); // The hook is now safely inside the Suspense boundary

  useEffect(() => {
    setLoading(true);
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'INITIAL_SESSION') {
        setSession(session);
        setLoading(false);
      } else if (event === 'SIGNED_IN') {
        setSession(session);
      } else if (event === 'SIGNED_OUT') {
        setSession(null);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  }, []);

  // While we wait for Supabase to give us the initial session, show a loading spinner.
  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#3b82f6" />
      </View>
    );
  }

  // Once Supabase is ready, render the appropriate screen.
  return (
    <>
      <StatusBar barStyle="light-content" />
      {session && session.user ? (
        <Dashboard key={session.user.id} session={session} />
      ) : (
        <Auth />
      )}
    </>
  );
}

// --- Main App Component (Now very simple) ---
export default function App() {
  return (
    <Suspense fallback={
      // This fallback now correctly displays if AppContent or its children suspend.
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#0f172a' }}>
        <ActivityIndicator size="large" color="#ffffff" />
        {/* We can't use 't' here, so we use a hardcoded string, which is fine for a loading screen. */}
        <Text style={{ color: 'white', marginTop: 10 }}>Loading languages...</Text>
      </View>
    }>
      <AppContent />
    </Suspense>
  );
}
