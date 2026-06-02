import test from 'node:test';
import assert from 'node:assert/strict';

import {
  applyElapsedToCounters,
  evaluateBreakCompletion,
  getDisplayedBreakSeconds,
  getLegalBreakContributionSeconds,
} from '../timing';

test('applyElapsedToCounters adds work and workCycle for non-driving work', () => {
  const result = applyElapsedToCounters(
    {
      totals: { work: 10, poa: 20, break: 30, driving: 40 },
      workCycle: 100,
      drivingCycle: 50,
    },
    120,
    'working',
    false,
  );

  assert.deepEqual(result, {
    totals: { work: 130, poa: 20, break: 30, driving: 40 },
    workCycle: 220,
    drivingCycle: 50,
  });
});

test('applyElapsedToCounters adds driving and both cycles for driving work', () => {
  const result = applyElapsedToCounters(
    {
      totals: { work: 0, poa: 0, break: 0, driving: 600 },
      workCycle: 900,
      drivingCycle: 600,
    },
    300,
    'working',
    true,
  );

  assert.equal(result.totals.driving, 900);
  assert.equal(result.workCycle, 1200);
  assert.equal(result.drivingCycle, 900);
});

test('evaluateBreakCompletion upgrades 15 minute split break to 9h mode without reset', () => {
  const result = evaluateBreakCompletion({
    breakSeconds: 15 * 60,
    has15minBreak: false,
    timerMode: '6h',
  });

  assert.deepEqual(result, {
    nextHas15minBreak: true,
    nextTimerMode: '9h',
    resetWorkCycle: false,
    resetDrivingCycle: false,
    isQualifyingBreak: false,
  });
});

test('evaluateBreakCompletion resets cycles for a qualifying 45 minute break', () => {
  const result = evaluateBreakCompletion({
    breakSeconds: 45 * 60,
    has15minBreak: true,
    timerMode: '9h',
  });

  assert.equal(result.nextHas15minBreak, false);
  assert.equal(result.nextTimerMode, '6h');
  assert.equal(result.resetWorkCycle, true);
  assert.equal(result.resetDrivingCycle, true);
  assert.equal(result.isQualifyingBreak, true);
});

test('break display helpers preserve current tachograph rounding rules', () => {
  assert.equal(getDisplayedBreakSeconds(14 * 60), 0);
  assert.equal(getDisplayedBreakSeconds(20 * 60), 15 * 60);
  assert.equal(getLegalBreakContributionSeconds(29 * 60, true), 0);
  assert.equal(getLegalBreakContributionSeconds(30 * 60, true), 30 * 60);
});
