import i18n from '../lib/i18n';
import { WorkSession } from './supabase';

type ViolationDetail = {
  titleKey: string;
  tipKey: string;
};

export const VIOLATION_KEYS = {
  EXCEEDED_6H_WORK: 'EXCEEDED_6H_WORK',
  INSUFFICIENT_BREAK_FOR_9H_WORK: 'INSUFFICIENT_BREAK_FOR_9H_WORK',
  INSUFFICIENT_DAILY_REST: 'INSUFFICIENT_DAILY_REST',
  REDUCED_DAILY_REST_TAKEN: 'REDUCED_DAILY_REST_TAKEN',
  EXCEEDED_4_5H_DRIVING: 'EXCEEDED_4_5H_DRIVING',
  EXCEEDED_DAILY_DRIVING_LIMIT: 'EXCEEDED_DAILY_DRIVING_LIMIT',
  USED_10H_DRIVING_EXTENSION: 'USED_10H_DRIVING_EXTENSION',
  EXCEEDED_WEEKLY_DRIVING_LIMIT: 'EXCEEDED_WEEKLY_DRIVING_LIMIT',
  EXCEEDED_WEEKLY_WORK_LIMIT: 'EXCEEDED_WEEKLY_WORK_LIMIT',
  WORK_TIME_LIMIT_EXCEEDED: 'WORK_TIME_LIMIT_EXCEEDED',
  FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED: 'FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED', // New Key
};

export const VIOLATION_DETAILS: Record<string, ViolationDetail> = {
  [VIOLATION_KEYS.EXCEEDED_6H_WORK]: { titleKey: 'violation.EXCEEDED_6H_WORK.title', tipKey: 'violation.EXCEEDED_6H_WORK.tip' },
  [VIOLATION_KEYS.INSUFFICIENT_BREAK_FOR_9H_WORK]: { titleKey: 'violation.INSUFFICIENT_BREAK_FOR_9H_WORK.title', tipKey: 'violation.INSUFFICIENT_BREAK_FOR_9H_WORK.tip' },
  [VIOLATION_KEYS.INSUFFICIENT_DAILY_REST]: { titleKey: 'violation.INSUFFICIENT_DAILY_REST.title', tipKey: 'violation.INSUFFICIENT_DAILY_REST.tip' },
  [VIOLATION_KEYS.REDUCED_DAILY_REST_TAKEN]: { titleKey: 'violation.REDUCED_DAILY_REST_TAKEN.title', tipKey: 'violation.REDUCED_DAILY_REST_TAKEN.tip' },
  [VIOLATION_KEYS.EXCEEDED_4_5H_DRIVING]: { titleKey: 'violation.EXCEEDED_4_5H_DRIVING.title', tipKey: 'violation.EXCEEDED_4_5H_DRIVING.tip' },
  [VIOLATION_KEYS.EXCEEDED_DAILY_DRIVING_LIMIT]: { titleKey: 'violation.EXCEEDED_DAILY_DRIVING_LIMIT.title', tipKey: 'violation.EXCEEDED_DAILY_DRIVING_LIMIT.tip' },
  [VIOLATION_KEYS.USED_10H_DRIVING_EXTENSION]: { titleKey: 'violation.USED_10H_DRIVING_EXTENSION.title', tipKey: 'violation.USED_10H_DRIVING_EXTENSION.tip' },
  [VIOLATION_KEYS.EXCEEDED_WEEKLY_DRIVING_LIMIT]: { titleKey: 'violation.EXCEEDED_WEEKLY_DRIVING_LIMIT.title', tipKey: 'violation.EXCEEDED_WEEKLY_DRIVING_LIMIT.tip' },
  [VIOLATION_KEYS.EXCEEDED_WEEKLY_WORK_LIMIT]: { titleKey: 'violation.EXCEEDED_WEEKLY_WORK_LIMIT.title', tipKey: 'violation.EXCEEDED_WEEKLY_WORK_LIMIT.tip' },
  [VIOLATION_KEYS.WORK_TIME_LIMIT_EXCEEDED]: { titleKey: 'violation.WORK_TIME_LIMIT_EXCEEDED.title', tipKey: 'violation.WORK_TIME_LIMIT_EXCEEDED.tip' },
  [VIOLATION_KEYS.FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED]: { titleKey: 'violation.FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED.title', tipKey: 'violation.FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED.tip' },
  default: { titleKey: 'violation.default.title', tipKey: 'violation.default.tip' },
};

export const getViolationInfo = (violationKey: string) => {
  const matchedKey = Object.keys(VIOLATION_DETAILS).find(k => k !== 'default' && violationKey.startsWith(k)) || 'default';
  const detail = VIOLATION_DETAILS[matchedKey] || VIOLATION_DETAILS.default;
  const overageTimeMatch = violationKey.match(/\((.*?)\)/);
  const overageTime = overageTimeMatch ? overageTimeMatch[1] : '';

  return {
    title: i18n.t(detail.titleKey),
    tip: i18n.t(detail.tipKey, { time: overageTime }),
    key: matchedKey,
    raw: violationKey,
  };
};

// --- COMPLIANCE CALCULATION ---
const VIOLATION_RULES = {
  MAX_DAILY_DRIVING_HOURS_REGULAR: 9,
  MAX_DAILY_DRIVING_HOURS_EXTENDED: 10,
  MAX_FORTNIGHTLY_DRIVING_HOURS: 90,
  MIN_DAILY_REST_HOURS_REGULAR: 11,
  MIN_DAILY_REST_HOURS_REDUCED: 9,
  BREAK_AFTER_6_HOURS_WORK_MINS: 30,
  BREAK_AFTER_9_HOURS_WORK_MINS: 45,
};

interface ComplianceResult {
  score: number;
  violations: string[];
}

export const calculateCompliance = (
  daySessions: WorkSession[],
  previousDaySessions: WorkSession[] | null,
  fortnightlyDrivingMinutes: number, // Now required
  weeklyDrivingExtensionsUsed: number
): ComplianceResult => {
  const violations: string[] = [];

  if (!daySessions || daySessions.length === 0) {
    return { score: 100, violations: [] };
  }

  const totalWorkMinutesToday = daySessions.reduce((acc, s) => acc + (s.total_work_minutes || 0), 0);
  const totalDrivingMinutesToday = daySessions.reduce((acc, s) => acc + (s.other_data?.driving || 0), 0);
  const totalBreakMinutesToday = daySessions.reduce((acc, s) => acc + (s.total_break_minutes || 0), 0);

  const workHours = totalWorkMinutesToday / 60;
  const drivingHours = totalDrivingMinutesToday / 60;

  // Rule: Breaks after 6 and 9 hours of work
  if (workHours > 9 && totalBreakMinutesToday < VIOLATION_RULES.BREAK_AFTER_9_HOURS_WORK_MINS) {
    violations.push(VIOLATION_KEYS.INSUFFICIENT_BREAK_FOR_9H_WORK);
  } else if (workHours > 6 && totalBreakMinutesToday < VIOLATION_RULES.BREAK_AFTER_6_HOURS_WORK_MINS) {
    violations.push(VIOLATION_KEYS.EXCEEDED_6H_WORK);
  }

  // Rule: Daily driving limits
  if (drivingHours > VIOLATION_RULES.MAX_DAILY_DRIVING_HOURS_REGULAR) {
    if (drivingHours > VIOLATION_RULES.MAX_DAILY_DRIVING_HOURS_EXTENDED || weeklyDrivingExtensionsUsed >= 2) {
      violations.push(VIOLATION_KEYS.EXCEEDED_DAILY_DRIVING_LIMIT);
    } else {
      violations.push(VIOLATION_KEYS.USED_10H_DRIVING_EXTENSION);
    }
  }
  
  // Rule: Fortnightly driving limit
  if (fortnightlyDrivingMinutes / 60 > VIOLATION_RULES.MAX_FORTNIGHTLY_DRIVING_HOURS) {
    violations.push(VIOLATION_KEYS.FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED);
  }

  // Rule: Daily rest
  if (previousDaySessions && previousDaySessions.length > 0 && daySessions[0]?.start_time) {
    const lastSessionPreviousDay = previousDaySessions.sort((a, b) => new Date(b.end_time || '').getTime() - new Date(a.end_time || '').getTime())[0];
    if (lastSessionPreviousDay?.end_time) {
      const restHours = (new Date(daySessions[0].start_time).getTime() - new Date(lastSessionPreviousDay.end_time).getTime()) / (1000 * 3600);
      if (restHours < VIOLATION_RULES.MIN_DAILY_REST_HOURS_REDUCED) {
        violations.push(VIOLATION_KEYS.INSUFFICIENT_DAILY_REST);
      } else if (restHours < VIOLATION_RULES.MIN_DAILY_REST_HOURS_REGULAR) {
        violations.push(VIOLATION_KEYS.REDUCED_DAILY_REST_TAKEN);
      }
    }
  }

  // Score is docked for violations, but not for informational "offenses"
  const score = Math.max(0, 100 - violations.filter(v => v !== VIOLATION_KEYS.USED_10H_DRIVING_EXTENSION && v !== VIOLATION_KEYS.REDUCED_DAILY_REST_TAKEN).length * 20);

  return {
    score,
    violations: [...new Set(violations)],
  };
};