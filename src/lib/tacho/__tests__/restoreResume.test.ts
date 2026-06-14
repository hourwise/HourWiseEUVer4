import test from 'node:test';
import assert from 'node:assert/strict';

import { createInitialMotionState, type TachoState } from '../machine';
import { applyCatchUpElapsed, chooseResumeRehydrationState } from '../rehydration';

test('applyCatchUpElapsed uses the later of segment start and last tick to avoid double counting', () => {
  const segmentStartMs = Date.UTC(2026, 4, 14, 10, 0, 0);
  const lastTickMs = segmentStartMs + 30 * 1000;
  const nowMs = segmentStartMs + 90 * 1000;

  const result = applyCatchUpElapsed({
    nowMs,
    status: 'working',
    segmentStartIso: new Date(segmentStartMs).toISOString(),
    lastTickMs,
    isDriving: true,
    counterState: {
      totals: { work: 0, poa: 0, break: 0, driving: 120 },
      workCycle: 120,
      drivingCycle: 120,
    },
  });

  assert.equal(result.referenceTickMs, lastTickMs);
  assert.equal(result.appliedElapsedSec, 60);
  assert.equal(result.counterState.totals.driving, 180);
  assert.equal(result.counterState.workCycle, 180);
  assert.equal(result.counterState.drivingCycle, 180);
});

test('applyCatchUpElapsed ignores abnormal catch-up windows greater than one day', () => {
  const segmentStartMs = Date.UTC(2026, 4, 12, 10, 0, 0);
  const nowMs = segmentStartMs + 2 * 86400 * 1000;
  const initialCounterState = {
    totals: { work: 120, poa: 0, break: 0, driving: 0 },
    workCycle: 120,
    drivingCycle: 0,
  };

  const result = applyCatchUpElapsed({
    nowMs,
    status: 'working',
    segmentStartIso: new Date(segmentStartMs).toISOString(),
    lastTickMs: segmentStartMs,
    isDriving: false,
    counterState: initialCounterState,
  });

  assert.equal(result.appliedElapsedSec, 0);
  assert.deepEqual(result.counterState, initialCounterState);
  assert.equal(result.nextSegmentStartIso, new Date(nowMs).toISOString());
});

test('applyCatchUpElapsed preserves leftover milliseconds across delayed ticks', () => {
  const segmentStartMs = Date.UTC(2026, 4, 14, 10, 0, 0);
  let result = applyCatchUpElapsed({
    nowMs: segmentStartMs + 1050,
    status: 'working',
    segmentStartIso: new Date(segmentStartMs).toISOString(),
    lastTickMs: segmentStartMs,
    isDriving: false,
    counterState: {
      totals: { work: 0, poa: 0, break: 0, driving: 0 },
      workCycle: 0,
      drivingCycle: 0,
    },
  });

  assert.equal(result.appliedElapsedSec, 1);
  assert.equal(result.nextLastTickMs, segmentStartMs + 1000);

  result = applyCatchUpElapsed({
    nowMs: segmentStartMs + 2100,
    status: 'working',
    segmentStartIso: result.nextSegmentStartIso,
    lastTickMs: result.nextLastTickMs,
    isDriving: false,
    counterState: result.counterState,
  });

  assert.equal(result.appliedElapsedSec, 1);
  assert.equal(result.nextLastTickMs, segmentStartMs + 2000);
  assert.equal(result.counterState.totals.work, 2);
  assert.equal(result.counterState.workCycle, 2);
});

const makeTachoState = (overrides: Partial<TachoState> = {}): TachoState => ({
  status: 'working',
  sessionId: 'session-1',
  timerMode: '6h',
  workStartTime: '2026-06-10T08:00:00.000Z',
  currentSegmentStart: '2026-06-10T08:30:00.000Z',
  totals: { work: 1800, poa: 0, break: 0, driving: 0 },
  legalBreakDisplayTotal: 0,
  workCycle: 1800,
  drivingCycle: 0,
  has15minBreak: false,
  isDriving: false,
  breakStartMs: 0,
  weeklyDrivingAccumulator: 0,
  shiftExtensionsUsedThisWeek: 0,
  maxShiftTimeSeconds: 46800,
  dailyRestSecondsBeforeShift: 0,
  reducedDailyRestTaken: false,
  lastTickMs: Date.UTC(2026, 5, 10, 8, 30, 0),
  lastBreakDuration: 0,
  lastBreakEndTime: 0,
  motion: {
    ...createInitialMotionState(),
    lastSpeedKmh: 0,
    lastSpeedTs: 0,
    drivingScore: 0,
    movingSinceMs: 0,
    stationarySinceMs: 0,
  },
  alerts: {
    prevShiftElapsed: 1800,
    prevRemaining: {
      work: 19800,
      drive: 16200,
      driveExtension: 19800,
      weeklyDrive: 201600,
      maxShiftTime: 45000,
    },
  },
  ...overrides,
});

test('chooseResumeRehydrationState prefers the DB state over stale runtime state', () => {
  const dbState = makeTachoState({
    status: 'break',
    currentSegmentStart: '2026-06-10T09:00:00.000Z',
    breakStartMs: Date.UTC(2026, 5, 10, 9, 0, 0),
  });
  const currentRuntimeState = makeTachoState({
    status: 'working',
    currentSegmentStart: '2026-06-10T08:45:00.000Z',
  });
  const persistedRuntimeState = makeTachoState({
    status: 'working',
    currentSegmentStart: '2026-06-10T08:50:00.000Z',
  });

  const selected = chooseResumeRehydrationState({
    dbState,
    currentRuntimeState,
    persistedRuntimeState,
    sessionId: 'session-1',
  });

  assert.equal(selected, dbState);
  assert.equal(selected.status, 'break');
});

test('chooseResumeRehydrationState keeps newer local progress when DB status matches', () => {
  const nowMs = Date.UTC(2026, 5, 10, 8, 20, 0);
  const dbState = makeTachoState({
    status: 'working',
    currentSegmentStart: '2026-06-10T08:05:00.000Z',
    totals: { work: 300, poa: 0, break: 0, driving: 0 },
    workCycle: 300,
    lastTickMs: nowMs,
  });
  const currentRuntimeState = makeTachoState({
    status: 'working',
    currentSegmentStart: '2026-06-10T08:20:00.000Z',
    totals: { work: 1200, poa: 0, break: 0, driving: 0 },
    workCycle: 1200,
    lastTickMs: nowMs,
  });

  const selected = chooseResumeRehydrationState({
    dbState,
    currentRuntimeState,
    persistedRuntimeState: null,
    sessionId: 'session-1',
    nowMs,
  });

  assert.equal(selected, currentRuntimeState);
  assert.equal(selected.totals.work, 1200);
});

test('chooseResumeRehydrationState falls back to persisted state when DB state is unusable', () => {
  const dbState = makeTachoState({
    currentSegmentStart: null,
  });
  const persistedRuntimeState = makeTachoState({
    status: 'poa',
    currentSegmentStart: '2026-06-10T09:15:00.000Z',
  });

  const selected = chooseResumeRehydrationState({
    dbState,
    currentRuntimeState: null,
    persistedRuntimeState,
    sessionId: 'session-1',
  });

  assert.equal(selected, persistedRuntimeState);
  assert.equal(selected.status, 'poa');
});

test('chooseResumeRehydrationState rejects same-status local state that regresses DB totals', () => {
  const nowMs = Date.UTC(2026, 5, 10, 8, 30, 0);
  const dbState = makeTachoState({
    status: 'working',
    currentSegmentStart: '2026-06-10T08:25:00.000Z',
    totals: { work: 1200, poa: 0, break: 0, driving: 0 },
    workCycle: 1200,
    lastTickMs: Date.UTC(2026, 5, 10, 8, 25, 0),
  });
  const staleRuntimeState = makeTachoState({
    status: 'working',
    currentSegmentStart: '2026-06-10T08:05:00.000Z',
    totals: { work: 300, poa: 0, break: 0, driving: 0 },
    workCycle: 300,
    lastTickMs: Date.UTC(2026, 5, 10, 8, 5, 0),
  });

  const selected = chooseResumeRehydrationState({
    dbState,
    currentRuntimeState: staleRuntimeState,
    persistedRuntimeState: null,
    sessionId: 'session-1',
    nowMs,
  });

  assert.equal(selected, dbState);
  assert.equal(selected.totals.work, 1200);
});

test('chooseResumeRehydrationState rejects local state from the wrong shift start', () => {
  const dbState = makeTachoState({
    workStartTime: '2026-06-10T08:00:00.000Z',
    currentSegmentStart: '2026-06-10T08:10:00.000Z',
    totals: { work: 600, poa: 0, break: 0, driving: 0 },
    workCycle: 600,
  });
  const previousShiftState = makeTachoState({
    workStartTime: '2026-06-09T08:00:00.000Z',
    currentSegmentStart: '2026-06-10T09:30:00.000Z',
    totals: { work: 5400, poa: 0, break: 0, driving: 0 },
    workCycle: 5400,
  });

  const selected = chooseResumeRehydrationState({
    dbState,
    currentRuntimeState: previousShiftState,
    persistedRuntimeState: null,
    sessionId: 'session-1',
    nowMs: Date.UTC(2026, 5, 10, 8, 30, 0),
  });

  assert.equal(selected, dbState);
  assert.equal(selected.workStartTime, '2026-06-10T08:00:00.000Z');
});

test('chooseResumeRehydrationState allows local progress ahead of a rounded DB checkpoint', () => {
  const nowMs = Date.UTC(2026, 5, 10, 8, 15, 30);
  const dbState = makeTachoState({
    status: 'working',
    currentSegmentStart: '2026-06-10T08:15:00.000Z',
    totals: { work: 900, poa: 0, break: 0, driving: 0 },
    workCycle: 900,
    lastTickMs: Date.UTC(2026, 5, 10, 8, 15, 0),
  });
  const localState = makeTachoState({
    status: 'working',
    currentSegmentStart: '2026-06-10T08:15:30.000Z',
    totals: { work: 960, poa: 0, break: 0, driving: 0 },
    workCycle: 960,
    lastTickMs: Date.UTC(2026, 5, 10, 8, 15, 30),
  });

  const selected = chooseResumeRehydrationState({
    dbState,
    currentRuntimeState: localState,
    persistedRuntimeState: null,
    sessionId: 'session-1',
    nowMs,
  });

  assert.equal(selected, localState);
});
