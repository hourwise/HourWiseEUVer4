import type { AlertKey } from './alerts';

export type TimerMode = '6h' | '9h';

export type WorkStatus = 'idle' | 'working' | 'poa' | 'break';

export type Totals = {
  work: number;
  poa: number;
  break: number;
  driving: number;
};

export type BreakTracker = {
  has15min: boolean;
};

export type ScheduledAlertScope = 'compliance' | 'drive';

export type ScheduledAlertDescriptor = {
  identifier: string;
  scope: ScheduledAlertScope;
  alertKey: AlertKey;
  scheduleKey: string;
  fireDateMs: number;
  secondsFromNow: number;
  channelId: string;
  scheduledAtMs: number;
};

export type PersistedState = {
  stateVersion?: number;
  userId?: string | null;
  status: WorkStatus;
  sessionId: string | null;
  userStorageKey?: string | null;
  lastSavedAtMs?: number;
  lastCheckpointAtMs?: number | null;
  activitySegmentStartTime?: string | null;
  drivingDetectionPaused?: boolean;
  timerMode: TimerMode;
  workStartTime: string | null;
  currentSegmentStart: string | null;
  totals: Totals;
  legalBreakDisplayTotal?: number;
  workCycleTotal: number;
  drivingCycleTotal?: number;
  breakTracker: BreakTracker;
  isDriving: boolean;
  lastTickMs: number;
  weeklyDrivingAccumulator: number;
  shiftExtensionsUsedThisWeek?: number;
  maxShiftTimeSeconds?: number;
  dailyRestSecondsBeforeShift?: number;
  reducedDailyRestTaken?: boolean;
  breakStartMs?: number;
  motionState?: {
    lastSpeedKmh: number;
    lastSpeedTs: number;
    lastLocationTs?: number;
    lastLatitude?: number | null;
    lastLongitude?: number | null;
    lastAccuracyM?: number | null;
    lastComputedSpeedKmh?: number | null;
    lastSelectedSpeedSource?: 'gps' | 'computed' | 'none';
    drivingScore: number;
    movingSinceMs: number;
    stationarySinceMs: number;
    pendingTransitionType?: 'moving' | 'stationary' | null;
    pendingTransitionStartedAtMs?: number;
  };
  alertWindow?: {
    prevShiftElapsed: number;
    prevRemaining: {
      work: number;
      drive: number;
      driveExtension: number;
      weeklyDrive: number;
      maxShiftTime: number;
    };
  };
};

export type CounterState = {
  totals: Totals;
  workCycle: number;
  drivingCycle: number;
};

export type BreakEvaluationInput = {
  breakSeconds: number;
  has15minBreak: boolean;
  timerMode: TimerMode;
};

export type BreakEvaluationResult = {
  nextHas15minBreak: boolean;
  nextTimerMode: TimerMode;
  resetWorkCycle: boolean;
  resetDrivingCycle: boolean;
  isQualifyingBreak: boolean;
};

export type DisplayState = {
  work: number;
  poa: number;
  break: number;
  legalBreak: number;
  driving: number;
  shift: number;
  workTimeRemaining: number;
  drivingTimeRemaining: number;
  maxShiftTimeRemaining: number;
  // Alias for backward compatibility
  spreadoverRemaining?: number;
  breakDuration: number;
  poaDuration: number;
  weeklyDrivingRemaining: number;
  lastBreakDuration: number;
  lastBreakEndTime: number;
};

export type LiveDisplayInput = {
  nowMs: number;
  status: WorkStatus;
  segmentStartIso: string | null;
  workStartIso: string | null;
  totals: Totals;
  legalBreakDisplayTotal: number;
  workCycle: number;
  drivingCycle: number;
  isDriving: boolean;
  timerMode: TimerMode;
  weeklyDrivingAccumulator: number;
  breakStartMs: number;
  has15minBreak: boolean;
  lastBreakDuration: number;
  lastBreakEndTime: number;
  maxDriveSeconds: number;
  maxWeeklyDriveSeconds: number;
  maxShiftTimeSeconds: number;
  // Alias for backward compatibility
  spreadOverSeconds?: number;
};

export type EndShiftSnapshot = {
  finalTotals: Totals;
  effectiveWorkCycle: number;
  effectiveDrivingCycle: number;
  effectiveHas15minBreak: boolean;
  currentShift: {
    start_time: string | null;
    end_time: string;
    total_work_minutes: number;
    total_break_minutes: number;
    total_poa_minutes: number;
    other_data: {
      driving: number;
      has15minBreak: boolean;
      workCycle: number;
      drivingCycle: number;
      shiftDurationMinutes?: number;
      usedShiftExtension?: boolean;
      exceededShiftSpreadLimit?: boolean;
      dailyRestSecondsBeforeShift?: number;
      reducedDailyRestTaken?: boolean;
      activitySegmentStartTime?: string | null;
      workIncludesDrivingReference?: boolean;
    };
  };
};

export type EndShiftSnapshotInput = {
  nowMs: number;
  status: WorkStatus;
  segmentStartIso: string | null;
  breakStartMs: number;
  workStartIso: string | null;
  totals: Totals;
  workCycle: number;
  drivingCycle: number;
  has15minBreak: boolean;
  timerMode: TimerMode;
};

export type DrivingTransitionInput = {
  nowMs: number;
  status: WorkStatus;
  segmentStartIso: string | null;
  currentDriving: boolean;
  nextDriving: boolean;
};

export type DrivingTransitionResult = {
  shouldFlip: boolean;
  elapsedSecToApply: number;
  nextSegmentStartIso: string | null;
  nextSegmentStartMs: number | null;
};

export type StatusTransitionInput = {
  nowMs: number;
  prevStatus: WorkStatus;
  nextStatus: WorkStatus;
  segmentStartIso: string | null;
  breakStartMs: number;
  has15minBreak: boolean;
  timerMode: TimerMode;
  workCycle: number;
  drivingCycle: number;
};

export type StatusTransitionResult = {
  elapsedSecToApply: number;
  nowIso: string;
  nextSegmentStartMs: number;
  nextTimerMode: TimerMode;
  nextHas15minBreak: boolean;
  nextWorkCycle: number;
  nextDrivingCycle: number;
  nextBreakStartMs: number;
  lastBreakDuration: number;
  lastBreakEndTime: number;
};

export type SessionOtherData = Record<string, any> & {
  driving?: number;
  has15minBreak?: boolean;
  workCycle?: number;
  drivingCycle?: number;
  legalBreakDisplay?: number;
  currentSegmentStart?: string | null;
  activitySegmentStartTime?: string | null;
  isDriving?: boolean;
  workIncludesDrivingReference?: boolean;
  timerMode?: TimerMode;
  shiftDurationMinutes?: number;
  usedShiftExtension?: boolean;
  exceededShiftSpreadLimit?: boolean;
  dailyRestSecondsBeforeShift?: number;
  reducedDailyRestTaken?: boolean;
};

export type SessionCounterSnapshotInput = {
  totals: Totals;
  legalBreakDisplayTotal: number;
  has15minBreak: boolean;
  workCycle: number;
  drivingCycle: number;
  timerMode: TimerMode;
  existingOtherData?: SessionOtherData | null;
};

export type SessionCheckpointPayloadInput = SessionCounterSnapshotInput & {
  currentSegmentStart: string | null;
  activitySegmentStartTime?: string | null;
  status: WorkStatus;
  breakStartMs: number;
  currentPoaStart: string | null;
  isDriving?: boolean;
};

export type SessionStatusUpdatePayloadInput = SessionCounterSnapshotInput & {
  status: WorkStatus;
  currentSegmentStart: string;
  activitySegmentStartTime?: string | null;
  currentBreakStart: string | null;
  currentPoaStart: string | null;
  isDriving?: boolean;
};

export type ShiftLifecycleState = {
  status: WorkStatus;
  sessionId: string | null;
  timerMode: TimerMode;
  workStartTime: string | null;
  currentSegmentStart: string | null;
  totals: Totals;
  legalBreakDisplayTotal: number;
  workCycle: number;
  drivingCycle: number;
  breakTracker: BreakTracker;
  isDriving: boolean;
  breakStartMs: number;
  weeklyDrivingAccumulator: number;
  lastTickMs: number;
  display: DisplayState;
  drivingScore: number;
  stationarySinceMs: number;
  lastSpeedKmh: number;
  lastSpeedTs: number;
  lastBreakDuration: number;
  lastBreakEndTime: number;
  prevWorkRemaining: number;
  prevDriveRemaining: number;
  prevWeeklyDriveRemaining: number;
  prevMaxShiftTimeRemaining: number;
  // Alias for backward compatibility
  prevSpreadRemaining?: number;
};

export type EndShiftSummaryInput = {
  finalTotals: Totals;
  score: number;
  violations: string[];
};

export type EndShiftSummary = {
  totals: Totals;
  score: number;
  violations: string[];
};

export type EndShiftSummaryState = EndShiftSummary & {
  isConfirming: boolean;
};

export type EndSessionRequestInput = {
  sessionId: string;
  finalTotals: Totals;
  effectiveHas15minBreak: boolean;
  effectiveWorkCycle: number;
  effectiveDrivingCycle: number;
  shiftMetadata?: SessionOtherData;
  existingOtherData?: SessionOtherData | null;
  latitude?: number;
  longitude?: number;
  score?: number;
  violations?: string[];
};

export type EndSessionRequest = {
  sessionId: string;
  workMins: number;
  poaMins: number;
  breakMins: number;
  drivingMins: number;
  has15minBreak: boolean;
  existingOtherData: SessionOtherData;
  latitude?: number;
  longitude?: number;
  complianceScore?: number;
  complianceViolations?: string[];
};

export type BackgroundSpeedDecisionInput = {
  nowMs: number;
  sampleTs: number;
  speedKmh: number;
  isDriving: boolean;
  drivingThresholdKmh: number;
  stillThresholdKmh: number;
  immediateStartThresholdKmh: number;
  lowSpeedStopThresholdKmh: number;
  staleThresholdMs: number;
};

export type BackgroundSpeedDecision = {
  shouldApply: boolean;
  nextDriving: boolean | null;
};

export type LocationSampleDecisionInput = {
  nowMs: number;
  accuracy: number;
  speedKmh: number;
  lastSpeedKmh: number;
  lastSpeedTs: number;
  isDriving: boolean;
  movingSinceMs: number;
  stationarySinceMs: number;
  stillThresholdKmh: number;
  activeDrivingStillThresholdKmh?: number;
  lowSpeedStopThresholdKmh: number;
  drivingThresholdKmh: number;
  immediateStartThresholdKmh: number;
  movingConfirmMs: number;
  stationaryConfirmMs: number;
  accelScoreMax: number;
};

export type LocationSampleDecision = {
  shouldIgnore: boolean;
  nextDriving: boolean | null;
  drivingChangedAtMs: number | null;
  nextMovingSinceMs: number;
  nextStationarySinceMs: number;
  nextDrivingScore: number | null;
  lastSpeedKmh: number;
  lastSpeedTs: number;
};

export type AccelerometerDecisionInput = {
  nowMs: number;
  x: number;
  y: number;
  z: number;
  lastSpeedTs: number;
  lastSpeedKmh: number;
  currentDrivingScore: number;
  isDriving: boolean;
  gpsStaleThresholdMs: number;
  drivingThresholdKmh: number;
  stillThresholdKmh: number;
  motionMagnitudeThreshold: number;
  accelScoreMax: number;
  accelDriveThreshold: number;
  accelStopThreshold: number;
};

export type AccelerometerDecision = {
  shouldIgnore: boolean;
  nextDrivingScore: number;
  nextDriving: boolean;
  drivingChangedAtMs: number | null;
};
