import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildCriticalTimerWriteId,
  canFlushCriticalTimerWrite,
  mergeCriticalTimerWriteQueue,
  type CriticalTimerWrite,
} from '../criticalTimerQueue';

const createWrite = (
  id: string,
  payload: Record<string, any>,
): CriticalTimerWrite => ({
  id,
  kind: 'update_session',
  sessionId: 'session-1',
  userId: 'user-1',
  createdAtMs: Date.now(),
  attempts: 0,
  lastAttemptAtMs: null,
  lastError: null,
  payload,
});

test('buildCriticalTimerWriteId coalesces checkpoints by session', () => {
  assert.equal(
    buildCriticalTimerWriteId({
      kind: 'update_session',
      sessionId: 'session-1',
      reason: 'checkpoint',
      at: '2026-06-13T10:00:00.000Z',
    }),
    'checkpoint:session-1',
  );
});

test('buildCriticalTimerWriteId keeps status writes distinct by transition time', () => {
  assert.notEqual(
    buildCriticalTimerWriteId({
      kind: 'update_session',
      sessionId: 'session-1',
      reason: 'status_change',
      at: '2026-06-13T10:00:00.000Z',
    }),
    buildCriticalTimerWriteId({
      kind: 'update_session',
      sessionId: 'session-1',
      reason: 'status_change',
      at: '2026-06-13T10:15:00.000Z',
    }),
  );
});

test('mergeCriticalTimerWriteQueue replaces an existing write and appends it last', () => {
  const firstCheckpoint = createWrite('checkpoint:session-1', { total_work_minutes: 10 });
  const statusChange = createWrite('update:session-1:status_change:t1', { status: 'break' });
  const latestCheckpoint = createWrite('checkpoint:session-1', { total_work_minutes: 20 });

  const merged = mergeCriticalTimerWriteQueue(
    [firstCheckpoint, statusChange],
    latestCheckpoint,
  );

  assert.deepEqual(merged.map(write => write.id), [
    'update:session-1:status_change:t1',
    'checkpoint:session-1',
  ]);
  assert.equal(merged[1].payload.total_work_minutes, 20);
});

test('canFlushCriticalTimerWrite requires an authenticated matching user', () => {
  const write = createWrite('checkpoint:session-1', { total_work_minutes: 20 });

  assert.equal(canFlushCriticalTimerWrite(write, null), false);
  assert.equal(canFlushCriticalTimerWrite(write, undefined), false);
  assert.equal(canFlushCriticalTimerWrite(write, 'different-user'), false);
  assert.equal(canFlushCriticalTimerWrite(write, 'user-1'), true);
});
