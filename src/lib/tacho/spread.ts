import {
  MAX_SHIFT_EXTENSIONS_PER_WEEK,
  MAX_SHIFT_TIME_13H,
  MAX_SHIFT_TIME_15H,
  MIN_DAILY_REST_REDUCED,
  MIN_DAILY_REST_REGULAR,
} from './constants';

export type SpreadSessionLike = {
  start_time?: string | null;
  end_time?: string | null;
  other_data?: Record<string, any> | null;
};

export const getWeekStartLocal = (date: Date): Date => {
  const d = new Date(date);
  const day = d.getDay();
  d.setDate(d.getDate() + (day === 0 ? -6 : 1 - day));
  d.setHours(0, 0, 0, 0);
  return d;
};

const isValidDate = (value?: string | null): value is string => {
  if (!value) return false;
  const ts = new Date(value).getTime();
  return !Number.isNaN(ts);
};

export const getShiftDurationSeconds = (
  startIso?: string | null,
  endIsoOrMs?: string | number | null,
): number => {
  if (!isValidDate(startIso)) return 0;
  const startMs = new Date(startIso).getTime();
  const endMs =
    typeof endIsoOrMs === 'number'
      ? endIsoOrMs
      : isValidDate(endIsoOrMs)
        ? new Date(endIsoOrMs).getTime()
        : Date.now();

  return Math.max(0, Math.floor((endMs - startMs) / 1000));
};

export const usedShiftExtension = (shiftDurationSeconds: number): boolean =>
  shiftDurationSeconds > MAX_SHIFT_TIME_13H;

export const exceededShiftSpreadLimit = (shiftDurationSeconds: number): boolean =>
  shiftDurationSeconds > MAX_SHIFT_TIME_15H;

export const getShiftExtensionAllowanceState = (
  sessions: SpreadSessionLike[],
  forDate: Date,
) => {
  const weekStart = getWeekStartLocal(forDate).getTime();
  const weekEnd = weekStart + 7 * 24 * 3600 * 1000;

  const used = sessions.filter(session => {
    if (!isValidDate(session.start_time)) return false;
    const startMs = new Date(session.start_time).getTime();
    if (startMs < weekStart || startMs >= weekEnd) return false;

    if (typeof session.other_data?.usedShiftExtension === 'boolean') {
      return session.other_data.usedShiftExtension;
    }

    return usedShiftExtension(getShiftDurationSeconds(session.start_time, session.end_time));
  }).length;

  const remaining = Math.max(0, MAX_SHIFT_EXTENSIONS_PER_WEEK - used);

  return {
    used,
    remaining,
    hasRemaining: remaining > 0,
    maxShiftTimeSeconds: remaining > 0 ? MAX_SHIFT_TIME_15H : MAX_SHIFT_TIME_13H,
  };
};

export const getRestSecondsBetweenShifts = (
  previousEndIso?: string | null,
  currentStartIso?: string | null,
): number => {
  if (!isValidDate(previousEndIso) || !isValidDate(currentStartIso)) return 0;
  return Math.max(
    0,
    Math.floor((new Date(currentStartIso).getTime() - new Date(previousEndIso).getTime()) / 1000),
  );
};

export const isReducedDailyRest = (restSeconds: number): boolean =>
  restSeconds >= MIN_DAILY_REST_REDUCED && restSeconds < MIN_DAILY_REST_REGULAR;

export const countReducedDailyRestsThisWeek = (
  sessions: SpreadSessionLike[],
  forDate: Date,
): number => {
  const weekStart = getWeekStartLocal(forDate).getTime();
  const weekEnd = weekStart + 7 * 24 * 3600 * 1000;
  const sorted = [...sessions]
    .filter(session => isValidDate(session.start_time))
    .sort(
      (a, b) =>
        new Date(a.start_time as string).getTime() - new Date(b.start_time as string).getTime(),
    );

  let count = 0;

  for (let i = 0; i < sorted.length; i++) {
    const session = sorted[i];
    const startMs = new Date(session.start_time as string).getTime();
    if (startMs < weekStart || startMs >= weekEnd) continue;

    if (typeof session.other_data?.reducedDailyRestTaken === 'boolean') {
      if (session.other_data.reducedDailyRestTaken) count++;
      continue;
    }

    const previous = sorted[i - 1];
    if (!previous?.end_time) continue;

    const restSeconds = getRestSecondsBetweenShifts(previous.end_time, session.start_time);
    if (isReducedDailyRest(restSeconds)) count++;
  }

  return count;
};

export const getDailyRestWarningLevel = (
  restSeconds: number,
  reducedRestsUsedThisWeek: number,
): 'none' | 'reduced' | 'insufficient' => {
  if (restSeconds < MIN_DAILY_REST_REDUCED) return 'insufficient';
  if (restSeconds < MIN_DAILY_REST_REGULAR) {
    return reducedRestsUsedThisWeek >= MAX_SHIFT_EXTENSIONS_PER_WEEK ? 'insufficient' : 'reduced';
  }
  return 'none';
};
