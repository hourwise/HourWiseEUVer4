import { supabase } from '../lib/supabase';
import { calculatePayFromRaw } from '../lib/payCalculations';
import { format } from 'date-fns';

export interface BusinessProfile {
  legal_name?: string;
  address?: string;
  email?: string;
  phone?: string;
  tax_id?: string;
  logo_url?: string;
  [key: string]: any;
}

export const reportService = {
  /**
   * Fetches all necessary data to generate a report or invoice.
   */
  getReportData: async (userId: string, startDate: Date, endDate: Date) => {
    const start = format(startDate, 'yyyy-MM-dd');
    const end = format(endDate, 'yyyy-MM-dd');

    // Fetch all data in parallel
    const [sessionsRes, payConfigRes, businessProfileRes] = await Promise.all([
      supabase.from('work_sessions').select('*').eq('user_id', userId).gte('date', start).lte('date', end),
      supabase.from('pay_configurations').select('*').eq('user_id', userId).single(),
      supabase.from('business_profiles').select('*').eq('user_id', userId).single()
    ]);

    if (sessionsRes.error) throw new Error(sessionsRes.error.message);
    // It's okay if pay config or business profile are missing, so we don't throw for them.

    const sessions = sessionsRes.data || [];
    const payConfig = payConfigRes.data;
    const businessProfile = businessProfileRes.data;

    if (sessions.length === 0) {
      throw new Error("No data found for this period.");
    }

    const payDetailsMap = payConfig ? calculatePayFromRaw(sessions, payConfig) : new Map();
    const totalPay = Array.from(payDetailsMap.values()).reduce((sum, day) => sum + day.totalPay, 0);

    return {
      sessions,
      payConfig,
      businessProfile,
      payDetailsMap,
      totalPay
    };
  }
};
