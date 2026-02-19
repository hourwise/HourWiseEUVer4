import { useState, useEffect } from 'react';
import { supabase } from '../lib/supabase';

export function useShiftInfo(userId: string) {
  const [previousShiftEnd, setPreviousShiftEnd] = useState<string | null>(null);
  const [currentShiftStart, setCurrentShiftStart] = useState<string | null>(null);
  const [dailyRest, setDailyRest] = useState<number>(0);
  const [loading, setLoading] = useState(true);

  const fetchShiftInfo = async () => {
    if (!userId) {
      setLoading(false);
      return;
    }

    setLoading(true);
    try {
      const { data: lastShift, error: lastError } = await supabase
        .from('work_sessions')
        .select('end_time')
        .eq('user_id', userId)
        .not('end_time', 'is', null)
        .order('end_time', { ascending: false })
        .limit(1)
        .single();

      if (lastError && lastError.code !== 'PGRST116') { // Ignore "single row not found"
        console.error('Error fetching last shift:', lastError);
      }
      setPreviousShiftEnd(lastShift?.end_time || null);

      const { data: activeShift, error: activeError } = await supabase
        .from('work_sessions')
        .select('start_time')
        .eq('user_id', userId)
        .is('end_time', null)
        .order('start_time', { ascending: false })
        .limit(1)
        .single();
        
      if (activeError && activeError.code !== 'PGRST116') {
        console.error('Error fetching active shift:', activeError);
      }
      setCurrentShiftStart(activeShift?.start_time || null);

      if (activeShift?.start_time && lastShift?.end_time) {
        const rest = new Date(activeShift.start_time).getTime() - new Date(lastShift.end_time).getTime();
        setDailyRest(Math.max(0, rest / 1000));
      } else {
        setDailyRest(0);
      }

    } catch (err) {
      console.error("Failed to fetch shift info:", err);
      setPreviousShiftEnd(null);
      setCurrentShiftStart(null);
      setDailyRest(0);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchShiftInfo();
  }, [userId]);

  return { previousShiftEnd, currentShiftStart, dailyRest, loading, refreshShiftInfo: fetchShiftInfo };
}
