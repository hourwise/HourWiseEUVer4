import { supabase } from '../lib/supabase';
import { calculatePayFromRaw } from '../lib/payCalculations';
import { format } from 'date-fns';

export interface BusinessProfile {
  legal_name?: string;
  address?: string;
  email?: string;
  phone?: string;
  tax_id?: string;
  vat_number?: string;
  payment_terms?: string;
  invoice_counter?: number;
  logo_url?: string;
  [key: string]: any;
}

export interface Client {
  id: string;
  name: string;
  address: string;
  email: string;
}

export const reportService = {
  /**
   * Fetches all necessary data to generate a report or invoice.
   */
  getReportData: async (userId: string, startDate: Date, endDate: Date) => {
    const start = format(startDate, 'yyyy-MM-dd');
    const end = format(endDate, 'yyyy-MM-dd');

    // Fetch all data in parallel
    const [sessionsRes, payConfigRes, businessProfileRes, vehicleChecksRes, expensesRes, clientsRes] = await Promise.all([
      supabase.from('work_sessions').select('*').eq('user_id', userId).gte('date', start).lte('date', end),
      supabase.from('pay_configurations').select('*').eq('user_id', userId).single(),
      supabase.from('business_profiles').select('*').eq('user_id', userId).single(),
      supabase.from('vehicle_checks')
        .select('*, profiles(full_name)')
        .eq('driver_id', userId)
        .gte('created_at', startDate.toISOString())
        .lte('created_at', endDate.toISOString())
        .order('created_at', { ascending: true }),
      supabase.from('expenses').select('*').eq('user_id', userId).gte('date', start).lte('date', end),
      supabase.from('clients').select('*').eq('user_id', userId).order('name')
    ]);

    const sessions = sessionsRes.data || [];
    const payConfig = payConfigRes.data;
    const businessProfile = businessProfileRes.data;
    const vehicleChecks = vehicleChecksRes.data || [];
    const expenses = expensesRes.data || [];
    const clients = clientsRes.data || [];

    const payDetailsMap = payConfig ? calculatePayFromRaw(sessions, payConfig) : new Map();
    const totalPay = Array.from(payDetailsMap.values()).reduce((sum, day) => sum + day.totalPay, 0);

    return {
      sessions,
      payConfig,
      businessProfile,
      payDetailsMap,
      totalPay,
      vehicleChecks,
      expenses,
      clients
    };
  },

  incrementInvoiceCounter: async (userId: string, currentCounter: number) => {
    await supabase
      .from('business_profiles')
      .update({ invoice_counter: (currentCounter || 1) + 1 })
      .eq('user_id', userId);
  }
};
