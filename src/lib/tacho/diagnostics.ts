import type { Totals } from './types';

export const MOTION_DIAGNOSTIC_RING_LIMIT = 150;

export type MotionDiagnosticSpeedSource =
  | 'gps'
  | 'computed'
  | 'accelerometer'
  | 'none';

export type MotionDiagnosticSource =
  | 'foreground_location'
  | 'background_location'
  | 'background_resume'
  | 'accelerometer';

export type MotionDiagnosticRecord = {
  receiptTimeMs: number;
  sampleTimeMs: number;
  appState: 'active' | 'background' | 'inactive' | 'unknown';
  source: MotionDiagnosticSource;
  gpsSpeedKmh: number | null;
  computedSpeedKmh: number | null;
  selectedSpeedKmh: number | null;
  selectedSpeedSource: MotionDiagnosticSpeedSource;
  accuracyM: number | null;
  previousDriving: boolean;
  nextDriving: boolean;
  movingSinceMs: number;
  stationarySinceMs: number;
  ignoredReason: string | null;
  reducerEventApplied: string | null;
  totalsBefore: Totals | null;
  totalsAfter: Totals | null;
};

export const appendMotionDiagnosticRecords = (
  existing: MotionDiagnosticRecord[],
  records: MotionDiagnosticRecord[],
  limit = MOTION_DIAGNOSTIC_RING_LIMIT,
): MotionDiagnosticRecord[] => {
  if (limit <= 0) return [];
  return [...existing, ...records].slice(-limit);
};

export const formatMotionDiagnosticsExport = (
  records: MotionDiagnosticRecord[],
  exportedAtMs: number = Date.now(),
): string => JSON.stringify({
  exportedAt: new Date(exportedAtMs).toISOString(),
  count: records.length,
  records,
}, null, 2);

