import { applyElapsedToCounters } from './timing';
import type { TachoState } from './machine';
import type { CounterState, WorkStatus } from './types';

const DEFAULT_MAX_CATCH_UP_SECONDS = 86400;
const DB_MINUTE_ROUNDING_TOLERANCE_SECONDS = 59;
const LOCAL_PROGRESS_WIN_MARGIN_SECONDS = 5;

export type CatchUpElapsedInput = {
  nowMs: number;
  status: WorkStatus;
  segmentStartIso: string | null;
  lastTickMs: number;
  isDriving: boolean;
  counterState: CounterState;
  maxCatchUpSeconds?: number;
};

export type CatchUpElapsedResult = {
  counterState: CounterState;
  appliedElapsedSec: number;
  referenceTickMs: number | null;
  nextSegmentStartIso: string | null;
  nextLastTickMs: number;
};

const parseTimestamp = (iso: string | null): number | null => {
  if (!iso) return null;
  const parsed = new Date(iso).getTime();
  return Number.isFinite(parsed) ? parsed : null;
};

export const isValidResumableTachoState = (
  state: TachoState | null | undefined,
  sessionId?: string | null,
  options: { workStartTime?: string | null } = {},
): state is TachoState => {
  if (!state || state.status === 'idle' || !state.sessionId) return false;
  if (sessionId && state.sessionId !== sessionId) return false;
  if (options.workStartTime && state.workStartTime !== options.workStartTime) return false;

  const segmentStartMs = parseTimestamp(state.currentSegmentStart);
  const workStartMs = parseTimestamp(state.workStartTime);
  if (segmentStartMs === null || segmentStartMs <= 0 || segmentStartMs > Date.now() + 86400000) {
    return false;
  }
  if (workStartMs !== null && segmentStartMs < workStartMs - 1000) {
    return false;
  }
  return true;
};

const getResumeProgressSeconds = (
  state: TachoState,
  nowMs: number = Date.now(),
): number => {
  const segmentStartMs = parseTimestamp(state.currentSegmentStart);
  const inFlightSeconds =
    state.status !== 'idle' && segmentStartMs !== null
      ? Math.max(0, Math.floor((nowMs - Math.max(segmentStartMs, state.lastTickMs)) / 1000))
      : 0;

  return (
    state.totals.work +
    state.totals.poa +
    state.totals.break +
    state.totals.driving +
    inFlightSeconds
  );
};

const chooseMostProgressedState = (
  states: TachoState[],
  nowMs: number,
): TachoState | null => {
  if (states.length === 0) return null;

  return states.reduce((best, candidate) =>
    getResumeProgressSeconds(candidate, nowMs) > getResumeProgressSeconds(best, nowMs)
      ? candidate
      : best
  );
};

const getStoredCounterProgressSeconds = (state: TachoState): number =>
  state.totals.work + state.totals.poa + state.totals.break + state.totals.driving;

const isMaterialProgressRegression = (
  candidate: TachoState,
  reference: TachoState,
  nowMs: number,
): boolean => {
  if (
    getResumeProgressSeconds(candidate, nowMs) + DB_MINUTE_ROUNDING_TOLERANCE_SECONDS <
    getResumeProgressSeconds(reference, nowMs)
  ) {
    return true;
  }

  if (
    getStoredCounterProgressSeconds(candidate) + DB_MINUTE_ROUNDING_TOLERANCE_SECONDS <
    getStoredCounterProgressSeconds(reference)
  ) {
    return true;
  }

  return (
    candidate.totals.work + DB_MINUTE_ROUNDING_TOLERANCE_SECONDS < reference.totals.work ||
    candidate.totals.poa + DB_MINUTE_ROUNDING_TOLERANCE_SECONDS < reference.totals.poa ||
    candidate.totals.break + DB_MINUTE_ROUNDING_TOLERANCE_SECONDS < reference.totals.break ||
    candidate.workCycle + DB_MINUTE_ROUNDING_TOLERANCE_SECONDS < reference.workCycle
  );
};

export const chooseResumeRehydrationState = ({
  dbState,
  currentRuntimeState,
  persistedRuntimeState,
  sessionId,
  nowMs = Date.now(),
}: {
  dbState: TachoState;
  currentRuntimeState: TachoState | null;
  persistedRuntimeState: TachoState | null;
  sessionId: string;
  nowMs?: number;
}): TachoState => {
  const resumeOptions = { workStartTime: dbState.workStartTime };
  const validRuntimeStates = [currentRuntimeState, persistedRuntimeState].filter(
    (state): state is TachoState => isValidResumableTachoState(state, sessionId, resumeOptions),
  );

  if (isValidResumableTachoState(dbState, sessionId, resumeOptions)) {
    const sameStatusRuntimeState = chooseMostProgressedState(
      validRuntimeStates.filter(
        state =>
          state.status === dbState.status &&
          !isMaterialProgressRegression(state, dbState, nowMs),
      ),
      nowMs,
    );
    return sameStatusRuntimeState &&
      getResumeProgressSeconds(sameStatusRuntimeState, nowMs) >
        getResumeProgressSeconds(dbState, nowMs) + LOCAL_PROGRESS_WIN_MARGIN_SECONDS
      ? sameStatusRuntimeState
      : dbState;
  }

  const fallbackState = chooseMostProgressedState(validRuntimeStates, nowMs);
  if (fallbackState) {
    return fallbackState;
  }
  return dbState;
};

export const applyCatchUpElapsed = ({
  nowMs,
  status,
  segmentStartIso,
  lastTickMs,
  isDriving,
  counterState,
  maxCatchUpSeconds = DEFAULT_MAX_CATCH_UP_SECONDS,
}: CatchUpElapsedInput): CatchUpElapsedResult => {
  const segmentStartMs = parseTimestamp(segmentStartIso);
  if (status === 'idle' || segmentStartMs === null) {
    return {
      counterState,
      appliedElapsedSec: 0,
      referenceTickMs: null,
      nextSegmentStartIso: segmentStartIso,
      nextLastTickMs: nowMs,
    };
  }

  const referenceTickMs = Math.max(segmentStartMs, lastTickMs);
  const appliedElapsedSec = Math.max(0, Math.floor((nowMs - referenceTickMs) / 1000));
  const shouldApply = appliedElapsedSec > 0 && appliedElapsedSec < maxCatchUpSeconds;
  const nextCheckpointMs = shouldApply
    ? referenceTickMs + appliedElapsedSec * 1000
    : appliedElapsedSec > 0
      ? nowMs
      : referenceTickMs;

  return {
    counterState: shouldApply
      ? applyElapsedToCounters(counterState, appliedElapsedSec, status, isDriving)
      : counterState,
    appliedElapsedSec: shouldApply ? appliedElapsedSec : 0,
    referenceTickMs,
    nextSegmentStartIso: new Date(nextCheckpointMs).toISOString(),
    nextLastTickMs: nextCheckpointMs,
  };
};
