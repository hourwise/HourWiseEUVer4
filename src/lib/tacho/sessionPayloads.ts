import type {
  SessionCheckpointPayloadInput,
  SessionCounterSnapshotInput,
  SessionOtherData,
  SessionStatusUpdatePayloadInput,
  WorkStatus,
} from './types';

const toMins = (seconds: number) => Math.floor(seconds / 60);
const toIso = (ts: number) => new Date(ts).toISOString();

export type SessionSyncReason = 'drive_stop' | 'status_change' | 'checkpoint';

export type SessionSyncPayloadInput = SessionCounterSnapshotInput & {
  reason: SessionSyncReason;
  status: WorkStatus;
  currentSegmentStart: string | null;
  currentPoaStart?: string | null;
  currentBreakStart?: string | null;
  breakStartMs?: number;
  nowMs?: number;
};

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

const buildCounterPayload = ({
  totals,
  legalBreakDisplayTotal,
  has15minBreak,
  workCycle,
  drivingCycle,
  timerMode,
  existingOtherData,
}: SessionCounterSnapshotInput) => ({
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
});

const deriveBreakStartIso = ({
  currentBreakStart,
  breakStartMs,
  currentSegmentStart,
  nowMs = Date.now(),
}: Pick<SessionSyncPayloadInput, 'currentBreakStart' | 'breakStartMs' | 'currentSegmentStart' | 'nowMs'>) => {
  if (currentBreakStart) return currentBreakStart;
  if (breakStartMs && breakStartMs > 0) return toIso(breakStartMs);
  if (currentSegmentStart) return toIso(new Date(currentSegmentStart).getTime());
  return toIso(nowMs);
};

export const buildSessionSyncPayload = ({
  reason,
  status,
  currentSegmentStart,
  currentPoaStart,
  currentBreakStart,
  breakStartMs,
  nowMs = Date.now(),
  ...counterState
}: SessionSyncPayloadInput) => {
  if (reason === 'drive_stop') {
    return {
      other_data: buildSessionOtherData(counterState),
    };
  }

  if (reason === 'status_change') {
    return {
      status,
      ...buildCounterPayload(counterState),
      current_break_start: status === 'break'
        ? deriveBreakStartIso({ currentBreakStart, breakStartMs, currentSegmentStart, nowMs })
        : null,
      current_poa_start: status === 'poa' ? (currentPoaStart ?? currentSegmentStart) : null,
    };
  }

  return {
    ...buildCounterPayload(counterState),
    current_break_start:
      status === 'break'
        ? deriveBreakStartIso({ currentBreakStart, breakStartMs, currentSegmentStart, nowMs })
        : null,
    current_poa_start: status === 'poa' ? (currentPoaStart ?? currentSegmentStart) : null,
  };
};

export const buildDriveStopUpdatePayload = ({
  totals,
  legalBreakDisplayTotal,
  has15minBreak,
  workCycle,
  drivingCycle,
  timerMode,
  existingOtherData,
  currentSegmentStart,
}: SessionCounterSnapshotInput & { currentSegmentStart: string | null }) =>
  buildSessionSyncPayload({
    reason: 'drive_stop',
    status: 'working',
    totals,
    legalBreakDisplayTotal,
    has15minBreak,
    workCycle,
    drivingCycle,
    timerMode,
    existingOtherData,
    currentSegmentStart,
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
}: SessionStatusUpdatePayloadInput) =>
  buildSessionSyncPayload({
    reason: 'status_change',
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
}: SessionCheckpointPayloadInput) =>
  buildSessionSyncPayload({
    reason: 'checkpoint',
    status,
    totals,
    legalBreakDisplayTotal,
    has15minBreak,
    workCycle,
    drivingCycle,
    timerMode,
    existingOtherData,
    currentSegmentStart,
    breakStartMs,
    currentPoaStart,
  });
