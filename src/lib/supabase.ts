import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.'
  );
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

export const getLatestBroadcasts = async (companyId?: string | null) => {
  if (!companyId) return [];

  const { data, error } = await supabase
    .from('broadcasts')
    .select('id, content, created_at, company_id')
    .eq('company_id', companyId)
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching broadcasts:', error);
    return [];
  }
  return data ?? [];
};

export const getSystemMessages = async () => {
  const { data, error } = await supabase
    .from('system_messages')
    .select('id, content, created_at')
    .order('created_at', { ascending: false })
    .limit(20);

  if (error) {
    console.error('Error fetching system messages:', error);
    return [];
  }
  return data ?? [];
};


export type WorkSession = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // ISO 8601
  end_time: string | null; // ISO 8601 or null
  total_work_minutes: number;
  total_break_minutes: number;
  total_poa_minutes: number;
  other_data?: {
    driving?: number;
    [key: string]: any;
  };
  compliance_score?: number;
  compliance_violations?: string[];
  timezone: string;
  created_at: string;
};
