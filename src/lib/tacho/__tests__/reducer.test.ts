import test from 'node:test';
import assert from 'node:assert/strict';

import { createTachoStateFromSnapshot } from '../machine';
import { reduceTachoEvent } from '../reducer';

test('TIMER_TICK applies elapsed time and emits persist command', () => {
  const state = createTachoStateFromSnapshot({
    status: 'working',
    sessionId: 's1',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T08:00:00.000Z',
    totals: { work: 0, poa: 0, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
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
    lastTickMs: Date.UTC(2026, 4, 14, 8, 0, 0),
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
  });

  const result = reduceTachoEvent(state, {
    type: 'TIMER_TICK',
    nowMs: Date.UTC(2026, 4, 14, 8, 1, 0),
  });

  assert.equal(result.state.totals.work, 60);
  assert.equal(result.state.workCycle, 60);
  assert.ok(result.commands.some(command => command.type === 'persist'));
});

test('STATUS_CHANGE_REQUESTED enters break, persists, syncs, and cancels active alerts', () => {
  const state = createTachoStateFromSnapshot({
    status: 'working',
    sessionId: 's2',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T09:00:00.000Z',
    totals: { work: 0, poa: 0, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
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
    lastTickMs: Date.UTC(2026, 4, 14, 9, 0, 0),
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
  });

  const result = reduceTachoEvent(state, {
    type: 'STATUS_CHANGE_REQUESTED',
    nowMs: Date.UTC(2026, 4, 14, 9, 10, 0),
    nextStatus: 'break',
  });

  assert.equal(result.state.status, 'break');
  assert.equal(result.state.breakStartMs, Date.UTC(2026, 4, 14, 9, 10, 0));
  assert.ok(result.commands.some(command => command.type === 'persist'));
  assert.ok(result.commands.some(command => command.type === 'sync_session' && command.reason === 'status_change'));
  assert.ok(result.commands.some(command => command.type === 'cancel_alerts' && command.target === 'all'));
  assert.ok(result.commands.some(command => command.type === 'speak_alert' && command.speechKey === 'audioBreakStarted'));
});

test('STATUS_CHANGE_REQUESTED resumes from break as non-driving work', () => {
  const breakStartMs = Date.UTC(2026, 4, 14, 9, 0, 0);
  const state = createTachoStateFromSnapshot({
    status: 'break',
    sessionId: 's-break-resume',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: new Date(breakStartMs).toISOString(),
    totals: { work: 3600, poa: 0, break: 0, driving: 1200 },
    legalBreakDisplayTotal: 0,
    workCycle: 3600,
    drivingCycle: 1200,
    has15minBreak: false,
    isDriving: true,
    breakStartMs,
    weeklyDrivingAccumulator: 0,
    shiftExtensionsUsedThisWeek: 0,
    maxShiftTimeSeconds: 13 * 3600,
    dailyRestSecondsBeforeShift: 0,
    reducedDailyRestTaken: false,
    lastTickMs: breakStartMs,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
    motion: {
      pendingTransitionType: 'moving',
      pendingTransitionStartedAtMs: breakStartMs + 1000,
    },
  });

  const result = reduceTachoEvent(state, {
    type: 'STATUS_CHANGE_REQUESTED',
    nowMs: breakStartMs + 15 * 60 * 1000,
    nextStatus: 'working',
  });

  assert.equal(result.state.status, 'working');
  assert.equal(result.state.isDriving, false);
  assert.equal(result.state.motion.pendingTransitionType, null);
  assert.equal(result.state.motion.pendingTransitionStartedAtMs, 0);
});

test('DRIVING_DECISION_RECEIVED stopping driving syncs drive stop and restores compliance scheduling', () => {
  const state = createTachoStateFromSnapshot({
    status: 'working',
    sessionId: 's3',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T10:00:00.000Z',
    totals: { work: 0, poa: 0, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
    workCycle: 0,
    drivingCycle: 0,
    has15minBreak: false,
    isDriving: true,
    breakStartMs: 0,
    weeklyDrivingAccumulator: 0,
    shiftExtensionsUsedThisWeek: 0,
    maxShiftTimeSeconds: 13 * 3600,
    dailyRestSecondsBeforeShift: 0,
    reducedDailyRestTaken: false,
    lastTickMs: Date.UTC(2026, 4, 14, 10, 0, 0),
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
  });

  const result = reduceTachoEvent(state, {
    type: 'DRIVING_DECISION_RECEIVED',
    nowMs: Date.UTC(2026, 4, 14, 10, 2, 0),
    nextDriving: false,
    source: 'location',
  });

  assert.equal(result.state.isDriving, false);
  assert.equal(result.state.totals.work, 120);
  assert.equal(result.state.totals.driving, 120);
  assert.ok(result.commands.some(command => command.type === 'sync_session' && command.reason === 'drive_stop'));
  assert.ok(result.commands.some(command => command.type === 'schedule_alerts' && command.target === 'compliance'));
});

test('DRIVING_DECISION_RECEIVED reclassifies delayed stop time as work', () => {
  const nowMs = Date.UTC(2026, 4, 14, 10, 2, 20);
  const stoppedAtMs = nowMs - 20_000;
  const state = createTachoStateFromSnapshot({
    status: 'working',
    sessionId: 's-delayed-stop',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: new Date(nowMs).toISOString(),
    totals: { work: 140, poa: 0, break: 0, driving: 140 },
    legalBreakDisplayTotal: 0,
    workCycle: 140,
    drivingCycle: 140,
    has15minBreak: false,
    isDriving: true,
    breakStartMs: 0,
    weeklyDrivingAccumulator: 0,
    shiftExtensionsUsedThisWeek: 0,
    maxShiftTimeSeconds: 13 * 3600,
    dailyRestSecondsBeforeShift: 0,
    reducedDailyRestTaken: false,
    lastTickMs: nowMs,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
  });

  const result = reduceTachoEvent(state, {
    type: 'DRIVING_DECISION_RECEIVED',
    nowMs,
    nextDriving: false,
    source: 'location',
    effectiveTransitionMs: stoppedAtMs,
  });

  assert.equal(result.state.isDriving, false);
  assert.equal(result.state.totals.driving, 123);
  assert.equal(result.state.totals.work, 140);
  assert.equal(result.state.workCycle, 140);
  assert.equal(result.state.drivingCycle, 123);
});

test('DRIVING_DECISION_RECEIVED is ignored during manual break', () => {
  const state = createTachoStateFromSnapshot({
    status: 'break',
    sessionId: 's-break-driving-ignore',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T10:00:00.000Z',
    totals: { work: 7200, poa: 0, break: 300, driving: 1800 },
    legalBreakDisplayTotal: 0,
    workCycle: 7200,
    drivingCycle: 1800,
    has15minBreak: false,
    isDriving: false,
    breakStartMs: Date.UTC(2026, 4, 14, 10, 0, 0),
    weeklyDrivingAccumulator: 0,
    shiftExtensionsUsedThisWeek: 0,
    maxShiftTimeSeconds: 13 * 3600,
    dailyRestSecondsBeforeShift: 0,
    reducedDailyRestTaken: false,
    lastTickMs: Date.UTC(2026, 4, 14, 10, 0, 0),
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
  });

  const result = reduceTachoEvent(state, {
    type: 'DRIVING_DECISION_RECEIVED',
    nowMs: Date.UTC(2026, 4, 14, 10, 1, 0),
    nextDriving: true,
    source: 'location',
  });

  assert.equal(result.state, state);
  assert.deepEqual(result.commands, []);
});

test('DRIVING_DECISION_RECEIVED is ignored during POA', () => {
  const state = createTachoStateFromSnapshot({
    status: 'poa',
    sessionId: 's-poa-driving-ignore',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T10:00:00.000Z',
    totals: { work: 7200, poa: 300, break: 0, driving: 1800 },
    legalBreakDisplayTotal: 0,
    workCycle: 7200,
    drivingCycle: 1800,
    has15minBreak: false,
    isDriving: false,
    breakStartMs: 0,
    weeklyDrivingAccumulator: 0,
    shiftExtensionsUsedThisWeek: 0,
    maxShiftTimeSeconds: 13 * 3600,
    dailyRestSecondsBeforeShift: 0,
    reducedDailyRestTaken: false,
    lastTickMs: Date.UTC(2026, 4, 14, 10, 0, 0),
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
  });

  const result = reduceTachoEvent(state, {
    type: 'DRIVING_DECISION_RECEIVED',
    nowMs: Date.UTC(2026, 4, 14, 10, 1, 0),
    nextDriving: true,
    source: 'background',
  });

  assert.equal(result.state, state);
  assert.deepEqual(result.commands, []);
});

test('BACKGROUND_SPEED_SAMPLE_RECEIVED applies a resume-time driving stop through the reducer', () => {
  const state = createTachoStateFromSnapshot({
    status: 'working',
    sessionId: 's-bg',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T10:00:00.000Z',
    totals: { work: 0, poa: 0, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
    workCycle: 0,
    drivingCycle: 0,
    has15minBreak: false,
    isDriving: true,
    breakStartMs: 0,
    weeklyDrivingAccumulator: 0,
    shiftExtensionsUsedThisWeek: 0,
    maxShiftTimeSeconds: 13 * 3600,
    dailyRestSecondsBeforeShift: 0,
    reducedDailyRestTaken: false,
    lastTickMs: Date.UTC(2026, 4, 14, 10, 0, 0),
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
  });

  const nowMs = Date.UTC(2026, 4, 14, 10, 0, 5);
  const result = reduceTachoEvent(state, {
    type: 'BACKGROUND_SPEED_SAMPLE_RECEIVED',
    nowMs,
    speedKmh: 0,
    sampleTs: nowMs,
  });

  assert.equal(result.state.isDriving, false);
  assert.ok(result.commands.some(command => command.type === 'sync_session' && command.reason === 'drive_stop'));
});

test('BACKGROUND_SPEED_SAMPLE_RECEIVED applies stale stop evidence for active driving', () => {
  const segmentStartMs = Date.UTC(2026, 4, 14, 10, 0, 0);
  const sampleTs = segmentStartMs + 5 * 60 * 1000;
  const receiptTs = sampleTs + 15 * 60 * 1000;
  const state = createTachoStateFromSnapshot({
    status: 'working',
    sessionId: 's-bg-stale-stop',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: new Date(segmentStartMs).toISOString(),
    totals: { work: 0, poa: 0, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
    workCycle: 0,
    drivingCycle: 0,
    has15minBreak: false,
    isDriving: true,
    breakStartMs: 0,
    weeklyDrivingAccumulator: 0,
    shiftExtensionsUsedThisWeek: 0,
    maxShiftTimeSeconds: 13 * 3600,
    dailyRestSecondsBeforeShift: 0,
    reducedDailyRestTaken: false,
    lastTickMs: segmentStartMs,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
    motion: {
      lastLocationTs: segmentStartMs - 1000,
      lastSpeedTs: segmentStartMs - 1000,
      lastSpeedKmh: 20,
    },
  });

  const result = reduceTachoEvent(state, {
    type: 'BACKGROUND_SPEED_SAMPLE_RECEIVED',
    nowMs: sampleTs,
    receiptTs,
    speedKmh: 0,
    sampleTs,
  });

  assert.equal(result.state.isDriving, false);
  assert.equal(result.state.currentSegmentStart, new Date(sampleTs).toISOString());
  assert.equal(result.state.totals.work, 5 * 60);
  assert.equal(result.state.totals.driving, 5 * 60);
  assert.ok(result.commands.some(command => command.type === 'sync_session' && command.reason === 'drive_stop'));
});

test('BACKGROUND_SPEED_SAMPLE_RECEIVED still ignores stale driving starts', () => {
  const sampleTs = Date.UTC(2026, 4, 14, 10, 0, 0);
  const state = createTachoStateFromSnapshot({
    status: 'working',
    sessionId: 's-bg-stale-start',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T09:55:00.000Z',
    totals: { work: 300, poa: 0, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
    workCycle: 300,
    drivingCycle: 0,
    has15minBreak: false,
    isDriving: false,
    breakStartMs: 0,
    weeklyDrivingAccumulator: 0,
    shiftExtensionsUsedThisWeek: 0,
    maxShiftTimeSeconds: 13 * 3600,
    dailyRestSecondsBeforeShift: 0,
    reducedDailyRestTaken: false,
    lastTickMs: sampleTs,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
    motion: {
      lastLocationTs: sampleTs - 1000,
      lastSpeedTs: sampleTs - 1000,
      lastSpeedKmh: 0,
    },
  });

  const result = reduceTachoEvent(state, {
    type: 'BACKGROUND_SPEED_SAMPLE_RECEIVED',
    nowMs: sampleTs,
    receiptTs: sampleTs + 15 * 60 * 1000,
    speedKmh: 80,
    sampleTs,
  });

  assert.equal(result.state, state);
  assert.deepEqual(result.commands, []);
});

test('BACKGROUND_SPEED_SAMPLE_RECEIVED ignores stale samples without advancing processed timestamp', () => {
  const lastLocationTs = Date.UTC(2026, 4, 14, 10, 0, 0);
  const state = createTachoStateFromSnapshot({
    status: 'working',
    sessionId: 's-bg-stale',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T10:00:00.000Z',
    totals: { work: 0, poa: 0, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
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
    lastTickMs: lastLocationTs,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
    motion: {
      lastLocationTs,
      lastSpeedTs: lastLocationTs,
      lastSpeedKmh: 0,
    },
  });

  const staleSampleTs = lastLocationTs + 1000;
  const result = reduceTachoEvent(state, {
    type: 'BACKGROUND_SPEED_SAMPLE_RECEIVED',
    nowMs: staleSampleTs,
    receiptTs: staleSampleTs + 11000,
    speedKmh: 80,
    sampleTs: staleSampleTs,
  });

  assert.equal(result.state.isDriving, false);
  assert.equal(result.state.motion.lastLocationTs, lastLocationTs);
  assert.deepEqual(result.commands, []);
});

test('BACKGROUND_SPEED_SAMPLE_RECEIVED ignores duplicate samples safely', () => {
  const sampleTs = Date.UTC(2026, 4, 14, 10, 0, 0);
  const state = createTachoStateFromSnapshot({
    status: 'working',
    sessionId: 's-bg-duplicate',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T10:00:00.000Z',
    totals: { work: 0, poa: 0, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
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
    lastTickMs: sampleTs,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
    motion: {
      lastLocationTs: sampleTs,
      lastSpeedTs: sampleTs,
      lastSpeedKmh: 60,
    },
  });

  const result = reduceTachoEvent(state, {
    type: 'BACKGROUND_SPEED_SAMPLE_RECEIVED',
    nowMs: sampleTs,
    receiptTs: sampleTs,
    speedKmh: 80,
    sampleTs,
  });

  assert.equal(result.state, state);
  assert.deepEqual(result.commands, []);
});

test('evaluate alert thresholds through TIMER_TICK emits warning commands when thresholds are crossed', () => {
  const state = createTachoStateFromSnapshot({
    status: 'working',
    sessionId: 's4',
    timerMode: '6h',
    workStartTime: '2026-05-14T08:00:00.000Z',
    currentSegmentStart: '2026-05-14T12:29:30.000Z',
    totals: { work: 5 * 3600 + 29 * 60, poa: 0, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
    workCycle: 5 * 3600 + 29 * 60,
    drivingCycle: 0,
    has15minBreak: false,
    isDriving: false,
    breakStartMs: 0,
    weeklyDrivingAccumulator: 0,
    shiftExtensionsUsedThisWeek: 0,
    maxShiftTimeSeconds: 13 * 3600,
    dailyRestSecondsBeforeShift: 0,
    reducedDailyRestTaken: false,
    lastTickMs: Date.UTC(2026, 4, 14, 12, 29, 30),
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
    alerts: {
      prevShiftElapsed: 0,
      prevRemaining: {
        work: 31 * 60,
        drive: 4.5 * 3600,
        driveExtension: 10 * 3600,
        weeklyDrive: 56 * 3600,
        maxShiftTime: 13 * 3600,
      },
    },
  });

  const result = reduceTachoEvent(state, {
    type: 'TIMER_TICK',
    nowMs: Date.UTC(2026, 4, 14, 12, 30, 30),
  });

  assert.ok(result.commands.some(command => command.type === 'trigger_alert' && command.alertKey === 'workWarn30mRemaining'));
});
