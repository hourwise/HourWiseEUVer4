import { supabase } from '../lib/supabase';

const toLocalDateString = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export const workSessionService = {
  startSession: async (userId: string, timezone: string, latitude?: number, longitude?: number) => {
    const now = new Date();
    return await supabase
      .from('work_sessions')
      .insert({
        start_time: now.toISOString(),
        date: toLocalDateString(now),
        user_id: userId,
        timezone,
        is_manual_entry: false,
        start_lat: latitude,
        start_lng: longitude,
      })
      .select()
      .single();
  },

  endSession: async (sessionId: string, workMins: number, poaMins: number, breakMins: number, drivingMins: number, latitude?: number, longitude?: number) => {
    return await supabase
      .from('work_sessions')
      .update({
        end_time: new Date().toISOString(),
        total_work_minutes: workMins,
        total_poa_minutes: poaMins,
        total_break_minutes: breakMins,
        other_data: { driving: drivingMins },
        end_lat: latitude,
        end_lng: longitude,
      })
      .eq('id', sessionId);
  },

  updateSession: async (sessionId: string, sessionData: any) => {
    return await supabase
      .from('work_sessions')
      .update(sessionData)
      .eq('id', sessionId);
  },

  deleteSession: async (sessionId: string) => {
    return await supabase
        .from('work_sessions')
        .delete()
        .eq('id', sessionId);
  },

  fetchSessionsForDateRange: async (userId: string, startDate: string, endDate: string) => {
    const { data, error } = await supabase
      .from('work_sessions')
      .select('*')
      .eq('user_id', userId)
      .gte('date', startDate)
      .lte('date', endDate)
      .order('start_time', { ascending: true });

    if (error) {
      console.error("Error fetching sessions for date range:", error);
      return [];
    }
    return data;
  },

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

  fetchWeeklyMinutes: async (userId: string, startDate: string, endDate?: string) => {
    let query = supabase
        .from('work_sessions')
        .select('total_work_minutes')
        .eq('user_id', userId)
        .gte('date', startDate);

    if (endDate) {
        query = query.lte('date', endDate);
    }

    const { data } = await query;
    if (data) {
        return data.reduce((sum, s) => sum + (s.total_work_minutes || 0), 0);
    }
    return 0;
  }
};
