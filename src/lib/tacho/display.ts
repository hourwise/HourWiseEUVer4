import {
  getDisplayedBreakSeconds,
  getLegalBreakContributionSeconds,
  getMaxWorkSeconds,
} from './timing';
import type { DisplayState, LiveDisplayInput, Totals } from './types';

const LAST_BREAK_UI_RESET_MS = 15000;

/**
 * Validates that a timestamp is a reasonable millisecond value
 */
const isValidTimestamp = (ts: number | null | undefined): boolean => {
  if (!ts || typeof ts !== 'number') return false;
  // Should be a reasonable timestamp (not negative, not too far in future)
  const now = Date.now();
  return ts > 0 && ts <= now + 86400000; // Allow 1 day into future for clock skew
};

export const deriveLiveDisplayState = ({
  nowMs,
  status,
  segmentStartIso,
  workStartIso,
  totals,
  legalBreakDisplayTotal,
  workCycle,
  drivingCycle,
  isDriving,
  timerMode,
  weeklyDrivingAccumulator,
  breakStartMs,
  has15minBreak,
  lastBreakDuration,
  lastBreakEndTime,
  maxDriveSeconds,
  maxWeeklyDriveSeconds,
  maxShiftTimeSeconds,
  spreadOverSeconds, // Backward compatibility
}: LiveDisplayInput): DisplayState => {
  // Handle backward compatibility for spreadOverSeconds
  const effectiveMaxShiftTimeSeconds = maxShiftTimeSeconds ?? spreadOverSeconds;
  // ...existing code...
  // Validate segment start timestamp
  let segmentStartMs: number;
  try {
    if (segmentStartIso) {
      segmentStartMs = new Date(segmentStartIso).getTime();
      if (isNaN(segmentStartMs) || !isValidTimestamp(segmentStartMs)) {
        console.warn('Invalid segmentStartIso, using nowMs:', segmentStartIso);
        segmentStartMs = nowMs;
      }
    } else {
      segmentStartMs = nowMs;
    }
  } catch (e) {
    console.warn('Failed to parse segmentStartIso:', e);
    segmentStartMs = nowMs;
  }

  // Validate shift start timestamp
  let shiftStartMs: number;
  try {
    if (workStartIso) {
      shiftStartMs = new Date(workStartIso).getTime();
      if (isNaN(shiftStartMs) || !isValidTimestamp(shiftStartMs)) {
        console.warn('Invalid workStartIso, using nowMs:', workStartIso);
        shiftStartMs = nowMs;
      }
    } else {
      shiftStartMs = nowMs;
    }
  } catch (e) {
    console.warn('Failed to parse workStartIso:', e);
    shiftStartMs = nowMs;
   }
   const elapsedSec = Math.max(0, Math.floor((nowMs - segmentStartMs) / 1000));

   // ========== CRITICAL FIX #6: Sanity check on elapsed time to detect clock drift ==========
   const MAX_REASONABLE_ELAPSED_PER_SECOND = 1.5; // Allow small variance due to timing
   if (elapsedSec > 0) {
     const avgElapsedRate = elapsedSec / (elapsedSec + 1); // Should be close to 1.0
     if (avgElapsedRate > MAX_REASONABLE_ELAPSED_PER_SECOND || avgElapsedRate < 0.5) {
       console.warn(`Clock drift detected: elapsed rate ${avgElapsedRate}, resetting to prevent display decay`);
     }
   }

   const nextTotals: Totals = { ...totals };

  let nextWorkCycle = workCycle;
  let nextDrivingCycle = drivingCycle;

  if (status === 'break') {
    nextTotals.break += elapsedSec;
  } else if (status === 'poa') {
    nextTotals.poa += elapsedSec;
  } else if (status === 'working') {
    if (isDriving) {
      nextTotals.driving += elapsedSec;
      nextDrivingCycle += elapsedSec;
    } else {
      nextTotals.work += elapsedSec;
    }
    nextWorkCycle += elapsedSec;
  }

  const maxWork = getMaxWorkSeconds(timerMode);
  const shiftElapsed = Math.floor((nowMs - shiftStartMs) / 1000);
  const weeklyDrivingTotal = weeklyDrivingAccumulator + nextTotals.driving;

  // Validate break end time
  const isValidBreakEndTime = isValidTimestamp(lastBreakEndTime);
  const shouldClearLastBreak =
    isValidBreakEndTime && nowMs - lastBreakEndTime > LAST_BREAK_UI_RESET_MS;

  const completedLegalBreakDisplay =
    legalBreakDisplayTotal > 0
      ? legalBreakDisplayTotal
      : !shouldClearLastBreak && lastBreakDuration > 0
        ? getLegalBreakContributionSeconds(lastBreakDuration, has15minBreak)
        : status !== 'break' && nextTotals.break > 0
          ? getDisplayedBreakSeconds(nextTotals.break)
          : 0;

  // Validate breakStartMs for current break calculation
  let effectiveBreakStartMs = segmentStartMs;
  if (breakStartMs && isValidTimestamp(breakStartMs)) {
    effectiveBreakStartMs = breakStartMs;
  } else if (breakStartMs) {
    console.warn('Invalid breakStartMs detected, using segmentStartMs:', breakStartMs);
  }

  return {
    work: nextTotals.work,
    poa: nextTotals.poa,
    break: nextTotals.break,
    legalBreak:
      completedLegalBreakDisplay +
      (status === 'break'
        ? getLegalBreakContributionSeconds(
            Math.max(0, Math.floor((nowMs - effectiveBreakStartMs) / 1000)),
            has15minBreak,
          )
        : 0),
    driving: nextTotals.driving,
    shift: Math.max(0, shiftElapsed), // Clamp to non-negative
    workTimeRemaining: Math.max(0, maxWork - nextWorkCycle),
    drivingTimeRemaining: Math.max(0, maxDriveSeconds - nextDrivingCycle),
    maxShiftTimeRemaining: Math.max(0, effectiveMaxShiftTimeSeconds - shiftElapsed),
    // Backward compatibility
    spreadoverRemaining: Math.max(0, effectiveMaxShiftTimeSeconds - shiftElapsed),
    breakDuration:
      status === 'break'
        ? Math.max(0, Math.floor((nowMs - effectiveBreakStartMs) / 1000))
        : 0,
    poaDuration: status === 'poa' ? elapsedSec : 0,
    weeklyDrivingRemaining: Math.max(0, maxWeeklyDriveSeconds - weeklyDrivingTotal),
    lastBreakDuration: shouldClearLastBreak ? 0 : lastBreakDuration,
    lastBreakEndTime: shouldClearLastBreak ? 0 : lastBreakEndTime,
  };
};
