import type {
  SessionCheckpointPayloadInput,
  SessionCounterSnapshotInput,
  SessionOtherData,
  SessionStatusUpdatePayloadInput,
} from './types';

const toMins = (seconds: number) => Math.floor(seconds / 60);

export const buildSessionOtherData = ({
  totals,
  legalBreakDisplayTotal,
  has15minBreak,
  workCycle,
  drivingCycle,
  timerMode,
  existingOtherData,
}: SessionCounterSnapshotInput): SessionOtherData => ({
  ...(existingOtherData || {}),
  driving: toMins(totals.driving),
  legalBreakDisplay: toMins(legalBreakDisplayTotal),
  has15minBreak,
  workCycle: toMins(workCycle),
  drivingCycle: toMins(drivingCycle),
  timerMode,
});

export const buildDriveStopUpdatePayload = ({
  totals,
  legalBreakDisplayTotal,
  has15minBreak,
  workCycle,
  drivingCycle,
  timerMode,
  existingOtherData,
  currentSegmentStart,
}: SessionCounterSnapshotInput & { currentSegmentStart: string | null }) => ({
  other_data: buildSessionOtherData({
    totals,
    legalBreakDisplayTotal,
    has15minBreak,
    workCycle,
    drivingCycle,
    timerMode,
    existingOtherData,
  }),
  current_segment_start: currentSegmentStart,
});

export const buildStatusUpdatePayload = ({
  status,
  totals,
  legalBreakDisplayTotal,
  has15minBreak,
  workCycle,
  drivingCycle,
  timerMode,
  existingOtherData,
  currentSegmentStart,
  currentBreakStart,
  currentPoaStart,
}: SessionStatusUpdatePayloadInput) => ({
  status,
  total_work_minutes: toMins(totals.work),
  total_break_minutes: toMins(totals.break),
  total_poa_minutes: toMins(totals.poa),
  other_data: buildSessionOtherData({
    totals,
    legalBreakDisplayTotal,
    has15minBreak,
    workCycle,
    drivingCycle,
    timerMode,
    existingOtherData,
  }),
  current_break_start: currentBreakStart,
  current_poa_start: currentPoaStart,
  current_segment_start: currentSegmentStart,
});

export const buildPeriodicCheckpointPayload = ({
  totals,
  legalBreakDisplayTotal,
  has15minBreak,
  workCycle,
  drivingCycle,
  timerMode,
  existingOtherData,
  currentSegmentStart,
  status,
  breakStartMs,
  currentPoaStart,
}: SessionCheckpointPayloadInput) => ({
  total_work_minutes: toMins(totals.work),
  total_break_minutes: toMins(totals.break),
  total_poa_minutes: toMins(totals.poa),
  other_data: buildSessionOtherData({
    totals,
    legalBreakDisplayTotal,
    has15minBreak,
    workCycle,
    drivingCycle,
    timerMode,
    existingOtherData,
  }),
  current_segment_start: currentSegmentStart,
  current_break_start:
    status === 'break'
      ? new Date(breakStartMs || new Date(currentSegmentStart || Date.now()).getTime()).toISOString()
      : null,
  current_poa_start: status === 'poa' ? currentPoaStart : null,
});
