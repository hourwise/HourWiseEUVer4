import test from 'node:test';
import assert from 'node:assert/strict';

import { MAX_DRIVE, MAX_SHIFT_TIME_13H, MAX_WEEKLY_DRIVE } from '../constants';
import { deriveLiveDisplayState } from '../display';

test('deriveLiveDisplayState projects break duration and legal break while on break', () => {
  const breakStartMs = Date.UTC(2026, 4, 14, 10, 0, 0);
  const nowMs = breakStartMs + 20 * 60 * 1000;
  const display = deriveLiveDisplayState({
    nowMs,
    status: 'break',
    segmentStartIso: new Date(breakStartMs).toISOString(),
    workStartIso: new Date(Date.UTC(2026, 4, 14, 8, 0, 0)).toISOString(),
    totals: { work: 2 * 3600, poa: 0, break: 0, driving: 3600 },
    legalBreakDisplayTotal: 0,
    workCycle: 3 * 3600,
    drivingCycle: 3600,
    isDriving: false,
    timerMode: '6h',
    weeklyDrivingAccumulator: 0,
    breakStartMs,
    has15minBreak: false,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
    maxDriveSeconds: MAX_DRIVE,
    maxWeeklyDriveSeconds: MAX_WEEKLY_DRIVE,
    maxShiftTimeSeconds: MAX_SHIFT_TIME_13H,
  });

  assert.equal(display.breakDuration, 20 * 60);
  assert.equal(display.legalBreak, 15 * 60);
  assert.equal(display.shift, 2 * 3600 + 20 * 60);
});

test('deriveLiveDisplayState falls back safely when timestamps are invalid', () => {
  const nowMs = Date.UTC(2026, 4, 14, 12, 0, 0);
  const display = deriveLiveDisplayState({
    nowMs,
    status: 'working',
    segmentStartIso: 'not-a-timestamp',
    workStartIso: 'also-not-a-timestamp',
    totals: { work: 600, poa: 0, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
    workCycle: 600,
    drivingCycle: 0,
    isDriving: false,
    timerMode: '6h',
    weeklyDrivingAccumulator: 0,
    breakStartMs: 0,
    has15minBreak: false,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
    maxDriveSeconds: MAX_DRIVE,
    maxWeeklyDriveSeconds: MAX_WEEKLY_DRIVE,
    maxShiftTimeSeconds: MAX_SHIFT_TIME_13H,
  });

  assert.equal(display.work, 600);
  assert.equal(display.shift, 0);
  assert.equal(display.breakDuration, 0);
});

test('deriveLiveDisplayState counts driving as work and driving reference time', () => {
  const segmentStartMs = Date.UTC(2026, 4, 14, 12, 0, 0);
  const nowMs = segmentStartMs + 5 * 60 * 1000;
  const display = deriveLiveDisplayState({
    nowMs,
    status: 'working',
    segmentStartIso: new Date(segmentStartMs).toISOString(),
    workStartIso: new Date(Date.UTC(2026, 4, 14, 8, 0, 0)).toISOString(),
    totals: { work: 3600, poa: 0, break: 0, driving: 1200 },
    legalBreakDisplayTotal: 0,
    workCycle: 3600,
    drivingCycle: 1200,
    isDriving: true,
    timerMode: '6h',
    weeklyDrivingAccumulator: 0,
    breakStartMs: 0,
    has15minBreak: false,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
    maxDriveSeconds: MAX_DRIVE,
    maxWeeklyDriveSeconds: MAX_WEEKLY_DRIVE,
    maxShiftTimeSeconds: MAX_SHIFT_TIME_13H,
  });

  assert.equal(display.work, 3900);
  assert.equal(display.driving, 1500);
  assert.equal(display.workTimeRemaining, 6 * 3600 - 3900);
});
