import { MAX_DAILY_DRIVE_EXTENDED, MAX_DRIVE, MAX_WEEKLY_DRIVE } from './constants';
import { deriveLiveDisplayState } from './display';
import type { DisplayState } from './types';
import type { TachoState } from './machine';

export const deriveDisplayFromTachoState = (
  state: TachoState,
  nowMs: number,
): DisplayState =>
  deriveLiveDisplayState({
    nowMs,
    status: state.status,
    segmentStartIso: state.currentSegmentStart,
    workStartIso: state.workStartTime,
    totals: state.totals,
    legalBreakDisplayTotal: state.legalBreakDisplayTotal,
    workCycle: state.workCycle,
    drivingCycle: state.drivingCycle,
    isDriving: state.isDriving,
    timerMode: state.timerMode,
    weeklyDrivingAccumulator: state.weeklyDrivingAccumulator,
    breakStartMs: state.breakStartMs,
    has15minBreak: state.has15minBreak,
    lastBreakDuration: state.lastBreakDuration,
    lastBreakEndTime: state.lastBreakEndTime,
    maxDriveSeconds: MAX_DRIVE,
    maxWeeklyDriveSeconds: MAX_WEEKLY_DRIVE,
    maxShiftTimeSeconds: state.maxShiftTimeSeconds,
  });

export const getDriveExtensionRemaining = (display: DisplayState): number =>
  MAX_DAILY_DRIVE_EXTENDED - display.driving;
