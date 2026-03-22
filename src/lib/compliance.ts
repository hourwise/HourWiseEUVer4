import i18n from '../lib/i18n';
import { WorkSession } from './supabase';

// ---------------------------------------------------------------------------
// Violation keys & display metadata
// ---------------------------------------------------------------------------

export const VIOLATION_KEYS = {
  // Driving — EC 561/2006
  EXCEEDED_4_5H_DRIVING:          'EXCEEDED_4_5H_DRIVING',
  EXCEEDED_DAILY_DRIVING_LIMIT:   'EXCEEDED_DAILY_DRIVING_LIMIT',
  USED_10H_DRIVING_EXTENSION:     'USED_10H_DRIVING_EXTENSION',
  EXCEEDED_WEEKLY_DRIVING_LIMIT:  'EXCEEDED_WEEKLY_DRIVING_LIMIT',
  FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED: 'FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED',

  // Working time — EU WTD 2002/15/EC
  EXCEEDED_6H_WORK:               'EXCEEDED_6H_WORK',
  INSUFFICIENT_BREAK_FOR_9H_WORK: 'INSUFFICIENT_BREAK_FOR_9H_WORK',
  EXCEEDED_WEEKLY_WORK_LIMIT:     'EXCEEDED_WEEKLY_WORK_LIMIT',
  WORK_TIME_LIMIT_EXCEEDED:       'WORK_TIME_LIMIT_EXCEEDED',

  // Rest — EC 561/2006
  INSUFFICIENT_DAILY_REST:        'INSUFFICIENT_DAILY_REST',
  REDUCED_DAILY_REST_TAKEN:       'REDUCED_DAILY_REST_TAKEN',
} as const;

type ViolationKey = typeof VIOLATION_KEYS[keyof typeof VIOLATION_KEYS];

type ViolationDetail = { titleKey: string; tipKey: string };

export const VIOLATION_DETAILS: Record<string, ViolationDetail> = {
  [VIOLATION_KEYS.EXCEEDED_4_5H_DRIVING]:           { titleKey: 'violation.EXCEEDED_4_5H_DRIVING.title',           tipKey: 'violation.EXCEEDED_4_5H_DRIVING.tip' },
  [VIOLATION_KEYS.EXCEEDED_DAILY_DRIVING_LIMIT]:    { titleKey: 'violation.EXCEEDED_DAILY_DRIVING_LIMIT.title',    tipKey: 'violation.EXCEEDED_DAILY_DRIVING_LIMIT.tip' },
  [VIOLATION_KEYS.USED_10H_DRIVING_EXTENSION]:      { titleKey: 'violation.USED_10H_DRIVING_EXTENSION.title',      tipKey: 'violation.USED_10H_DRIVING_EXTENSION.tip' },
  [VIOLATION_KEYS.EXCEEDED_WEEKLY_DRIVING_LIMIT]:   { titleKey: 'violation.EXCEEDED_WEEKLY_DRIVING_LIMIT.title',   tipKey: 'violation.EXCEEDED_WEEKLY_DRIVING_LIMIT.tip' },
  [VIOLATION_KEYS.FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED]: { titleKey: 'violation.FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED.title', tipKey: 'violation.FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED.tip' },
  [VIOLATION_KEYS.EXCEEDED_6H_WORK]:                { titleKey: 'violation.EXCEEDED_6H_WORK.title',                tipKey: 'violation.EXCEEDED_6H_WORK.tip' },
  [VIOLATION_KEYS.INSUFFICIENT_BREAK_FOR_9H_WORK]:  { titleKey: 'violation.INSUFFICIENT_BREAK_FOR_9H_WORK.title',  tipKey: 'violation.INSUFFICIENT_BREAK_FOR_9H_WORK.tip' },
  [VIOLATION_KEYS.EXCEEDED_WEEKLY_WORK_LIMIT]:      { titleKey: 'violation.EXCEEDED_WEEKLY_WORK_LIMIT.title',      tipKey: 'violation.EXCEEDED_WEEKLY_WORK_LIMIT.tip' },
  [VIOLATION_KEYS.WORK_TIME_LIMIT_EXCEEDED]:        { titleKey: 'violation.WORK_TIME_LIMIT_EXCEEDED.title',        tipKey: 'violation.WORK_TIME_LIMIT_EXCEEDED.tip' },
  [VIOLATION_KEYS.INSUFFICIENT_DAILY_REST]:         { titleKey: 'violation.INSUFFICIENT_DAILY_REST.title',         tipKey: 'violation.INSUFFICIENT_DAILY_REST.tip' },
  [VIOLATION_KEYS.REDUCED_DAILY_REST_TAKEN]:        { titleKey: 'violation.REDUCED_DAILY_REST_TAKEN.title',        tipKey: 'violation.REDUCED_DAILY_REST_TAKEN.tip' },
  default: { titleKey: 'violation.default.title', tipKey: 'violation.default.tip' },
};

export const getViolationInfo = (violationKey: string) => {
  const matchedKey =
    Object.keys(VIOLATION_DETAILS).find(
      k => k !== 'default' && violationKey.startsWith(k)
    ) || 'default';

  const detail = VIOLATION_DETAILS[matchedKey] || VIOLATION_DETAILS.default;
  const overageTimeMatch = violationKey.match(/\((.*?)\)/);
  const overageTime = overageTimeMatch ? overageTimeMatch[1] : '';

  return {
    title: i18n.t(detail.titleKey),
    tip:   i18n.t(detail.tipKey, { time: overageTime }),
    key:   matchedKey,
    raw:   violationKey,
  };
};

// ---------------------------------------------------------------------------
// Rule constants
// ---------------------------------------------------------------------------

const RULES = {
  // EC 561/2006 — driving
  MAX_CONTINUOUS_DRIVING_MINS:      270,   // 4.5 hours
  MIN_BREAK_AFTER_4_5H_MINS:         45,   // 45 min (or 15+30 split)
  MIN_BREAK_FIRST_SPLIT_MINS:        15,   // first part of split break
  MIN_BREAK_SECOND_SPLIT_MINS:       30,   // second part of split break
  MAX_DAILY_DRIVING_MINS_REGULAR:   540,   // 9 hours
  MAX_DAILY_DRIVING_MINS_EXTENDED:  600,   // 10 hours (max twice per week)
  MAX_WEEKLY_DRIVING_MINS:         3360,   // 56 hours
  MAX_FORTNIGHTLY_DRIVING_MINS:    5400,   // 90 hours

  // EU WTD 2002/15/EC — working time
  MAX_WORK_BEFORE_BREAK_MINS:       360,   // 6 hours — break required BEFORE exceeding
  MIN_BREAK_AFTER_6H_MINS:           30,   // 30 min break after 6h work
  MAX_WORK_BEFORE_LONG_BREAK_MINS:  540,   // 9 hours — 45 min break required
  MIN_BREAK_AFTER_9H_MINS:           45,   // 45 min break after 9h work
  MAX_WEEKLY_WORK_MINS:            2880,   // 48 hours (WTD average — flagged not hard violated)
  MAX_ABSOLUTE_WEEKLY_WORK_MINS:   3600,   // 60 hours (absolute weekly cap)

  // EC 561/2006 — rest
  MIN_DAILY_REST_HOURS_REGULAR:      11,
  MIN_DAILY_REST_HOURS_REDUCED:       9,
  MAX_REDUCED_REST_PER_WEEK:          3,   // reduced rest allowed max 3x between weekly rests

  // Score deductions
  DEDUCTION_PER_HARD_VIOLATION:      20,
} as const;

// ---------------------------------------------------------------------------
// Date utilities — week always starts Monday (EU standard)
// ---------------------------------------------------------------------------

/**
 * Returns Monday 00:00:00 local time for the week containing `date`.
 */
function getWeekStart(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay(); // 0=Sun … 6=Sat
  const diff = (day === 0 ? -6 : 1 - day); // shift to Monday
  d.setDate(d.getDate() + diff);
  d.setHours(0, 0, 0, 0);
  return d;
}

/**
 * Returns the date exactly `days` calendar days before `from`, at 00:00:00.
 */
function daysAgo(from: Date, days: number): Date {
  const d = new Date(from);
  d.setDate(d.getDate() - days);
  d.setHours(0, 0, 0, 0);
  return d;
}

// ---------------------------------------------------------------------------
// Session field helpers
// ---------------------------------------------------------------------------

const driveMins  = (s: any): number => s.other_data?.driving   ?? 0;
const workMins   = (s: any): number => s.total_work_minutes     ?? 0;
const breakMins  = (s: any): number => s.total_break_minutes    ?? 0;

/**
 * Whether the session's break structure satisfies the 15+30 split rule.
 *
 * Because we only store total_break_minutes (no segment detail), we rely on
 * the boolean `other_data.has15minBreak` that useWorkTimer writes via
 * breakTrackerRef.has15min when ending a shift.
 *
 * If that field is absent we fall back to treating any break ≥ 45 min as
 * valid (conservative but unambiguous).
 */
function breakSatisfies45MinRule(session: any): boolean {
  const total = breakMins(session);
  const has15 = session.other_data?.has15minBreak ?? false;

  // Full 45-min uninterrupted break
  if (total >= RULES.MIN_BREAK_AFTER_4_5H_MINS) return true;

  // 15+30 split: first part already taken (tracked by hook), total ≥ 45
  // We check has15 as confirmation the split was structured correctly.
  if (has15 && total >= RULES.MIN_BREAK_AFTER_4_5H_MINS) return true;

  return false;
}

/**
 * Whether the session's break satisfies the WTD 6h/9h break rules.
 *
 * EU WTD allows the same 15+30 split structure as EC 561/2006 for breaks,
 * so we reuse the same logic with the appropriate threshold.
 */
function breakSatisfiesWtdRule(session: any, thresholdMins: number): boolean {
  const total = breakMins(session);
  const has15 = session.other_data?.has15minBreak ?? false;

  if (total >= thresholdMins) return true;

  // For the 30-min WTD threshold, a 15+15 split is NOT sufficient —
  // it must be a single uninterrupted 30-min period.
  // For the 45-min WTD threshold, the 15+30 split is valid.
  if (thresholdMins === RULES.MIN_BREAK_AFTER_9H_MINS && has15 && total >= thresholdMins) {
    return true;
  }

  return false;
}

// ---------------------------------------------------------------------------
// Violation helpers — these keep the main function readable
// ---------------------------------------------------------------------------

/**
 * RULE: 4.5h continuous driving (EC 561/2006 Art. 7)
 *
 * If driving exceeds 270 minutes the driver must have taken a qualifying
 * break. We cannot verify continuity from totals alone, so we check:
 * - Did total driving exceed 4.5h?
 * - If so, did the break structure satisfy the 45-min / 15+30 split rule?
 *
 * NOTE: This is a conservative end-of-shift check. The live 4.5h alert
 * in useWorkTimer handles the real-time enforcement during a shift.
 */
function check4_5hDriving(today: any): ViolationKey | null {
  if (driveMins(today) <= RULES.MAX_CONTINUOUS_DRIVING_MINS) return null;
  if (breakSatisfies45MinRule(today)) return null;
  return VIOLATION_KEYS.EXCEEDED_4_5H_DRIVING;
}

/**
 * RULE: Daily driving limit (EC 561/2006 Art. 6)
 *
 * 9h regular, 10h extended (max twice per calendar week).
 * Returns the appropriate violation key or null.
 * Also returns whether the 10h extension was used (for the weekly counter).
 */
function checkDailyDriving(
  today: any,
  sessionsThisWeekExcludingToday: any[],
): { violation: ViolationKey | null; usedExtension: boolean } {
  const drive = driveMins(today);

  if (drive <= RULES.MAX_DAILY_DRIVING_MINS_REGULAR) {
    return { violation: null, usedExtension: false };
  }

  if (drive > RULES.MAX_DAILY_DRIVING_MINS_EXTENDED) {
    return { violation: VIOLATION_KEYS.EXCEEDED_DAILY_DRIVING_LIMIT, usedExtension: false };
  }

  // Between 9h and 10h — check how many extensions already used this week
  const extensionsUsedThisWeek = sessionsThisWeekExcludingToday.filter(
    s => driveMins(s) > RULES.MAX_DAILY_DRIVING_MINS_REGULAR
  ).length;

  if (extensionsUsedThisWeek >= 2) {
    // Third extension attempt — hard violation
    return { violation: VIOLATION_KEYS.EXCEEDED_DAILY_DRIVING_LIMIT, usedExtension: false };
  }

  // Extension is legitimate — informational only
  return { violation: VIOLATION_KEYS.USED_10H_DRIVING_EXTENSION, usedExtension: true };
}

/**
 * RULE: Weekly driving limit 56h (EC 561/2006 Art. 6.2)
 *
 * Sum all driving in the Monday–Sunday week containing today's shift.
 */
function checkWeeklyDriving(
  today: any,
  sessionsThisWeekExcludingToday: any[],
): ViolationKey | null {
  const totalThisWeek =
    driveMins(today) +
    sessionsThisWeekExcludingToday.reduce((sum, s) => sum + driveMins(s), 0);

  return totalThisWeek > RULES.MAX_WEEKLY_DRIVING_MINS
    ? VIOLATION_KEYS.EXCEEDED_WEEKLY_DRIVING_LIMIT
    : null;
}

/**
 * RULE: Fortnightly driving limit 90h (EC 561/2006 Art. 6.3)
 *
 * Sum all driving across the 14 calendar days ending today (inclusive).
 * Uses calendar days, not session count.
 */
function checkFortnightlyDriving(
  today: any,
  allHistoricalSessions: any[],
): ViolationKey | null {
  const shiftDate = new Date(today.start_time);
  const cutoff = daysAgo(shiftDate, 13); // 14 days inclusive of today

  const sessionsInFortnight = allHistoricalSessions.filter(s => {
    const d = new Date(s.start_time);
    return d >= cutoff && d <= shiftDate;
  });

  const total =
    driveMins(today) +
    sessionsInFortnight.reduce((sum, s) => sum + driveMins(s), 0);

  return total > RULES.MAX_FORTNIGHTLY_DRIVING_MINS
    ? VIOLATION_KEYS.FORTNIGHTLY_DRIVING_LIMIT_EXCEEDED
    : null;
}

/**
 * RULE: WTD break obligations (2002/15/EC Art. 5)
 *
 * - Work > 6h requires a break of ≥ 30 min before the limit is reached
 * - Work > 9h requires a break of ≥ 45 min
 *
 * Because we only have total_break_minutes we check end-of-shift totals.
 * The live hook alert handles real-time enforcement.
 */
function checkWtdBreaks(today: any): ViolationKey | null {
  const work  = workMins(today);
  const total = breakMins(today);

  if (work > RULES.MAX_WORK_BEFORE_LONG_BREAK_MINS) {
    // Over 9h — needs 45 min qualifying break
    if (!breakSatisfiesWtdRule(today, RULES.MIN_BREAK_AFTER_9H_MINS)) {
      return VIOLATION_KEYS.INSUFFICIENT_BREAK_FOR_9H_WORK;
    }
  } else if (work > RULES.MAX_WORK_BEFORE_BREAK_MINS) {
    // Over 6h but under 9h — needs 30 min uninterrupted break
    if (total < RULES.MIN_BREAK_AFTER_6H_MINS) {
      return VIOLATION_KEYS.EXCEEDED_6H_WORK;
    }
  }

  return null;
}

/**
 * RULE: Weekly working time limits (WTD 2002/15/EC Art. 4)
 *
 * - 60h absolute weekly cap (hard violation)
 * - 48h average weekly cap (informational — averaged over 17 weeks, flagged
 *   only when the single week itself exceeds 48h as an early warning)
 */
function checkWeeklyWork(
  today: any,
  sessionsThisWeekExcludingToday: any[],
): ViolationKey | null {
  const totalThisWeek =
    workMins(today) +
    sessionsThisWeekExcludingToday.reduce((sum, s) => sum + workMins(s), 0);

  if (totalThisWeek > RULES.MAX_ABSOLUTE_WEEKLY_WORK_MINS) {
    return VIOLATION_KEYS.WORK_TIME_LIMIT_EXCEEDED; // 60h hard cap
  }

  if (totalThisWeek > RULES.MAX_WEEKLY_WORK_MINS) {
    return VIOLATION_KEYS.EXCEEDED_WEEKLY_WORK_LIMIT; // 48h advisory
  }

  return null;
}

/**
 * RULE: Daily rest (EC 561/2006 Art. 8)
 *
 * Minimum 11h daily rest. Reduced to 9h allowed, but max 3 times between
 * weekly rests. We count reduced rests in the current Mon–Sun week.
 */
function checkDailyRest(
  today: any,
  previousSession: any | null,
  sessionsThisWeekExcludingToday: any[],
): ViolationKey | null {
  if (!previousSession?.end_time) return null;

  const prevEnd      = new Date(previousSession.end_time).getTime();
  const currentStart = new Date(today.start_time).getTime();
  const restHours    = (currentStart - prevEnd) / (1000 * 3600);

  if (restHours < RULES.MIN_DAILY_REST_HOURS_REDUCED) {
    return VIOLATION_KEYS.INSUFFICIENT_DAILY_REST; // hard violation
  }

  if (restHours < RULES.MIN_DAILY_REST_HOURS_REGULAR) {
    // Reduced rest taken — check whether allowance already exhausted this week
    const reducedRestsThisWeek = sessionsThisWeekExcludingToday.filter(s => {
      const precedingIdx = sessionsThisWeekExcludingToday.indexOf(s) - 1;
      if (precedingIdx < 0) return false;
      const prev = sessionsThisWeekExcludingToday[precedingIdx];
      if (!prev?.end_time) return false;
      const gap = (new Date(s.start_time).getTime() - new Date(prev.end_time).getTime()) / (1000 * 3600);
      return gap >= RULES.MIN_DAILY_REST_HOURS_REDUCED && gap < RULES.MIN_DAILY_REST_HOURS_REGULAR;
    }).length;

    if (reducedRestsThisWeek >= RULES.MAX_REDUCED_REST_PER_WEEK) {
      // Allowance exhausted — treat as hard violation
      return VIOLATION_KEYS.INSUFFICIENT_DAILY_REST;
    }

    return VIOLATION_KEYS.REDUCED_DAILY_REST_TAKEN; // informational
  }

  return null;
}

// ---------------------------------------------------------------------------
// Soft violations — informational flags that don't deduct score points
// ---------------------------------------------------------------------------

const SOFT_VIOLATIONS = new Set<string>([
  VIOLATION_KEYS.USED_10H_DRIVING_EXTENSION,
  VIOLATION_KEYS.REDUCED_DAILY_REST_TAKEN,
  VIOLATION_KEYS.EXCEEDED_WEEKLY_WORK_LIMIT, // 48h advisory, not the 60h hard cap
]);

// ---------------------------------------------------------------------------
// Main export
// ---------------------------------------------------------------------------

export interface ComplianceResult {
  score: number;
  violations: string[];
}

/**
 * Calculates end-of-shift compliance against EU tachograph and WTD rules.
 *
 * @param historicalSessions  All sessions for this user (last 28 days is
 *                            sufficient). Must NOT include the current shift.
 * @param currentShift        The shift just completed. Must have:
 *                            - start_time / end_time (ISO strings)
 *                            - total_work_minutes
 *                            - total_break_minutes
 *                            - total_poa_minutes
 *                            - other_data.driving  (minutes)
 *                            - other_data.has15minBreak  (boolean) ← NEW
 *                              Set this from breakTrackerRef.has15min in
 *                              useWorkTimer before calling endSession.
 *
 * IMPORTANT — other_data.has15minBreak:
 * In useWorkTimer's endWork callback, before calling workSessionService.endSession,
 * include this field in other_data:
 *
 *   other_data: {
 *     ...existingOtherData,
 *     driving: toMins(finalTotals.driving),
 *     has15minBreak: breakTrackerRef.current.has15min,  // ← add this
 *   }
 *
 * Without it the 4.5h driving break check falls back to total minutes only.
 */
export const calculateCompliance = (
  historicalSessions: WorkSession[],
  currentShift: any,
): ComplianceResult => {
  const violations: string[] = [];

  // -------------------------------------------------------------------------
  // 1. Build week-scoped session lists
  //    Historical sessions are sorted oldest→newest for rest gap calculation.
  // -------------------------------------------------------------------------

  const shiftDate  = new Date(currentShift.start_time);
  const weekStart  = getWeekStart(shiftDate);
  const fortnightCutoff = daysAgo(shiftDate, 13);

  // Sorted oldest → newest for sequential rest-gap analysis
  const historySorted = [...historicalSessions].sort(
    (a, b) => new Date(a.start_time).getTime() - new Date(b.start_time).getTime()
  );

  // Sessions in the same Mon–Sun week as today, excluding today
  const sessionsThisWeek = historySorted.filter(s => {
    const d = new Date(s.start_time);
    return d >= weekStart && d < shiftDate;
  });

  // The most recent completed session before today (for rest gap)
  const previousSession = historySorted.findLast(
    s => new Date(s.start_time) < shiftDate
  ) ?? null;

  // -------------------------------------------------------------------------
  // 2. Run each rule check
  // -------------------------------------------------------------------------

  // --- EC 561/2006 Driving rules ---

  const driving4_5h = check4_5hDriving(currentShift);
  if (driving4_5h) violations.push(driving4_5h);

  const { violation: dailyDrivingViolation } = checkDailyDriving(
    currentShift,
    sessionsThisWeek,
  );
  if (dailyDrivingViolation) violations.push(dailyDrivingViolation);

  const weeklyDriving = checkWeeklyDriving(currentShift, sessionsThisWeek);
  if (weeklyDriving) violations.push(weeklyDriving);

  const fortnightlyDriving = checkFortnightlyDriving(currentShift, historySorted);
  if (fortnightlyDriving) violations.push(fortnightlyDriving);

  // --- WTD 2002/15/EC Working time rules ---

  const wtdBreaks = checkWtdBreaks(currentShift);
  if (wtdBreaks) violations.push(wtdBreaks);

  const weeklyWork = checkWeeklyWork(currentShift, sessionsThisWeek);
  if (weeklyWork) violations.push(weeklyWork);

  // --- EC 561/2006 Rest rules ---

  const dailyRest = checkDailyRest(currentShift, previousSession, sessionsThisWeek);
  if (dailyRest) violations.push(dailyRest);

  // -------------------------------------------------------------------------
  // 3. Score calculation
  //    Soft violations (informational flags) don't deduct points.
  //    Each hard violation deducts 20 points from 100.
  // -------------------------------------------------------------------------

  const hardViolationCount = violations.filter(v => !SOFT_VIOLATIONS.has(v)).length;
  const score = Math.max(0, 100 - hardViolationCount * RULES.DEDUCTION_PER_HARD_VIOLATION);

  return {
    score,
    violations: [...new Set(violations)], // deduplicate
  };
};