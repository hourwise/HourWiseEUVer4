import { createClient } from '@supabase/supabase-js';
import AsyncStorage from '@react-native-async-storage/async-storage';

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL;
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY;

// Fail fast if configuration is missing
if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error(
    'Missing Supabase configuration. Check EXPO_PUBLIC_SUPABASE_URL and EXPO_PUBLIC_SUPABASE_ANON_KEY in your .env file.'
  );
}

// Initialize client
// If you generate types, change to: createClient<Database>(...)
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: AsyncStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});

// Type Definitions
// Ideally derived from Database['public']['Tables']['work_sessions']['Row']
export type WorkSession = {
  id: string;
  user_id: string;
  date: string; // YYYY-MM-DD
  start_time: string; // ISO 8601
  end_time: string | null; // ISO 8601 or null
  total_work_minutes: number;
  break_15_count: number;
  break_30_count: number;
  break_45_count: number;
  total_break_minutes: number;
  total_poa_minutes: number;
  timezone: string;
  created_at: string;
};
