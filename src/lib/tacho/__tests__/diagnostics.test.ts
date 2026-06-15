import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendMotionDiagnosticRecords,
  appendTimerDiagnosticRecords,
  formatCombinedDiagnosticsExport,
  formatMotionDiagnosticsExport,
  type MotionDiagnosticRecord,
  type TimerDiagnosticRecord,
} from '../diagnostics';

const createRecord = (sampleTimeMs: number): MotionDiagnosticRecord => ({
  receiptTimeMs: sampleTimeMs + 100,
  sampleTimeMs,
  appState: 'active',
  source: 'foreground_location',
  gpsSpeedKmh: 12,
  computedSpeedKmh: null,
  selectedSpeedKmh: 12,
  selectedSpeedSource: 'gps',
  accuracyM: 8,
  previousDriving: false,
  nextDriving: true,
  movingSinceMs: sampleTimeMs,
  stationarySinceMs: 0,
  ignoredReason: null,
  reducerEventApplied: 'DRIVING_DECISION_RECEIVED',
  totalsBefore: { work: 1, poa: 0, break: 0, driving: 0 },
  totalsAfter: { work: 1, poa: 0, break: 0, driving: 1 },
});

const createTimerRecord = (ts: number): TimerDiagnosticRecord => ({
  ts,
  event: 'local_persist',
  sessionId: 'session-1',
  source: 'test',
  reason: 'save_active_state',
  statusBefore: 'working',
  statusAfter: 'working',
  success: true,
  snapshotAfter: {
    status: 'working',
    sessionId: 'session-1',
    workStartTime: '2026-06-12T08:00:00.000Z',
    currentSegmentStart: '2026-06-12T09:00:00.000Z',
    activitySegmentStartTime: '2026-06-12T08:00:00.000Z',
    totals: { work: ts, poa: 0, break: 0, driving: 0 },
    legalBreakDisplayTotal: 0,
    workCycle: ts,
    drivingCycle: 0,
    timerMode: '6h',
    isDriving: false,
    breakStartMs: 0,
    lastTickMs: ts,
  },
});

test('appendMotionDiagnosticRecords keeps only the most recent bounded records', () => {
  const records = appendMotionDiagnosticRecords(
    [createRecord(1), createRecord(2)],
    [createRecord(3), createRecord(4)],
    3,
  );

  assert.deepEqual(records.map(record => record.sampleTimeMs), [2, 3, 4]);
});

test('formatMotionDiagnosticsExport creates a parseable diagnostic payload', () => {
  const exported = formatMotionDiagnosticsExport([createRecord(10)], Date.UTC(2026, 5, 12, 9, 0, 0));
  const parsed = JSON.parse(exported);

  assert.equal(parsed.exportedAt, '2026-06-12T09:00:00.000Z');
  assert.equal(parsed.count, 1);
  assert.equal(parsed.records[0].selectedSpeedSource, 'gps');
});

test('appendTimerDiagnosticRecords keeps only the most recent bounded records', () => {
  const records = appendTimerDiagnosticRecords(
    [createTimerRecord(1), createTimerRecord(2)],
    [createTimerRecord(3), createTimerRecord(4)],
    3,
  );

  assert.deepEqual(records.map(record => record.ts), [2, 3, 4]);
});

test('formatCombinedDiagnosticsExport includes motion and timer sections', () => {
  const exported = formatCombinedDiagnosticsExport({
    motionRecords: [createRecord(10)],
    timerRecords: [createTimerRecord(20)],
    exportedAtMs: Date.UTC(2026, 5, 12, 9, 0, 0),
  });
  const parsed = JSON.parse(exported);

  assert.equal(parsed.exportedAt, '2026-06-12T09:00:00.000Z');
  assert.equal(parsed.motionDiagnostics.count, 1);
  assert.equal(parsed.timerDiagnostics.count, 1);
  assert.equal(parsed.timerDiagnostics.records[0].event, 'local_persist');
});
