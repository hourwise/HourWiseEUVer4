import test from 'node:test';
import assert from 'node:assert/strict';

import { applyCatchUpElapsed } from '../rehydration';

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
