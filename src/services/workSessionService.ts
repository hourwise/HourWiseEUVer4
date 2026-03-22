import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const toLocalDateString = (date: Date): string => {
  const year  = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day   = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Returns the ISO date string for the Monday of the week containing `date`.
 * Week always starts Monday (EU standard).
 */
const getWeekStartDate = (date: Date): string => {
  const d   = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return toLocalDateString(d);
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const workSessionService = {

  // -------------------------------------------------------------------------
  // startSession
  // -------------------------------------------------------------------------
  startSession: async (
    userId: string,
    timezone: string,
    latitude?: number,
    longitude?: number,
  ) => {
    const now = new Date();
    return supabase
      .from('work_sessions')
      .insert({
        start_time:      now.toISOString(),
        date:            toLocalDateString(now),
        user_id:         userId,
        timezone,
        is_manual_entry: false,
        start_lat:       latitude,
        start_lng:       longitude,
        status:          'working',
      })
      .select()
      .single();
  },

  // -------------------------------------------------------------------------
  // endSession
  //
  // FIX: other_data is now spread-merged rather than overwritten so any
  // fields written during the session (e.g. has15minBreak) are preserved.
  //
  // IMPORTANT — callers must pass existingOtherData from sessionData so the
  // spread is complete. In useWorkTimer's endWork:
  //
  //   await workSessionService.endSession(
  //     sessionIdRef.current,
  //     toMins(finalTotals.work),
  //     toMins(finalTotals.poa),
  //     toMins(finalTotals.break),
  //     toMins(finalTotals.driving),
  //     breakTrackerRef.current.has15min,   // ← NEW param
  //     sessionData?.other_data ?? {},       // ← NEW param (existing other_data)
  //     loc?.coords.latitude,
  //     loc?.coords.longitude,
  //     score,
  //     violations,
  //   );
  // -------------------------------------------------------------------------
  endSession: async (
    sessionId: string,
    workMins: number,
    poaMins: number,
    breakMins: number,
    drivingMins: number,
    has15minBreak: boolean,          // from breakTrackerRef.current.has15min
    existingOtherData: Record<string, any>, // from sessionData?.other_data
    latitude?: number,
    longitude?: number,
    complianceScore?: number,
    complianceViolations?: string[],
  ) => {
    return supabase
      .from('work_sessions')
      .update({
        end_time:              new Date().toISOString(),
        total_work_minutes:    workMins,
        total_poa_minutes:     poaMins,
        total_break_minutes:   breakMins,
        // FIX: spread existing other_data fields rather than overwriting
        other_data: {
          ...existingOtherData,
          driving:       drivingMins,
          has15minBreak, // used by calculateCompliance for 4.5h break rule
        },
        end_lat:               latitude,
        end_lng:               longitude,
        compliance_score:      complianceScore,
        compliance_violations: complianceViolations,
        status:                'idle',
        current_break_start:   null,
        current_poa_start:     null,
      })
      .eq('id', sessionId);
  },

  // -------------------------------------------------------------------------
  // updateSession — unchanged
  // -------------------------------------------------------------------------
  updateSession: async (sessionId: string, sessionData: any) => {
    return supabase
      .from('work_sessions')
      .update(sessionData)
      .eq('id', sessionId);
  },

  // -------------------------------------------------------------------------
  // deleteSession — unchanged
  // -------------------------------------------------------------------------
  deleteSession: async (sessionId: string) => {
    return supabase
      .from('work_sessions')
      .delete()
      .eq('id', sessionId);
  },

  // -------------------------------------------------------------------------
  // fetchSessionsForDateRange — unchanged
  // -------------------------------------------------------------------------
  fetchSessionsForDateRange: async (
    userId: string,
    startDate: string,
    endDate: string,
  ) => {
    const { data, error } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('start_time', { ascending: true });

    if (error) {
      console.error('Error fetching sessions for date range:', error);
      return [];
    }
    return data;
  },

  // -------------------------------------------------------------------------
  // fetchPreviousShift — unchanged
  // -------------------------------------------------------------------------
  fetchPreviousShift: async (userId: string) => {
    const { data } = await supabase
      .from('work_sessions')
      .select('end_time')
      .eq('user_id', userId)
      .not('end_time', 'is', null)
      .order('end_time', { ascending: false })
      .limit(1)
      .single();
    return data?.end_time;
  },

  // -------------------------------------------------------------------------
  // fetchWeeklyWorkMinutes
  //
  // FIX: renamed from fetchWeeklyMinutes for clarity. Fetches total_work_minutes
  // for the Mon–Sun week containing startDate.
  // -------------------------------------------------------------------------
  fetchWeeklyWorkMinutes: async (
    userId: string,
    startDate: string,
    endDate?: string,
  ): Promise<number> => {
    let query = supabase
      .from('work_sessions')
      .select('total_work_minutes')
      .eq('user_id', userId)
      .gte('date', startDate);

    if (endDate) query = query.lte('date', endDate);

    const { data } = await query;
    return data?.reduce((sum, s) => sum + (s.total_work_minutes || 0), 0) ?? 0;
  },

  // -------------------------------------------------------------------------
  // fetchWeeklyDrivingMinutes — NEW
  //
  // Fetches the total driving minutes already accumulated in the Mon–Sun week
  // containing `forDate`. Used by useWorkTimer on shift start to initialise
  // the weekly driving accumulator for live 56h limit alerting.
  //
  // Usage in useWorkTimer startWork:
  //
  //   const weekStart = getWeekStartDate(new Date());
  //   const weeklyDrivingMins = await workSessionService.fetchWeeklyDrivingMinutes(
  //     userId,
  //     weekStart,
  //   );
  //   weeklyDrivingAccumulatorRef.current = weeklyDrivingMins * 60; // convert to seconds
  // -------------------------------------------------------------------------
  fetchWeeklyDrivingMinutes: async (
    userId: string,
    forDate?: Date,
  ): Promise<number> => {
    const weekStart = getWeekStartDate(forDate ?? new Date());

    // Week ends on Sunday — 6 days after Monday
    const weekEndDate = new Date(weekStart);
    weekEndDate.setDate(weekEndDate.getDate() + 6);
    const weekEnd = toLocalDateString(weekEndDate);

    const { data, error } = await supabase
      .from('work_sessions')
      .select('other_data')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .not('end_time', 'is', null); // completed sessions only

    if (error) {
      console.error('Error fetching weekly driving minutes:', error);
      return 0;
    }

    return data?.reduce((sum, s) => sum + (s.other_data?.driving ?? 0), 0) ?? 0;
  },

  // -------------------------------------------------------------------------
  // fetchFortnightlyDrivingMinutes — NEW
  //
  // Fetches total driving minutes across the 14 calendar days ending today
  // (inclusive). Used to initialise a fortnightly accumulator ref on shift
  // start if you want to add a live 90h alert in future.
  // -------------------------------------------------------------------------
  fetchFortnightlyDrivingMinutes: async (
    userId: string,
    forDate?: Date,
  ): Promise<number> => {
    const endDate   = forDate ?? new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 13); // 14 days inclusive

    const { data, error } = await supabase
      .from('work_sessions')
      .select('other_data')
      .eq('user_id', userId)
      .gte('date', toLocalDateString(startDate))
      .lte('date', toLocalDateString(endDate))
      .not('end_time', 'is', null);

    if (error) {
      console.error('Error fetching fortnightly driving minutes:', error);
      return 0;
    }

    return data?.reduce((sum, s) => sum + (s.other_data?.driving ?? 0), 0) ?? 0;
  },
};