import { useState, useCallback, useEffect } from 'react';
import { supabase } from '../lib/supabase';
import { useAuth } from '../providers/AuthProvider';

export const useDriverStats = () => {
  const { profile, session } = useAuth(); // Also get session for user ID
  const [driverName, setDriverName] = useState<string | null>(null);
  const [needsSetup, setNeedsSetup] = useState(true);
  const [loading, setLoading] = useState(true);

  const refreshStats = useCallback(async () => {
    if (!session?.user?.id || !profile) {
      setLoading(false);
      return;
    }

    setLoading(true);
    setDriverName(profile.full_name || null);

    // Explicitly check for a pay configuration in the database
    const { data, error } = await supabase
      .from('pay_configurations')
      .select('id') // We only need to check for existence
      .eq('user_id', session.user.id)
      .limit(1)
      .single();

    if (error && error.code !== 'PGRST116') { // Ignore "0 rows" error
      console.error('Error checking for pay configuration:', error);
    }

    // If data exists, setup is complete.
    setNeedsSetup(!data);
    setLoading(false);
  }, [profile, session]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  // You could add a real-time listener to the pay_configurations table here if needed
  // but for now, a refresh on profile change is sufficient.

  return { driverName, loading, refreshStats, needsSetup };
};
