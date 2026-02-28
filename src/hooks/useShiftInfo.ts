import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../lib/supabase';

export function useShiftInfo(userId: string | undefined) {
  const [previousShiftEnd, setPreviousShiftEnd] = useState<string | null>(null);
  const [currentShiftStart, setCurrentShiftStart] = useState<string | null>(null);
  const [dailyRest, setDailyRest] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchShiftInfo = useCallback(async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      // Fetch the last completed shift
      const { data: lastShift } = await supabase
        .from('work_sessions')
        .select('end_time')
        .eq('user_id', userId)
        .not('end_time', 'is', null)
        .order('end_time', { ascending: false })
        .limit(1)
        .single();

      setPreviousShiftEnd(lastShift?.end_time || null);

      // Fetch the currently active shift
      const { data: activeShift } = await supabase
        .from('work_sessions')
        .select('start_time')
        .eq('user_id', userId)
        .is('end_time', null)
        .order('start_time', { ascending: false }) // Get the most recent start time of an open shift
        .limit(1)
        .single();
        
      setCurrentShiftStart(activeShift?.start_time || null);

      // Calculate daily rest based on the fetched data
      if (activeShift?.start_time && lastShift?.end_time) {
        const restInSeconds = (new Date(activeShift.start_time).getTime() - new Date(lastShift.end_time).getTime()) / 1000;
        setDailyRest(Math.max(0, restInSeconds));
      } else {
        setDailyRest(0);
      }

    } catch (err) {
      // It's normal for these queries to find no rows, so we don't log those errors.
      if (err instanceof Error && !(err as any).details?.includes('0 rows')) {
          console.error("Failed to fetch shift info:", err);
      }
      // Set to defaults if anything fails
      setPreviousShiftEnd(null);
      setCurrentShiftStart(null);
      setDailyRest(0);
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;

    // Initial fetch
    fetchShiftInfo();

    // Set up a real-time listener
    const channel = supabase
      .channel(`public:work_sessions:user_id=eq.${userId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'work_sessions', filter: `user_id=eq.${userId}` },
        () => {
          console.log('Work session change detected, refetching shift info...');
          fetchShiftInfo();
        }
      )
      .subscribe();

    // Clean up the subscription when the component unmounts
    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId, fetchShiftInfo]);

  return { previousShiftEnd, currentShiftStart, dailyRest, loading, refreshShiftInfo: fetchShiftInfo };
}
