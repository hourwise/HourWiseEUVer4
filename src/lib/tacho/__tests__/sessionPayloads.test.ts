import test from 'node:test';
import assert from 'node:assert/strict';

import { buildSessionSyncPayload } from '../sessionPayloads';

test('buildSessionSyncPayload creates status change payloads with break timestamps', () => {
  const payload = buildSessionSyncPayload({
    reason: 'status_change',
    status: 'break',
    totals: { work: 3600, poa: 600, break: 300, driving: 1200 },
    legalBreakDisplayTotal: 900,
    has15minBreak: true,
    workCycle: 4800,
    drivingCycle: 1200,
    timerMode: '9h',
    existingOtherData: { keep: 'me' },
    currentSegmentStart: '2026-05-17T09:00:00.000Z',
    breakStartMs: Date.parse('2026-05-17T09:00:00.000Z'),
    nowMs: Date.parse('2026-05-17T09:05:00.000Z'),
  });

  if (
    !('status' in payload) ||
    !('total_work_minutes' in payload) ||
    !('current_break_start' in payload) ||
    !('current_poa_start' in payload)
  ) {
    assert.fail('Expected status_change payload shape');
  }
  assert.equal(payload.status, 'break');
  assert.equal(payload.total_work_minutes, 60);
  assert.equal(payload.current_break_start, '2026-05-17T09:00:00.000Z');
  assert.equal(payload.current_poa_start, null);
  assert.equal('current_segment_start' in payload, false);
  assert.equal((payload.other_data as any).driving, 20);
  assert.equal((payload.other_data as any).currentSegmentStart, '2026-05-17T09:00:00.000Z');
  assert.equal((payload.other_data as any).isDriving, false);
  assert.equal((payload.other_data as any).workIncludesDrivingReference, true);
  assert.equal((payload.other_data as any).keep, 'me');
});

test('buildSessionSyncPayload keeps break activity start separate from checkpoint start', () => {
  const payload = buildSessionSyncPayload({
    reason: 'checkpoint',
    status: 'break',
    totals: { work: 7200, poa: 0, break: 1800, driving: 0 },
    legalBreakDisplayTotal: 900,
    has15minBreak: true,
    workCycle: 7200,
    drivingCycle: 0,
    timerMode: '9h',
    existingOtherData: { activitySegmentStartTime: '2026-05-17T10:00:00.000Z' },
    currentSegmentStart: '2026-05-17T10:30:00.000Z',
    currentBreakStart: '2026-05-17T10:00:00.000Z',
  });

  if (!('current_break_start' in payload)) {
    assert.fail('Expected checkpoint payload shape');
  }

  assert.equal(payload.current_break_start, '2026-05-17T10:00:00.000Z');
  assert.equal((payload.other_data as any).currentSegmentStart, '2026-05-17T10:30:00.000Z');
  assert.equal((payload.other_data as any).activitySegmentStartTime, '2026-05-17T10:00:00.000Z');
});

test('buildSessionSyncPayload creates checkpoint payloads for poa without overriding break fields', () => {
  const payload = buildSessionSyncPayload({
    reason: 'checkpoint',
    status: 'poa',
    totals: { work: 1200, poa: 900, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
    has15minBreak: false,
    workCycle: 1200,
    drivingCycle: 0,
    timerMode: '6h',
    existingOtherData: null,
    currentSegmentStart: '2026-05-17T10:00:00.000Z',
    currentPoaStart: '2026-05-17T10:00:00.000Z',
  });

  if (
    !('total_work_minutes' in payload) ||
    !('current_break_start' in payload) ||
    !('current_poa_start' in payload)
  ) {
    assert.fail('Expected checkpoint payload shape');
  }
  assert.equal(payload.total_work_minutes, 20);
  assert.equal(payload.total_poa_minutes, 15);
  assert.equal(payload.current_break_start, null);
  assert.equal(payload.current_poa_start, '2026-05-17T10:00:00.000Z');
  assert.equal('current_segment_start' in payload, false);
  assert.equal((payload.other_data as any).currentSegmentStart, '2026-05-17T10:00:00.000Z');
  assert.equal((payload.other_data as any).workIncludesDrivingReference, true);
});

test('buildSessionSyncPayload keeps POA activity start separate from checkpoint start', () => {
  const payload = buildSessionSyncPayload({
    reason: 'checkpoint',
    status: 'poa',
    totals: { work: 1200, poa: 2100, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
    has15minBreak: false,
    workCycle: 1200,
    drivingCycle: 0,
    timerMode: '6h',
    existingOtherData: { activitySegmentStartTime: '2026-05-17T10:00:00.000Z' },
    currentSegmentStart: '2026-05-17T10:35:00.000Z',
    currentPoaStart: '2026-05-17T10:00:00.000Z',
  });

  if (!('current_poa_start' in payload)) {
    assert.fail('Expected checkpoint payload shape');
  }

  assert.equal(payload.current_poa_start, '2026-05-17T10:00:00.000Z');
  assert.equal((payload.other_data as any).currentSegmentStart, '2026-05-17T10:35:00.000Z');
  assert.equal((payload.other_data as any).activitySegmentStartTime, '2026-05-17T10:00:00.000Z');
});

test('buildSessionSyncPayload creates drive-stop payloads without totals fields', () => {
  const payload = buildSessionSyncPayload({
    reason: 'drive_stop',
    status: 'working',
    totals: { work: 120, poa: 0, break: 0, driving: 180 },
    legalBreakDisplayTotal: 0,
    has15minBreak: false,
    workCycle: 300,
    drivingCycle: 180,
    timerMode: '6h',
    existingOtherData: { marker: true },
    currentSegmentStart: '2026-05-17T11:00:00.000Z',
    isDriving: true,
  });

  assert.equal('total_work_minutes' in payload, false);
  assert.equal('current_segment_start' in payload, false);
  assert.equal((payload.other_data as any).driving, 3);
  assert.equal((payload.other_data as any).currentSegmentStart, '2026-05-17T11:00:00.000Z');
  assert.equal((payload.other_data as any).isDriving, false);
  assert.equal((payload.other_data as any).workIncludesDrivingReference, true);
  assert.equal((payload.other_data as any).marker, true);
});

test('buildSessionSyncPayload keeps the active working segment checkpoint in other_data', () => {
  const payload = buildSessionSyncPayload({
    reason: 'checkpoint',
    status: 'working',
    totals: { work: 5400, poa: 0, break: 2940, driving: 1500 },
    legalBreakDisplayTotal: 2940,
    has15minBreak: false,
    workCycle: 0,
    drivingCycle: 0,
    timerMode: '6h',
    existingOtherData: { keep: 'checkpoint' },
    currentSegmentStart: '2026-06-08T13:49:00.000Z',
    isDriving: false,
  });

  assert.equal((payload.other_data as any).currentSegmentStart, '2026-06-08T13:49:00.000Z');
  assert.equal((payload.other_data as any).isDriving, false);
  assert.equal((payload.other_data as any).workIncludesDrivingReference, true);
  assert.equal((payload.other_data as any).keep, 'checkpoint');
});
