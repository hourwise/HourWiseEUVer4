import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createTachoStateFromPersisted,
  createTachoStateFromSessionRow,
  createTachoStateFromSnapshot,
  toPersistedTachoState,
} from '../machine';

test('createTachoStateFromPersisted maps persisted timer state into canonical machine state', () => {
  const machineState = createTachoStateFromPersisted({
    status: 'working',
    sessionId: 'session-1',
    timerMode: '9h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T09:00:00.000Z',
    totals: { work: 1200, poa: 0, break: 300, driving: 1800 },
    legalBreakDisplayTotal: 900,
    workCycleTotal: 3000,
    drivingCycleTotal: 1800,
    breakTracker: { has15min: true },
    isDriving: true,
    lastTickMs: 1000,
    weeklyDrivingAccumulator: 7200,
    shiftExtensionsUsedThisWeek: 1,
    maxShiftTimeSeconds: 15 * 3600,
    dailyRestSecondsBeforeShift: 11 * 3600,
    reducedDailyRestTaken: false,
    breakStartMs: 0,
  });

  assert.equal(machineState.timerMode, '9h');
  assert.equal(machineState.has15minBreak, true);
  assert.equal(machineState.drivingCycle, 1800);
  assert.equal(machineState.maxShiftTimeSeconds, 15 * 3600);
  assert.equal(machineState.motion.lastSpeedKmh, 0);
});

test('createTachoStateFromSnapshot preserves runtime fields and round-trips to persisted state', () => {
  const machineState = createTachoStateFromSnapshot({
    status: 'poa',
    sessionId: 'session-2',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T10:00:00.000Z',
    totals: { work: 1000, poa: 200, break: 100, driving: 300 },
    legalBreakDisplayTotal: 100,
    workCycle: 1300,
    drivingCycle: 300,
    has15minBreak: false,
    isDriving: false,
    breakStartMs: 0,
    weeklyDrivingAccumulator: 4000,
    shiftExtensionsUsedThisWeek: 0,
    maxShiftTimeSeconds: 13 * 3600,
    dailyRestSecondsBeforeShift: 10 * 3600,
    reducedDailyRestTaken: true,
    lastTickMs: 5000,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
    motion: {
      lastSpeedKmh: 12,
      drivingScore: 3,
    },
  });

  const persistedState = toPersistedTachoState(machineState, 'timerState_user-1');

  assert.equal(machineState.motion.lastSpeedKmh, 12);
  assert.equal(machineState.motion.drivingScore, 3);
  assert.equal(persistedState.userStorageKey, 'timerState_user-1');
  assert.equal(persistedState.breakTracker.has15min, false);
  assert.equal(persistedState.drivingCycleTotal, 300);
  assert.equal(persistedState.motionState?.lastSpeedKmh, 12);
  assert.equal(persistedState.alertWindow?.prevRemaining.work, machineState.alerts.prevRemaining.work);
});

test('createTachoStateFromPersisted preserves pending motion transition metadata', () => {
  const pendingStartedAtMs = Date.UTC(2026, 5, 12, 9, 30, 0);
  const machineState = createTachoStateFromPersisted({
    status: 'working',
    sessionId: 'session-motion',
    timerMode: '6h',
    workStartTime: '2026-06-12T08:00:00.000Z',
    currentSegmentStart: '2026-06-12T09:00:00.000Z',
    totals: { work: 3600, poa: 0, break: 0, driving: 1200 },
    workCycleTotal: 3600,
    drivingCycleTotal: 1200,
    breakTracker: { has15min: false },
    isDriving: true,
    lastTickMs: pendingStartedAtMs,
    weeklyDrivingAccumulator: 0,
    motionState: {
      lastSpeedKmh: 3,
      lastSpeedTs: pendingStartedAtMs,
      lastLocationTs: pendingStartedAtMs,
      lastAccuracyM: 18,
      drivingScore: 8,
      movingSinceMs: 0,
      stationarySinceMs: pendingStartedAtMs,
      pendingTransitionType: 'stationary',
      pendingTransitionStartedAtMs: pendingStartedAtMs,
    },
  });

  assert.equal(machineState.motion.pendingTransitionType, 'stationary');
  assert.equal(machineState.motion.pendingTransitionStartedAtMs, pendingStartedAtMs);
  assert.equal(machineState.motion.lastLocationTs, pendingStartedAtMs);
  assert.equal(machineState.motion.lastAccuracyM, 18);
});

test('createTachoStateFromSessionRow maps database session fields while preserving runtime-only state', () => {
  const fallbackState = createTachoStateFromSnapshot({
    status: 'working',
    sessionId: 'local-session',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T09:00:00.000Z',
    totals: { work: 600, poa: 60, break: 120, driving: 180 },
    legalBreakDisplayTotal: 120,
    workCycle: 780,
    drivingCycle: 180,
    has15minBreak: false,
    isDriving: true,
    breakStartMs: 0,
    weeklyDrivingAccumulator: 8000,
    shiftExtensionsUsedThisWeek: 1,
    maxShiftTimeSeconds: 15 * 3600,
    dailyRestSecondsBeforeShift: 9 * 3600,
    reducedDailyRestTaken: true,
    lastTickMs: 1234,
    lastBreakDuration: 45,
    lastBreakEndTime: 1000,
    motion: {
      lastSpeedKmh: 44,
      lastSpeedTs: 5678,
      drivingScore: 4,
      movingSinceMs: 100,
      stationarySinceMs: 0,
    },
  });

  const machineState = createTachoStateFromSessionRow({
    id: 'db-session',
    user_id: 'user-1',
    date: '2026-05-14',
    start_time: '2026-05-14T08:15:00.000Z',
    end_time: null,
    total_work_minutes: 30,
    total_break_minutes: 15,
    total_poa_minutes: 10,
    status: 'break',
    timezone: 'Europe/London',
    created_at: '2026-05-14T08:15:00.000Z',
    updated_at: null,
    compliance_score: null,
    compliance_violations: null,
    current_break_start: '2026-05-14T09:30:00.000Z',
    current_poa_start: null,
    drop_count: null,
    empty_miles: null,
    end_lat: null,
    end_lng: null,
    is_manual_entry: null,
    job_reference: null,
    loaded_miles: null,
    notes: null,
    other_data: {
      driving: 25,
      legalBreakDisplay: 10,
      has15minBreak: true,
      workCycle: 40,
      drivingCycle: 25,
      timerMode: '9h',
      dailyRestSecondsBeforeShift: 39600,
      reducedDailyRestTaken: false,
    },
    start_lat: null,
    start_lng: null,
    client_id: null,
    waiting_minutes: null,
  }, fallbackState);

  assert.equal(machineState.sessionId, 'db-session');
  assert.equal(machineState.status, 'break');
  assert.equal(machineState.timerMode, '9h');
  assert.deepEqual(machineState.totals, { work: 1800, poa: 600, break: 900, driving: 1500 });
  assert.equal(machineState.workCycle, 2400);
  assert.equal(machineState.drivingCycle, 1500);
  assert.equal(machineState.legalBreakDisplayTotal, 600);
  assert.equal(machineState.isDriving, false);
  assert.equal(machineState.weeklyDrivingAccumulator, fallbackState.weeklyDrivingAccumulator);
  assert.equal(machineState.motion.lastSpeedKmh, fallbackState.motion.lastSpeedKmh);
  assert.equal(machineState.alerts.prevRemaining.work, fallbackState.alerts.prevRemaining.work);
});

test('createTachoStateFromSessionRow restores working segment checkpoint from other_data', () => {
  const fallbackState = createTachoStateFromSnapshot({
    status: 'working',
    sessionId: 'local-session-2',
    timerMode: '6h',
    workStartTime: '2026-06-08T07:00:00.000Z',
    currentSegmentStart: '2026-06-08T08:00:00.000Z',
    totals: { work: 3600, poa: 0, break: 2940, driving: 1200 },
    legalBreakDisplayTotal: 2940,
    workCycle: 0,
    drivingCycle: 0,
    has15minBreak: false,
    isDriving: false,
    breakStartMs: 0,
    weeklyDrivingAccumulator: 0,
    shiftExtensionsUsedThisWeek: 0,
    maxShiftTimeSeconds: 13 * 3600,
    dailyRestSecondsBeforeShift: 0,
    reducedDailyRestTaken: false,
    lastTickMs: 1,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
  });

  const machineState = createTachoStateFromSessionRow({
    id: 'db-session-2',
    user_id: 'user-2',
    date: '2026-06-08',
    start_time: '2026-06-08T07:00:00.000Z',
    end_time: null,
    total_work_minutes: 60,
    total_break_minutes: 49,
    total_poa_minutes: 0,
    status: 'working',
    timezone: 'Europe/London',
    created_at: '2026-06-08T07:00:00.000Z',
    updated_at: null,
    compliance_score: null,
    compliance_violations: null,
    current_break_start: null,
    current_poa_start: null,
    drop_count: null,
    empty_miles: null,
    end_lat: null,
    end_lng: null,
    is_manual_entry: null,
    job_reference: null,
    loaded_miles: null,
    notes: null,
    other_data: {
      driving: 20,
      legalBreakDisplay: 49,
      has15minBreak: false,
      workCycle: 0,
      drivingCycle: 0,
      currentSegmentStart: '2026-06-08T08:19:00.000Z',
      isDriving: true,
      timerMode: '6h',
    },
    start_lat: null,
    start_lng: null,
    client_id: null,
    waiting_minutes: null,
  }, fallbackState);

  assert.equal(machineState.currentSegmentStart, '2026-06-08T08:19:00.000Z');
  assert.equal(machineState.isDriving, true);
  assert.equal(machineState.totals.break, 49 * 60);
});
