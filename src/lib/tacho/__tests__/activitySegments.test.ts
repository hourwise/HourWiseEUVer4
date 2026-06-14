import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildActivitySegmentId,
  buildStatusTransitionSegmentMutations,
  statusToActivitySegmentType,
} from '../activitySegments';

test('statusToActivitySegmentType maps timer statuses to ledger activity types', () => {
  assert.equal(statusToActivitySegmentType('working'), 'work');
  assert.equal(statusToActivitySegmentType('break'), 'break');
  assert.equal(statusToActivitySegmentType('poa'), 'poa');
  assert.equal(statusToActivitySegmentType('idle'), null);
});

test('buildActivitySegmentId is deterministic for the same segment boundary', () => {
  const input = {
    sessionId: 'session-1',
    activityType: 'work' as const,
    startTime: '2026-06-12T08:00:00.000Z',
  };

  assert.equal(buildActivitySegmentId(input), buildActivitySegmentId(input));
  assert.equal(buildActivitySegmentId(input), 'session-1:work:1781251200000');
});

test('buildStatusTransitionSegmentMutations closes previous status and opens next status', () => {
  const mutations = buildStatusTransitionSegmentMutations({
    userId: 'user-1',
    sessionId: 'session-1',
    previousStatus: 'working',
    previousSegmentStart: '2026-06-12T08:00:00.000Z',
    nextStatus: 'break',
    transitionTime: '2026-06-12T10:00:00.000Z',
  });

  assert.equal(mutations.length, 2);
  assert.equal(mutations[0].kind, 'close');
  assert.equal(mutations[0].activityType, 'work');
  assert.equal(mutations[0].startTime, '2026-06-12T08:00:00.000Z');
  assert.equal(mutations[0].endTime, '2026-06-12T10:00:00.000Z');
  assert.equal(mutations[1].kind, 'upsert');
  assert.equal(mutations[1].activityType, 'break');
  assert.equal(mutations[1].startTime, '2026-06-12T10:00:00.000Z');
  assert.equal(mutations[1].endTime, null);
});

test('buildStatusTransitionSegmentMutations closes final segment when shift ends', () => {
  const mutations = buildStatusTransitionSegmentMutations({
    userId: 'user-1',
    sessionId: 'session-1',
    previousStatus: 'poa',
    previousSegmentStart: '2026-06-12T12:00:00.000Z',
    nextStatus: 'idle',
    transitionTime: '2026-06-12T14:00:00.000Z',
  });

  assert.equal(mutations.length, 1);
  assert.equal(mutations[0].kind, 'close');
  assert.equal(mutations[0].activityType, 'poa');
  assert.equal(mutations[0].endTime, '2026-06-12T14:00:00.000Z');
});
