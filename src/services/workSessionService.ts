// src/services/workSessionService.ts
import { supabase } from '../lib/supabase';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

const toLocalDateString = (date: Date): string => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

/**
 * Returns a Date for Monday 00:00:00 local time in the week containing `date`.
 * Week always starts Monday (EU standard).
 */
const getWeekStartDateObject = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
};

/**
 * Returns ISO local date string for Monday of the week containing `date`.
 */
const getWeekStartDate = (date: Date): string => {
  return toLocalDateString(getWeekStartDateObject(date));
};

// ---------------------------------------------------------------------------
// Service
// ---------------------------------------------------------------------------

export const workSessionService = {
  startSession: async (
    userId: string,
    timezone: string,
    latitude?: number,
    longitude?: number
  ) => {
    const now = new Date();
    const nowIso = now.toISOString();

    const payload = {
      start_time: nowIso,
      date: toLocalDateString(now),
      user_id: userId,
      timezone,
      is_manual_entry: false,
      start_lat: latitude ?? null,
      start_lng: longitude ?? null,
      status: 'working',
      current_break_start: null,
      current_poa_start: null,
      total_work_minutes: 0,
      total_break_minutes: 0,
      total_poa_minutes: 0,
      other_data: {
        driving: 0,
        has15minBreak: false,
      },
    };

    const response = await supabase
      .from('work_sessions')
      .insert(payload)
      .select()
      .single();

    if (response.error) {
      console.error('workSessionService.startSession error:', response.error);
    }
    return response;
  },

  endSession: async (
    sessionId: string,
    workMins: number,
    poaMins: number,
    breakMins: number,
    drivingMins: number,
    has15minBreak: boolean,
    existingOtherData: Record<string, any>,
    latitude?: number,
    longitude?: number,
    complianceScore?: number,
    complianceViolations?: string[]
  ) => {
    const payload = {
      end_time: new Date().toISOString(),
      total_work_minutes: workMins,
      total_poa_minutes: poaMins,
      total_break_minutes: breakMins,
      other_data: {
        ...(existingOtherData || {}),
        driving: drivingMins,
        has15minBreak,
      },
      end_lat: latitude ?? null,
      end_lng: longitude ?? null,
      compliance_score: complianceScore,
      compliance_violations: complianceViolations,
      status: 'idle',
      current_break_start: null,
      current_poa_start: null,
    };

    const response = await supabase
      .from('work_sessions')
      .update(payload)
      .eq('id', sessionId)
      .select()
      .single();

    if (response.error) {
      console.error('workSessionService.endSession error:', response.error);
    }
    return response;
  },

  updateSession: async (sessionId: string, sessionData: any) => {
    return supabase
      .from('work_sessions')
      .update(sessionData)
      .eq('id', sessionId)
      .select()
      .single();
  },

  deleteSession: async (sessionId: string) => {
    return supabase
      .from('work_sessions')
      .delete()
      .eq('id', sessionId);
  },

  fetchSessionsForDateRange: async (
    userId: string,
    startDate: string,
    endDate: string
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

    return data ?? [];
  },

  fetchPreviousShift: async (userId: string) => {
    const { data, error } = await supabase
      .from('work_sessions')
      .select('end_time')
      .eq('user_id', userId)
      .not('end_time', 'is', null)
      .order('end_time', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      console.error('Error fetching previous shift:', error);
      return null;
    }

    return data?.end_time ?? null;
  },

  fetchWeeklyWorkMinutes: async (
    userId: string,
    startDate: string,
    endDate?: string
  ): Promise<number> => {
    let query = supabase
      .from('work_sessions')
      .select('total_work_minutes')
      .eq('user_id', userId)
      .gte('date', startDate);

    if (endDate) {
      query = query.lte('date', endDate);
    }

    const { data, error } = await query;

    if (error) {
      console.error('Error fetching weekly work minutes:', error);
      return 0;
    }

    return data?.reduce((sum, s) => sum + (s.total_work_minutes || 0), 0) ?? 0;
  },

  fetchWeeklyDrivingMinutes: async (
    userId: string,
    forDate?: Date
  ): Promise<number> => {
    const baseDate = forDate ?? new Date();
    const weekStartDate = getWeekStartDateObject(baseDate);
    const weekEndDate = new Date(weekStartDate);
    weekEndDate.setDate(weekEndDate.getDate() + 6);

    const weekStart = toLocalDateString(weekStartDate);
    const weekEnd = toLocalDateString(weekEndDate);

    const { data, error } = await supabase
      .from('work_sessions')
      .select('other_data')
      .eq('user_id', userId)
      .gte('date', weekStart)
      .lte('date', weekEnd)
      .not('end_time', 'is', null);

    if (error) {
      console.error('Error fetching weekly driving minutes:', error);
      return 0;
    }

    return data?.reduce((sum, s) => {
      const otherData = s.other_data as any;
      return sum + (otherData?.driving ?? 0);
    }, 0) ?? 0;
  },

  fetchFortnightlyDrivingMinutes: async (
    userId: string,
    forDate?: Date
  ): Promise<number> => {
    const endDate = forDate ? new Date(forDate) : new Date();
    const startDate = new Date(endDate);
    startDate.setDate(startDate.getDate() - 13);
    startDate.setHours(0, 0, 0, 0);

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

    return data?.reduce((sum, s) => {
      const otherData = s.other_data as any;
      return sum + (otherData?.driving ?? 0);
    }, 0) ?? 0;
  },
};