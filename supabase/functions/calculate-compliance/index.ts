import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.0.0";

// Define the structure of a work session for type safety
interface WorkSession {
  id: string;
  user_id: string;
  start_time: string;
  end_time: string;
  total_work_minutes: number;
  total_break_minutes: number;
  other_data: { driving?: number };
}

// Define the compliance ruleset
const RULES = {
  MAX_CONTINUOUS_DRIVING_MINS: 4.5 * 60,
  MIN_BREAK_AFTER_DRIVING_MINS: 45,
  MAX_DAILY_DRIVING_MINS_REGULAR: 9 * 60,
  MAX_DAILY_DRIVING_MINS_EXTENDED: 10 * 60,
  MIN_DAILY_REST_HOURS_REGULAR: 11,
  MIN_DAILY_REST_HOURS_REDUCED: 9,
  BREAK_AFTER_6_HOURS_WORK_MINS: 30,
  BREAK_AFTER_9_HOURS_WORK_MINS: 45,
};

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method Not Allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    const { record: session } = await req.json();
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      { global: { headers: { Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!}` } } }
    );

    let score = 100;
    const violations: string[] = [];

    // --- 1. Daily Rest Calculation (CORRECTED LOGIC) ---
    const { data: previousSession, error: prevSessionError } = await supabase
      .from('work_sessions')
      .select('end_time')
      .eq('user_id', session.user_id)
      .not('end_time', 'is', null) // Ensure the previous shift was completed
      .lt('end_time', session.start_time) // Find shifts that ended before the current one started
      .order('end_time', { ascending: false }) // Get the one that ended most recently
      .limit(1)
      .maybeSingle();

    if (previousSession && previousSession.end_time) {
      const restHours = (new Date(session.start_time).getTime() - new Date(previousSession.end_time).getTime()) / (1000 * 3600);
      if (restHours < RULES.MIN_DAILY_REST_HOURS_REDUCED) {
        score -= 50;
        violations.push(`INSUFFICIENT_DAILY_REST (${restHours.toFixed(1)}h)`);
      } else if (restHours < RULES.MIN_DAILY_REST_HOURS_REGULAR) {
        score -= 10;
        violations.push('REDUCED_DAILY_REST_TAKEN');
      }
    }

    // --- 2. Working Time Break Calculation ---
    const workHours = session.total_work_minutes / 60;
    if (workHours > 9 && session.total_break_minutes < RULES.BREAK_AFTER_9_HOURS_WORK_MINS) {
      score -= 25;
      violations.push('INSUFFICIENT_BREAK_FOR_9H_WORK');
    } else if (workHours > 6 && session.total_break_minutes < RULES.BREAK_AFTER_6_HOURS_WORK_MINS) {
      score -= 25;
      violations.push('EXCEEDED_6H_WORK');
    }

    // --- 3. Driving Time Calculation ---
    const drivingMinutes = session.other_data?.driving || 0;
    if (drivingMinutes > RULES.MAX_DAILY_DRIVING_MINS_REGULAR) {
        score -= 40;
        violations.push('EXCEEDED_DAILY_DRIVING_LIMIT');
    }
    
    const finalScore = Math.max(0, score);

    // --- 4. Update the work_session in the database ---
    const { error: updateError } = await supabase
      .from('work_sessions')
      .update({
        compliance_score: finalScore,
        compliance_violations: violations,
      })
      .eq('id', session.id);

    if (updateError) throw updateError;

    return new Response(JSON.stringify({ message: "Compliance calculated", score: finalScore, violations }), {
      headers: { "Content-Type": "application/json" },
    });

  } catch (err) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});
