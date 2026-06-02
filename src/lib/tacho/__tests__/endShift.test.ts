import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildEndSessionRequest,
  createEndShiftSummaryState,
  getEndShiftConfirmationError,
  setEndShiftSummaryConfirming,
} from '../endShift';

test('createEndShiftSummaryState creates a non-confirming summary by default', () => {
  const summary = createEndShiftSummaryState({
    finalTotals: { work: 3600, poa: 900, break: 1800, driving: 1200 },
    score: 94,
    violations: ['break_missed'],
  });

  assert.equal(summary.isConfirming, false);
  assert.equal(summary.score, 94);
  assert.deepEqual(summary.totals, { work: 3600, poa: 900, break: 1800, driving: 1200 });
});

test('setEndShiftSummaryConfirming preserves extra fields such as onConfirm', async () => {
  const onConfirm = async () => {};
  const summary = {
    ...createEndShiftSummaryState({
      finalTotals: { work: 10, poa: 20, break: 30, driving: 40 },
      score: 100,
      violations: [],
    }),
    onConfirm,
  };

  const confirming = setEndShiftSummaryConfirming(summary, true);

  assert.equal(confirming.isConfirming, true);
  assert.equal(confirming.onConfirm, onConfirm);
});

test('getEndShiftConfirmationError rejects missing sessions and accepts active ones', () => {
  assert.equal(getEndShiftConfirmationError(null), 'missing_active_session');
  assert.equal(getEndShiftConfirmationError('session-1'), null);
});

test('buildEndSessionRequest keeps merged shift metadata for final save', () => {
  const request = buildEndSessionRequest({
    sessionId: 'session-1',
    finalTotals: { work: 3660, poa: 120, break: 600, driving: 1800 },
    effectiveHas15minBreak: true,
    effectiveWorkCycle: 3780,
    effectiveDrivingCycle: 1800,
    shiftMetadata: {
      driving: 30,
      dailyRestSecondsBeforeShift: 39600,
      reducedDailyRestTaken: false,
    },
    existingOtherData: {
      keep: 'me',
    },
    score: 88,
    violations: ['reduced_rest'],
  });

  assert.equal(request.workMins, 61);
  assert.equal(request.drivingMins, 30);
  assert.equal(request.existingOtherData.keep, 'me');
  assert.equal(request.existingOtherData.dailyRestSecondsBeforeShift, 39600);
  assert.equal(request.existingOtherData.workCycle, 63);
  assert.equal(request.complianceScore, 88);
});
