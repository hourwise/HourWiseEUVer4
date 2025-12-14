import { supabase } from '../lib/supabase';

export const workSessionService = {
  startSession: async (userId: string, timezone: string) => {
    return await supabase
      .from('work_sessions')
      .insert({
        start_time: new Date().toISOString(),
        date: new Date().toISOString().split('T')[0],
        user_id: userId,
        timezone
      })
      .select()
      .single();
  },

  endSession: async (sessionId: string, workMins: number, poaMins: number, breakMins: number, counts: { b15: number, b30: number, b45: number }) => {
    return await supabase.from('work_sessions').update({
        end_time: new Date().toISOString(),
        total_work_minutes: workMins,
        total_poa_minutes: poaMins,
        total_break_minutes: breakMins,
        break_15_count: counts.b15,
        break_30_count: counts.b30,
        break_45_count: counts.b45
    }).eq('id', sessionId);
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
