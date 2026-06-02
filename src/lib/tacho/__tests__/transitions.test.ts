import test from 'node:test';
import assert from 'node:assert/strict';

import { deriveDrivingTransition, deriveStatusTransition } from '../transitions';

test('deriveDrivingTransition applies elapsed time and resets segment when driving flips', () => {
  const nowMs = Date.UTC(2026, 4, 14, 12, 0, 30);
  const result = deriveDrivingTransition({
    nowMs,
    status: 'working',
    segmentStartIso: new Date(Date.UTC(2026, 4, 14, 12, 0, 0)).toISOString(),
    currentDriving: false,
    nextDriving: true,
  });

  assert.equal(result.shouldFlip, true);
  assert.equal(result.elapsedSecToApply, 30);
  assert.equal(result.nextSegmentStartIso, new Date(nowMs).toISOString());
  assert.equal(result.nextSegmentStartMs, nowMs);
});

test('deriveDrivingTransition is a no-op when driving state does not change', () => {
  const result = deriveDrivingTransition({
    nowMs: Date.now(),
    status: 'working',
    segmentStartIso: new Date().toISOString(),
    currentDriving: true,
    nextDriving: true,
  });

  assert.equal(result.shouldFlip, false);
  assert.equal(result.elapsedSecToApply, 0);
  assert.equal(result.nextSegmentStartMs !== null, true);
});

test('deriveStatusTransition resets cycles after a qualifying break', () => {
  const breakStartMs = Date.UTC(2026, 4, 14, 8, 0, 0);
  const nowMs = breakStartMs + 45 * 60 * 1000;
  const result = deriveStatusTransition({
    nowMs,
    prevStatus: 'break',
    nextStatus: 'working',
    segmentStartIso: new Date(breakStartMs).toISOString(),
    breakStartMs,
    has15minBreak: true,
    timerMode: '9h',
    workCycle: 1000,
    drivingCycle: 800,
  });

  assert.equal(result.nextHas15minBreak, false);
  assert.equal(result.nextTimerMode, '6h');
  assert.equal(result.nextWorkCycle, 0);
  assert.equal(result.nextDrivingCycle, 0);
  assert.equal(result.lastBreakDuration, 45 * 60);
  assert.equal(result.lastBreakEndTime, nowMs);
});

test('deriveStatusTransition starts break timing when entering break', () => {
  const nowMs = Date.UTC(2026, 4, 14, 10, 15, 0);
  const result = deriveStatusTransition({
    nowMs,
    prevStatus: 'working',
    nextStatus: 'break',
    segmentStartIso: new Date(Date.UTC(2026, 4, 14, 10, 0, 0)).toISOString(),
    breakStartMs: 0,
    has15minBreak: false,
    timerMode: '6h',
    workCycle: 500,
    drivingCycle: 0,
  });

  assert.equal(result.elapsedSecToApply, 15 * 60);
  assert.equal(result.nextBreakStartMs, nowMs);
  assert.equal(result.lastBreakDuration, 0);
});

test('deriveDrivingTransition preserves sub-second remainder when driving flips', () => {
  const segmentStartMs = Date.UTC(2026, 4, 14, 12, 0, 0, 100);
  const nowMs = segmentStartMs + 30_850;
  const result = deriveDrivingTransition({
    nowMs,
    status: 'working',
    segmentStartIso: new Date(segmentStartMs).toISOString(),
    currentDriving: false,
    nextDriving: true,
  });

  assert.equal(result.elapsedSecToApply, 30);
  assert.equal(result.nextSegmentStartMs, segmentStartMs + 30_000);
  assert.equal(result.nextSegmentStartIso, new Date(segmentStartMs + 30_000).toISOString());
});
