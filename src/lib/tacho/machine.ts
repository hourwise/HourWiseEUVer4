import {
  MAX_DAILY_DRIVE_EXTENDED,
  MAX_DRIVE,
  MAX_SHIFT_TIME_13H,
  MAX_WEEKLY_DRIVE,
} from './constants';
import type { Database } from '../database.types';
import type { AlertKey } from './alerts';
import { getMaxWorkSeconds } from './timing';
import type { PersistedState, SessionOtherData, TimerMode, Totals, WorkStatus } from './types';

export type TachoMotionState = {
  lastSpeedKmh: number;
  lastSpeedTs: number;
  drivingScore: number;
  movingSinceMs: number;
  stationarySinceMs: number;
};

export type TachoAlertWindowState = {
  prevShiftElapsed: number;
  prevRemaining: {
    work: number;
    drive: number;
    driveExtension: number;
    weeklyDrive: number;
    maxShiftTime: number;
  };
};

export type TachoState = {
  status: WorkStatus;
  sessionId: string | null;
  timerMode: TimerMode;
  workStartTime: string | null;
  currentSegmentStart: string | null;
  totals: Totals;
  legalBreakDisplayTotal: number;
  workCycle: number;
  drivingCycle: number;
  has15minBreak: boolean;
  isDriving: boolean;
  breakStartMs: number;
  weeklyDrivingAccumulator: number;
  shiftExtensionsUsedThisWeek: number;
  maxShiftTimeSeconds: number;
  dailyRestSecondsBeforeShift: number;
  reducedDailyRestTaken: boolean;
  lastTickMs: number;
  lastBreakDuration: number;
  lastBreakEndTime: number;
  motion: TachoMotionState;
  alerts: TachoAlertWindowState;
};

export type TachoRuntimeSnapshot = {
  status: WorkStatus;
  sessionId: string | null;
  timerMode: TimerMode;
  workStartTime: string | null;
  currentSegmentStart: string | null;
  totals: Totals;
  legalBreakDisplayTotal: number;
  workCycle: number;
  drivingCycle: number;
  has15minBreak: boolean;
  isDriving: boolean;
  breakStartMs: number;
  weeklyDrivingAccumulator: number;
  shiftExtensionsUsedThisWeek: number;
  maxShiftTimeSeconds: number;
  dailyRestSecondsBeforeShift: number;
  reducedDailyRestTaken: boolean;
  lastTickMs: number;
  lastBreakDuration: number;
  lastBreakEndTime: number;
  motion?: Partial<TachoMotionState>;
  alerts?: Partial<TachoAlertWindowState>;
};

export type TachoEvent =
  | { type: 'TIMER_TICK'; nowMs: number }
  | { type: 'RESTORE_STATE'; nowMs: number; state: TachoState }
  | { type: 'START_SHIFT_REQUESTED'; nowMs: number }
  | { type: 'END_SHIFT_REQUESTED'; nowMs: number }
  | { type: 'STATUS_CHANGE_REQUESTED'; nowMs: number; nextStatus: WorkStatus }
  | {
      type: 'DRIVING_DECISION_RECEIVED';
      nowMs: number;
      nextDriving: boolean;
      source: 'location' | 'accelerometer' | 'background';
    }
  | {
      type: 'LOCATION_SAMPLE_RECEIVED';
      nowMs: number;
      speedKmh: number;
      accuracy: number;
    }
  | {
      type: 'ACCEL_SAMPLE_RECEIVED';
      nowMs: number;
      x: number;
      y: number;
      z: number;
    }
  | {
      type: 'BACKGROUND_SPEED_SAMPLE_RECEIVED';
      nowMs: number;
      speedKmh: number;
      sampleTs: number;
    };

export type TachoCommand =
  | { type: 'persist' }
  | {
      type: 'sync_session';
      reason: 'status_change' | 'drive_stop' | 'checkpoint' | 'end_shift';
    }
  | { type: 'schedule_alerts'; target: 'compliance' | 'drive' | 'all' }
  | { type: 'cancel_alerts'; target: 'compliance' | 'drive' | 'all' }
  | { type: 'trigger_alert'; alertKey: AlertKey }
  | { type: 'speak_alert'; speechKey: string }
  | { type: 'start_tracking' }
  | { type: 'stop_tracking' };

export type TachoReducerResult = {
  state: TachoState;
  commands: TachoCommand[];
};

type WorkSessionRow = Database['public']['Tables']['work_sessions']['Row'];

const createInitialTotals = (): Totals => ({
  work: 0,
  poa: 0,
  break: 0,
  driving: 0,
});

export const createInitialMotionState = (): TachoMotionState => ({
  lastSpeedKmh: 0,
  lastSpeedTs: 0,
  drivingScore: 0,
  movingSinceMs: 0,
  stationarySinceMs: 0,
});

export const createInitialAlertWindowState = (
  timerMode: TimerMode = '6h',
  maxShiftTimeSeconds: number = MAX_SHIFT_TIME_13H,
): TachoAlertWindowState => ({
  prevShiftElapsed: 0,
  prevRemaining: {
    work: getMaxWorkSeconds(timerMode),
    drive: MAX_DRIVE,
    driveExtension: MAX_DAILY_DRIVE_EXTENDED,
    weeklyDrive: MAX_WEEKLY_DRIVE,
    maxShiftTime: maxShiftTimeSeconds,
  },
});

export const createInitialTachoState = (nowMs: number = Date.now()): TachoState => ({
  status: 'idle',
  sessionId: null,
  timerMode: '6h',
  workStartTime: null,
  currentSegmentStart: null,
  totals: createInitialTotals(),
  legalBreakDisplayTotal: 0,
  workCycle: 0,
  drivingCycle: 0,
  has15minBreak: false,
  isDriving: false,
  breakStartMs: 0,
  weeklyDrivingAccumulator: 0,
  shiftExtensionsUsedThisWeek: 0,
  maxShiftTimeSeconds: MAX_SHIFT_TIME_13H,
  dailyRestSecondsBeforeShift: 0,
  reducedDailyRestTaken: false,
  lastTickMs: nowMs,
  lastBreakDuration: 0,
  lastBreakEndTime: 0,
  motion: createInitialMotionState(),
  alerts: createInitialAlertWindowState(),
});

export const createTachoStateFromPersisted = (
  persistedState: PersistedState,
  nowMs: number = Date.now(),
): TachoState => {
  const timerMode = persistedState.timerMode || '6h';
  const maxShiftTimeSeconds = persistedState.maxShiftTimeSeconds || MAX_SHIFT_TIME_13H;

  return {
    status: persistedState.status,
    sessionId: persistedState.sessionId,
    timerMode,
    workStartTime: persistedState.workStartTime,
    currentSegmentStart: persistedState.currentSegmentStart,
    totals: persistedState.totals || createInitialTotals(),
    legalBreakDisplayTotal: persistedState.legalBreakDisplayTotal || 0,
    workCycle: persistedState.workCycleTotal || 0,
    drivingCycle:
      persistedState.drivingCycleTotal ?? persistedState.totals?.driving ?? 0,
    has15minBreak: persistedState.breakTracker?.has15min ?? false,
    isDriving: !!persistedState.isDriving,
    breakStartMs: persistedState.breakStartMs || 0,
    weeklyDrivingAccumulator: persistedState.weeklyDrivingAccumulator || 0,
    shiftExtensionsUsedThisWeek: persistedState.shiftExtensionsUsedThisWeek || 0,
    maxShiftTimeSeconds,
    dailyRestSecondsBeforeShift: persistedState.dailyRestSecondsBeforeShift || 0,
    reducedDailyRestTaken: !!persistedState.reducedDailyRestTaken,
    lastTickMs: persistedState.lastTickMs || nowMs,
    lastBreakDuration: 0,
    lastBreakEndTime: 0,
    motion: {
      ...createInitialMotionState(),
      ...(persistedState.motionState || {}),
    },
    alerts: {
      ...createInitialAlertWindowState(timerMode, maxShiftTimeSeconds),
      ...(persistedState.alertWindow || {}),
    },
  };
};

export const createTachoStateFromSnapshot = (
  snapshot: TachoRuntimeSnapshot,
): TachoState => ({
  status: snapshot.status,
  sessionId: snapshot.sessionId,
  timerMode: snapshot.timerMode,
  workStartTime: snapshot.workStartTime,
  currentSegmentStart: snapshot.currentSegmentStart,
  totals: snapshot.totals,
  legalBreakDisplayTotal: snapshot.legalBreakDisplayTotal,
  workCycle: snapshot.workCycle,
  drivingCycle: snapshot.drivingCycle,
  has15minBreak: snapshot.has15minBreak,
  isDriving: snapshot.isDriving,
  breakStartMs: snapshot.breakStartMs,
  weeklyDrivingAccumulator: snapshot.weeklyDrivingAccumulator,
  shiftExtensionsUsedThisWeek: snapshot.shiftExtensionsUsedThisWeek,
  maxShiftTimeSeconds: snapshot.maxShiftTimeSeconds,
  dailyRestSecondsBeforeShift: snapshot.dailyRestSecondsBeforeShift,
  reducedDailyRestTaken: snapshot.reducedDailyRestTaken,
  lastTickMs: snapshot.lastTickMs,
  lastBreakDuration: snapshot.lastBreakDuration,
  lastBreakEndTime: snapshot.lastBreakEndTime,
  motion: {
    ...createInitialMotionState(),
    ...(snapshot.motion || {}),
  },
  alerts: {
    ...createInitialAlertWindowState(snapshot.timerMode, snapshot.maxShiftTimeSeconds),
    ...(snapshot.alerts || {}),
  },
});

export const createTachoStateFromSessionRow = (
  session: WorkSessionRow,
  fallbackState: TachoState,
): TachoState => {
  const otherData = (session.other_data ?? null) as SessionOtherData | null;
  const status = (session.status ?? fallbackState.status) as WorkStatus;
  const timerMode = otherData?.timerMode === '9h' ? '9h' : '6h';
  // The database does not persist a generic current segment start for "working".
  // Rehydration falls back to the shift start for working sessions and uses the
  // dedicated break/POA timestamps when those statuses are active.
  const currentSegmentStart =
    status === 'break'
      ? (session.current_break_start || session.start_time)
      : status === 'poa'
        ? (session.current_poa_start || session.start_time)
        : (otherData?.currentSegmentStart || session.start_time);
  const breakStartMs =
    status === 'break'
      ? new Date(session.current_break_start || currentSegmentStart || session.start_time).getTime()
      : 0;
  const totals: Totals = {
    work: (session.total_work_minutes || 0) * 60,
    poa: (session.total_poa_minutes || 0) * 60,
    break: (session.total_break_minutes || 0) * 60,
    driving: (otherData?.driving || 0) * 60,
  };

  return {
    ...fallbackState,
    status,
    sessionId: session.id,
    timerMode,
    workStartTime: session.start_time,
    currentSegmentStart,
    totals,
    legalBreakDisplayTotal: (otherData?.legalBreakDisplay || 0) * 60,
    workCycle:
      typeof otherData?.workCycle === 'number'
        ? otherData.workCycle * 60
        : totals.work + totals.driving,
    drivingCycle:
      typeof otherData?.drivingCycle === 'number'
        ? otherData.drivingCycle * 60
        : totals.driving,
    has15minBreak: !!otherData?.has15minBreak,
    isDriving: !!otherData?.isDriving,
    breakStartMs: Number.isFinite(breakStartMs) ? breakStartMs : 0,
    dailyRestSecondsBeforeShift:
      typeof otherData?.dailyRestSecondsBeforeShift === 'number'
        ? otherData.dailyRestSecondsBeforeShift
        : 0,
    reducedDailyRestTaken: !!otherData?.reducedDailyRestTaken,
  };
};

export const toPersistedTachoState = (
  state: TachoState,
  userStorageKey?: string | null,
): PersistedState => ({
  status: state.status,
  sessionId: state.sessionId,
  userStorageKey,
  timerMode: state.timerMode,
  workStartTime: state.workStartTime,
  currentSegmentStart: state.currentSegmentStart,
  totals: state.totals,
  legalBreakDisplayTotal: state.legalBreakDisplayTotal,
  workCycleTotal: state.workCycle,
  drivingCycleTotal: state.drivingCycle,
  breakTracker: { has15min: state.has15minBreak },
  isDriving: state.isDriving,
  lastTickMs: state.lastTickMs,
  weeklyDrivingAccumulator: state.weeklyDrivingAccumulator,
  shiftExtensionsUsedThisWeek: state.shiftExtensionsUsedThisWeek,
  maxShiftTimeSeconds: state.maxShiftTimeSeconds,
  dailyRestSecondsBeforeShift: state.dailyRestSecondsBeforeShift,
  reducedDailyRestTaken: state.reducedDailyRestTaken,
  breakStartMs: state.breakStartMs,
  motionState: state.motion,
  alertWindow: state.alerts,
});
