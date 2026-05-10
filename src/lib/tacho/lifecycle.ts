import { MAX_DRIVE, MAX_WEEKLY_DRIVE, MAX_SHIFT_TIME_13H } from './constants';
import { getMaxWorkSeconds } from './timing';
import type { DisplayState, ShiftLifecycleState } from './types';

export const createInitialDisplayState = (): DisplayState => ({
  work: 0,
  poa: 0,
  break: 0,
  legalBreak: 0,
  driving: 0,
  shift: 0,
  workTimeRemaining: getMaxWorkSeconds('6h'),
  drivingTimeRemaining: MAX_DRIVE,
  maxShiftTimeRemaining: MAX_SHIFT_TIME_13H,
  breakDuration: 0,
  poaDuration: 0,
  weeklyDrivingRemaining: MAX_WEEKLY_DRIVE,
  lastBreakDuration: 0,
  lastBreakEndTime: 0,
});

export const createStartedShiftState = (
  nowIso: string,
  nowMs: number,
  weeklyDrivingAccumulator: number,
): ShiftLifecycleState => ({
  status: 'working',
  sessionId: null,
  timerMode: '6h',
  workStartTime: nowIso,
  currentSegmentStart: nowIso,
  totals: { work: 0, poa: 0, break: 0, driving: 0 },
  legalBreakDisplayTotal: 0,
  workCycle: 0,
  drivingCycle: 0,
  breakTracker: { has15min: false },
  isDriving: false,
  breakStartMs: 0,
  weeklyDrivingAccumulator,
  lastTickMs: nowMs,
  display: createInitialDisplayState(),
  drivingScore: 0,
  stationarySinceMs: 0,
  lastSpeedKmh: 0,
  lastSpeedTs: 0,
  lastBreakDuration: 0,
  lastBreakEndTime: 0,
  prevWorkRemaining: getMaxWorkSeconds('6h'),
  prevDriveRemaining: MAX_DRIVE,
  prevWeeklyDriveRemaining: MAX_WEEKLY_DRIVE,
  prevMaxShiftTimeRemaining: MAX_SHIFT_TIME_13H,
});

export const createFailedStartRollbackState = (): Pick<
  ShiftLifecycleState,
  'status' | 'workStartTime' | 'currentSegmentStart' | 'sessionId'
> => ({
  status: 'idle',
  sessionId: null,
  workStartTime: null,
  currentSegmentStart: null,
});

export const createEndedShiftResetState = (nowMs: number): ShiftLifecycleState => ({
  status: 'idle',
  sessionId: null,
  timerMode: '6h',
  workStartTime: null,
  currentSegmentStart: null,
  totals: { work: 0, poa: 0, break: 0, driving: 0 },
  legalBreakDisplayTotal: 0,
  workCycle: 0,
  drivingCycle: 0,
  breakTracker: { has15min: false },
  isDriving: false,
  breakStartMs: 0,
  weeklyDrivingAccumulator: 0,
  lastTickMs: nowMs,
  display: createInitialDisplayState(),
  drivingScore: 0,
  stationarySinceMs: 0,
  lastSpeedKmh: 0,
  lastSpeedTs: 0,
  lastBreakDuration: 0,
  lastBreakEndTime: 0,
  prevWorkRemaining: getMaxWorkSeconds('6h'),
  prevDriveRemaining: MAX_DRIVE,
  prevWeeklyDriveRemaining: MAX_WEEKLY_DRIVE,
  prevMaxShiftTimeRemaining: MAX_SHIFT_TIME_13H,
});
