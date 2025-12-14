import { useState, useCallback, useEffect } from 'react';import { supabase } from '../lib/supabase';
import { workSessionService } from '../services/workSessionService';
import { startOfWeek, subWeeks } from 'date-fns';

export const useDriverStats = (userId: string | undefined) => {
  const [driverName, setDriverName] = useState<string | null>(null);
  const [previousShiftEnd, setPreviousShiftEnd] = useState<string | null>(null);
  const [weeklyHours, setWeeklyHours] = useState(0);
  const [previousWeekHours, setPreviousWeekHours] = useState(0);
  const [loading, setLoading] = useState(true);

  const refreshStats = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      // Fetch Profile
      const { data: profile } = await supabase.from('driver_profiles').select('driver_name').eq('user_id', userId).single();
      setDriverName(profile?.driver_name || null);

      // Fetch Previous Shift
      const prevEnd = await workSessionService.fetchPreviousShift(userId);
      setPreviousShiftEnd(prevEnd);

      // Calculate Weekly Stats
      const now = new Date();
      const startOfCurrentWeek = startOfWeek(now, { weekStartsOn: 1 }).toISOString().split('T')[0];
      const startOfLastWeek = startOfWeek(subWeeks(now, 1), { weekStartsOn: 1 }).toISOString().split('T')[0];
      const endOfLastWeek = startOfWeek(now, { weekStartsOn: 1 }).toISOString().split('T')[0];

      const [wHours, pwHours] = await Promise.all([
        workSessionService.fetchWeeklyMinutes(userId, startOfCurrentWeek),
        workSessionService.fetchWeeklyMinutes(userId, startOfLastWeek, endOfLastWeek)
      ]);

      setWeeklyHours(wHours / 60);
      setPreviousWeekHours(pwHours / 60);

    } catch (e) {
      console.error("Error loading driver stats:", e);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    refreshStats();
  }, [refreshStats]);

  return { driverName, previousShiftEnd, weeklyHours, previousWeekHours, loading, refreshStats, needsSetup: !driverName && !loading };
};
