import { useState, useEffect, useMemo } from 'react';
import { supabase, WorkSession } from '../lib/supabase';

export interface DayComplianceInfo {
  date: string;
  score: number;
  violations: string[];
  totalWork: number;
  totalBreak: number;
  totalDrive: number;
  totalPoa: number;
}

const toLocalDateString = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - (offset * 60 * 1000));
  return localDate.toISOString().split('T')[0];
};

export const useComplianceData = (userId: string, currentDate: Date) => {
  const [allSessions, setAllSessions] = useState<WorkSession[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let isMounted = true;

    const fetchSessions = async () => {
      if (!userId) return;
      setIsLoading(true);

      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();

      const firstDayOfCurrentMonth = new Date(year, month, 1);
      const lastDayOfCurrentMonth = new Date(year, month + 1, 0);

      // Fetch a bit more to have context for the calendar view
      const fetchStartDate = new Date(firstDayOfCurrentMonth);
      fetchStartDate.setDate(firstDayOfCurrentMonth.getDate() - 7);

      const fetchEndDate = new Date(lastDayOfCurrentMonth);
      fetchEndDate.setDate(lastDayOfCurrentMonth.getDate() + 7);

      const { data, error } = await supabase
        .from('work_sessions')
        .select('*')
        .eq('user_id', userId)
        .gte('date', toLocalDateString(fetchStartDate))
        .lte('date', toLocalDateString(fetchEndDate))
        .order('date', { ascending: true });

      if (isMounted) {
        if (data) setAllSessions(data as WorkSession[]);
        else setAllSessions([]);
        if (error) console.error('Error fetching sessions for compliance:', error);
        setIsLoading(false);
      }
    };

    fetchSessions();
    return () => {
      isMounted = false;
    };
  }, [userId, currentDate]);

  const complianceMap = useMemo(() => {
    const map = new Map<string, DayComplianceInfo>();

    allSessions.forEach((session) => {
      const existing = map.get(session.date);

      // Convert database minutes to seconds for the UI (Heatmap formatDuration expects seconds)
      const workSec = (session.total_work_minutes || 0) * 60;
      const breakSec = (session.total_break_minutes || 0) * 60;
      const poaSec = (session.total_poa_minutes || 0) * 60;
      const driveSec = (session.other_data?.driving || 0) * 60;

      if (existing) {
        map.set(session.date, {
          date: session.date,
          score: Math.min(existing.score, session.compliance_score ?? 100),
          violations: [...new Set([...existing.violations, ...(session.compliance_violations || [])])],
          totalWork: existing.totalWork + workSec,
          totalBreak: existing.totalBreak + breakSec,
          totalDrive: existing.totalDrive + driveSec,
          totalPoa: existing.totalPoa + poaSec,
        });
      } else {
        map.set(session.date, {
          date: session.date,
          score: session.compliance_score ?? 100,
          violations: session.compliance_violations || [],
          totalWork: workSec,
          totalBreak: breakSec,
          totalDrive: driveSec,
          totalPoa: poaSec,
        });
      }
    });

    return map;
  }, [allSessions]);

  return { complianceMap, isLoading };
};
