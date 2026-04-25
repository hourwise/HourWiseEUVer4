import { getDisplayedBreakSeconds, getMaxWorkSeconds } from './timing';
import type { DisplayState, LiveDisplayInput, Totals } from './types';

const LAST_BREAK_UI_RESET_MS = 180000;

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
  lastBreakDuration,
  lastBreakEndTime,
  maxDriveSeconds,
  maxWeeklyDriveSeconds,
  spreadOverSeconds,
}: LiveDisplayInput): DisplayState => {
  const segmentStartMs = segmentStartIso ? new Date(segmentStartIso).getTime() : nowMs;
  const shiftStartMs = workStartIso ? new Date(workStartIso).getTime() : nowMs;
  const elapsedSec = Math.max(0, Math.floor((nowMs - segmentStartMs) / 1000));
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
  const shouldClearLastBreak =
    lastBreakEndTime > 0 && nowMs - lastBreakEndTime > LAST_BREAK_UI_RESET_MS;
  const completedLegalBreakDisplay =
    legalBreakDisplayTotal > 0
      ? legalBreakDisplayTotal
      : !shouldClearLastBreak && lastBreakDuration > 0
        ? getDisplayedBreakSeconds(lastBreakDuration)
        : status !== 'break' && nextTotals.break > 0
          ? getDisplayedBreakSeconds(nextTotals.break)
          : 0;

  return {
    work: nextTotals.work,
    poa: nextTotals.poa,
    break: nextTotals.break,
    legalBreak:
      completedLegalBreakDisplay +
      (status === 'break'
        ? getDisplayedBreakSeconds(Math.max(0, Math.floor((nowMs - (breakStartMs || segmentStartMs)) / 1000)))
        : 0),
    driving: nextTotals.driving,
    shift: shiftElapsed,
    workTimeRemaining: maxWork - nextWorkCycle,
    drivingTimeRemaining: maxDriveSeconds - nextDrivingCycle,
    spreadoverRemaining: spreadOverSeconds - shiftElapsed,
    breakDuration:
      status === 'break'
        ? Math.max(0, Math.floor((nowMs - (breakStartMs || segmentStartMs)) / 1000))
        : 0,
    poaDuration: status === 'poa' ? elapsedSec : 0,
    weeklyDrivingRemaining: maxWeeklyDriveSeconds - weeklyDrivingTotal,
    lastBreakDuration: shouldClearLastBreak ? 0 : lastBreakDuration,
    lastBreakEndTime: shouldClearLastBreak ? 0 : lastBreakEndTime,
  };
};
