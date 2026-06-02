import { applyElapsedToCounters } from './timing';
import type { CounterState, WorkStatus } from './types';

const DEFAULT_MAX_CATCH_UP_SECONDS = 86400;

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
