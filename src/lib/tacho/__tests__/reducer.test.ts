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
  assert.ok(result.commands.some(command => command.type === 'sync_session' && command.reason === 'drive_stop'));
  assert.ok(result.commands.some(command => command.type === 'schedule_alerts' && command.target === 'compliance'));
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
