import test from 'node:test';
import assert from 'node:assert/strict';

import {
  appendMotionDiagnosticRecords,
  formatMotionDiagnosticsExport,
  type MotionDiagnosticRecord,
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

