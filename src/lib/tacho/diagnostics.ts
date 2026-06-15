import type { TimerMode, Totals, WorkStatus } from './types';

export const MOTION_DIAGNOSTIC_RING_LIMIT = 150;
export const TIMER_DIAGNOSTIC_RING_LIMIT = 500;

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

export type TimerDiagnosticEvent =
  | 'app_state'
  | 'resume_refresh'
  | 'restore'
  | 'local_persist'
  | 'db_sync'
  | 'status_change'
  | 'alerts'
  | 'reducer_commands'
  | 'background_task'
  | 'tracking'
  | 'end_shift';

export type TimerDiagnosticSnapshot = {
  status: WorkStatus;
  sessionId: string | null;
  workStartTime: string | null;
  currentSegmentStart: string | null;
  activitySegmentStartTime: string | null;
  totals: Totals;
  legalBreakDisplayTotal: number;
  workCycle: number;
  drivingCycle: number;
  timerMode: TimerMode;
  isDriving: boolean;
  breakStartMs: number;
  lastTickMs: number;
  lastCheckpointAtMs?: number | null;
};

export type TimerDiagnosticRecord = {
  ts: number;
  event: TimerDiagnosticEvent;
  sessionId: string | null;
  source?: string;
  reason?: string;
  statusBefore?: WorkStatus | null;
  statusAfter?: WorkStatus | null;
  snapshotBefore?: TimerDiagnosticSnapshot | null;
  snapshotAfter?: TimerDiagnosticSnapshot | null;
  success?: boolean;
  errorSummary?: string | null;
  details?: Record<string, unknown>;
};

export const appendMotionDiagnosticRecords = (
  existing: MotionDiagnosticRecord[],
  records: MotionDiagnosticRecord[],
  limit = MOTION_DIAGNOSTIC_RING_LIMIT,
): MotionDiagnosticRecord[] => {
  if (limit <= 0) return [];
  return [...existing, ...records].slice(-limit);
};

export const appendTimerDiagnosticRecords = (
  existing: TimerDiagnosticRecord[],
  records: TimerDiagnosticRecord[],
  limit = TIMER_DIAGNOSTIC_RING_LIMIT,
): TimerDiagnosticRecord[] => {
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

export const formatCombinedDiagnosticsExport = ({
  motionRecords,
  timerRecords,
  exportedAtMs = Date.now(),
}: {
  motionRecords: MotionDiagnosticRecord[];
  timerRecords: TimerDiagnosticRecord[];
  exportedAtMs?: number;
}): string => JSON.stringify({
  exportedAt: new Date(exportedAtMs).toISOString(),
  motionDiagnostics: {
    count: motionRecords.length,
    records: motionRecords,
  },
  timerDiagnostics: {
    count: timerRecords.length,
    records: timerRecords,
  },
}, null, 2);
