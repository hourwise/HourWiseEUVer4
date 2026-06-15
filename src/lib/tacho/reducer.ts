import type { AlertKey } from './alerts';
import {
  BACKGROUND_SAMPLE_STALE_MS,
  DRIVING_STOP_TAIL_MS,
  DRIVING_IMMEDIATE_START_THRESHOLD_KMH,
  DRIVING_SPEED_THRESHOLD_KMH,
  LOW_SPEED_STOP_THRESHOLD_KMH,
  MAX_SHIFT_TIME_13H,
  MAX_SHIFT_TIME_15H,
  STILL_SPEED_THRESHOLD_KMH,
} from './constants';
import { evaluateBackgroundSpeedDecision } from './drivingDetection';
import { createInitialTachoState, type TachoEvent, type TachoReducerResult, type TachoState } from './machine';
import { applyCatchUpElapsed } from './rehydration';
import { deriveDisplayFromTachoState, getDriveExtensionRemaining } from './selectors';
import { getDisplayedBreakSeconds } from './timing';
import {
  deriveDrivingTransition,
  deriveStatusTransition,
  getStatusTransitionAlertKey,
} from './transitions';

const crossedDown = (current: number, prev: number, threshold: number) =>
  current <= threshold && prev > threshold;

const crossedUp = (current: number, prev: number, threshold: number) =>
  current >= threshold && prev < threshold;

export const evaluateAlertThresholdCommands = (
  state: TachoState,
  nowMs: number,
): TachoReducerResult => {
  const display = deriveDisplayFromTachoState(state, nowMs);
  if (state.status !== 'working' && state.status !== 'poa') {
    return {
      state: {
        ...state,
        lastBreakDuration: display.lastBreakDuration,
        lastBreakEndTime: display.lastBreakEndTime,
      },
      commands: [],
    };
  }

  const currentWork = display.workTimeRemaining;
  const currentDrive = display.drivingTimeRemaining;
  const currentDriveExtension = getDriveExtensionRemaining(display);
  const currentMaxShiftTime = display.maxShiftTimeRemaining;
  const currentWeeklyDrive = display.weeklyDrivingRemaining;
  const currentShiftElapsed = display.shift;
  const prevWork = state.alerts.prevRemaining.work;
  const prevDrive = state.alerts.prevRemaining.drive;
  const prevDriveExtension = state.alerts.prevRemaining.driveExtension;
  const prevWeeklyDrive = state.alerts.prevRemaining.weeklyDrive;

  const commands: TachoReducerResult['commands'] = [];
  const pushAlert = (alertKey: AlertKey) => commands.push({ type: 'trigger_alert', alertKey });

  if (state.status === 'working') {
    if (crossedDown(currentWork, prevWork, 30 * 60)) pushAlert('workWarn30mRemaining');
    if (crossedDown(currentWork, prevWork, 15 * 60)) pushAlert('workWarn15mRemaining');
    if (crossedDown(currentWork, prevWork, 5 * 60)) pushAlert('workWarn5mRemaining');
    if (crossedDown(currentWork, prevWork, 0)) pushAlert('workLimitReached');
  }

  if (state.status === 'working' && state.isDriving) {
    if (crossedDown(currentDrive, prevDrive, 30 * 60)) pushAlert('driveCycleWarn30mRemaining');
    if (crossedDown(currentDrive, prevDrive, 15 * 60)) pushAlert('driveCycleWarn15mRemaining');
    if (crossedDown(currentDrive, prevDrive, 5 * 60)) pushAlert('driveCycleWarn5mRemaining');
    if (crossedDown(currentDrive, prevDrive, 0)) pushAlert('driveCycleLimitReached');
    if (crossedDown(currentDriveExtension, prevDriveExtension, 30 * 60)) pushAlert('driveExtensionWarn30mRemaining');
    if (crossedDown(currentDriveExtension, prevDriveExtension, 15 * 60)) pushAlert('driveExtensionWarn15mRemaining');
    if (crossedDown(currentDriveExtension, prevDriveExtension, 5 * 60)) pushAlert('driveExtensionWarn5mRemaining');
    if (crossedDown(currentDriveExtension, prevDriveExtension, 0)) pushAlert('driveExtensionLimitReached');
  }

  if (crossedDown(currentWeeklyDrive, prevWeeklyDrive, 3600)) pushAlert('weeklyDriveWarn1hRemaining');
  if (crossedDown(currentWeeklyDrive, prevWeeklyDrive, 0)) pushAlert('weeklyDriveLimitReached');
  if (crossedUp(currentShiftElapsed, state.alerts.prevShiftElapsed, MAX_SHIFT_TIME_13H - 30 * 60)) {
    pushAlert('shift13hLimitSoon');
  }
  if (crossedUp(currentShiftElapsed, state.alerts.prevShiftElapsed, MAX_SHIFT_TIME_13H)) {
    pushAlert('shift13hLimitReached');
  }
  if (state.maxShiftTimeSeconds > MAX_SHIFT_TIME_13H) {
    if (crossedUp(currentShiftElapsed, state.alerts.prevShiftElapsed, MAX_SHIFT_TIME_15H - 30 * 60)) {
      pushAlert('shift15hLimitSoon');
    }
    if (crossedUp(currentShiftElapsed, state.alerts.prevShiftElapsed, MAX_SHIFT_TIME_15H)) {
      pushAlert('shift15hLimitReached');
    }
  }

  return {
    state: {
      ...state,
      lastBreakDuration: display.lastBreakDuration,
      lastBreakEndTime: display.lastBreakEndTime,
      alerts: {
        prevShiftElapsed: currentShiftElapsed,
        prevRemaining: {
          work: currentWork,
          drive: currentDrive,
          driveExtension: currentDriveExtension,
          weeklyDrive: currentWeeklyDrive,
          maxShiftTime: currentMaxShiftTime,
        },
      },
    },
    commands,
  };
};

const reduceTimerTick = (state: TachoState, nowMs: number): TachoReducerResult => {
  const catchUp = applyCatchUpElapsed({
    nowMs,
    status: state.status,
    segmentStartIso: state.currentSegmentStart,
    lastTickMs: state.lastTickMs,
    isDriving: state.isDriving,
    counterState: {
      totals: state.totals,
      workCycle: state.workCycle,
      drivingCycle: state.drivingCycle,
    },
  });

  const nextState: TachoState = {
    ...state,
    totals: catchUp.counterState.totals,
    workCycle: catchUp.counterState.workCycle,
    drivingCycle: catchUp.counterState.drivingCycle,
    currentSegmentStart: catchUp.nextSegmentStartIso,
    lastTickMs: catchUp.nextLastTickMs,
  };

  const thresholdResult = evaluateAlertThresholdCommands(nextState, nowMs);
  return {
    state: thresholdResult.state,
    commands: catchUp.appliedElapsedSec > 0
      ? [{ type: 'persist' }, ...thresholdResult.commands]
      : thresholdResult.commands,
  };
};

const reduceStatusChange = (
  state: TachoState,
  nowMs: number,
  nextStatus: TachoState['status'],
): TachoReducerResult => {
  const prevStatus = state.status;
  const transition = deriveStatusTransition({
    nowMs,
    prevStatus,
    nextStatus,
    segmentStartIso: state.currentSegmentStart,
    breakStartMs: state.breakStartMs,
    has15minBreak: state.has15minBreak,
    timerMode: state.timerMode,
    workCycle: state.workCycle,
    drivingCycle: state.drivingCycle,
  });

  const catchUp = applyCatchUpElapsed({
    nowMs,
    status: prevStatus,
    segmentStartIso: state.currentSegmentStart,
    lastTickMs: state.currentSegmentStart ? new Date(state.currentSegmentStart).getTime() : state.lastTickMs,
    isDriving: state.isDriving,
    counterState: {
      totals: state.totals,
      workCycle: state.workCycle,
      drivingCycle: state.drivingCycle,
    },
  });

  const legalBreakDisplayTotal =
    prevStatus === 'break' && transition.lastBreakDuration > 0
      ? state.legalBreakDisplayTotal + getDisplayedBreakSeconds(transition.lastBreakDuration)
      : state.legalBreakDisplayTotal;

  const nextState: TachoState = {
    ...state,
    status: nextStatus,
    timerMode: transition.nextTimerMode,
    has15minBreak: transition.nextHas15minBreak,
    totals: catchUp.counterState.totals,
    legalBreakDisplayTotal,
    workCycle: transition.nextWorkCycle,
    drivingCycle: transition.nextDrivingCycle,
    currentSegmentStart: new Date(transition.nextSegmentStartMs).toISOString(),
    breakStartMs: transition.nextBreakStartMs,
    lastTickMs: transition.nextSegmentStartMs,
    lastBreakDuration: transition.lastBreakDuration,
    lastBreakEndTime: transition.lastBreakEndTime,
    isDriving: nextStatus === 'working' && prevStatus === 'working' ? state.isDriving : false,
    motion:
      nextStatus === 'working' && prevStatus === 'working'
        ? state.motion
        : {
            ...state.motion,
            movingSinceMs: 0,
            stationarySinceMs: 0,
            pendingTransitionType: null,
            pendingTransitionStartedAtMs: 0,
          },
  };

  const thresholdResult = evaluateAlertThresholdCommands(nextState, nowMs);
  const commands: TachoReducerResult['commands'] = [
    { type: 'cancel_alerts', target: 'all' },
    { type: 'persist' },
    { type: 'sync_session', reason: 'status_change' },
  ];

  const speechKey = getStatusTransitionAlertKey(prevStatus, nextStatus);
  if (speechKey) {
    commands.push({ type: 'speak_alert', speechKey });
  }
  if (nextStatus === 'working' || nextStatus === 'poa') {
    commands.push({ type: 'schedule_alerts', target: 'compliance' });
  }

  return {
    state: thresholdResult.state,
    commands: [...commands, ...thresholdResult.commands],
  };
};

const reduceDrivingDecision = (
  state: TachoState,
  nowMs: number,
  nextDriving: boolean,
  effectiveTransitionMs?: number | null,
): TachoReducerResult => {
  if (state.status !== 'working') {
    return { state, commands: [] };
  }

  const transition = deriveDrivingTransition({
    nowMs,
    status: state.status,
    segmentStartIso: state.currentSegmentStart,
    currentDriving: state.isDriving,
    nextDriving,
  });

  if (!transition.shouldFlip) {
    return { state, commands: [] };
  }

  const catchUp = transition.elapsedSecToApply > 0
    ? applyCatchUpElapsed({
        nowMs,
        status: 'working',
        segmentStartIso: state.currentSegmentStart,
        lastTickMs: state.currentSegmentStart ? new Date(state.currentSegmentStart).getTime() : state.lastTickMs,
        isDriving: state.isDriving,
        counterState: {
          totals: state.totals,
          workCycle: state.workCycle,
          drivingCycle: state.drivingCycle,
        },
        maxCatchUpSeconds: transition.elapsedSecToApply + 1,
      })
    : {
        counterState: {
          totals: state.totals,
          workCycle: state.workCycle,
          drivingCycle: state.drivingCycle,
        },
      };

  const stopOverrunSec =
    state.isDriving &&
    !nextDriving &&
    typeof effectiveTransitionMs === 'number' &&
    Number.isFinite(effectiveTransitionMs) &&
    effectiveTransitionMs < nowMs
      ? Math.max(
          0,
          Math.floor((nowMs - Math.min(nowMs, effectiveTransitionMs + DRIVING_STOP_TAIL_MS)) / 1000),
        )
      : 0;
  const drivingCorrection = Math.min(stopOverrunSec, catchUp.counterState.totals.driving);
  const drivingCycleCorrection = Math.min(stopOverrunSec, catchUp.counterState.drivingCycle);
  const correctedCounterState =
    drivingCorrection > 0 || drivingCycleCorrection > 0
      ? {
          totals: {
            ...catchUp.counterState.totals,
            driving: catchUp.counterState.totals.driving - drivingCorrection,
          },
          workCycle: catchUp.counterState.workCycle,
          drivingCycle: catchUp.counterState.drivingCycle - drivingCycleCorrection,
        }
      : catchUp.counterState;

  const nextState: TachoState = {
    ...state,
    totals: correctedCounterState.totals,
    workCycle: correctedCounterState.workCycle,
    drivingCycle: correctedCounterState.drivingCycle,
    isDriving: nextDriving,
    currentSegmentStart: transition.nextSegmentStartIso,
    lastTickMs: transition.nextSegmentStartMs ?? nowMs,
    motion: {
      ...state.motion,
      movingSinceMs: 0,
      stationarySinceMs: 0,
      pendingTransitionType: null,
      pendingTransitionStartedAtMs: 0,
    },
  };

  const commands: TachoReducerResult['commands'] = [{ type: 'persist' }];
  if (nextDriving) {
    commands.push({ type: 'schedule_alerts', target: 'drive' });
  } else {
    commands.push({ type: 'cancel_alerts', target: 'all' });
    commands.push({ type: 'schedule_alerts', target: 'compliance' });
    commands.push({ type: 'sync_session', reason: 'drive_stop' });
  }

  return { state: nextState, commands };
};

const reduceBackgroundSpeedSample = (
  state: TachoState,
  nowMs: number,
  receiptTs: number,
  speedKmh: number,
  sampleTs: number,
): TachoReducerResult => {
  if (
    !Number.isFinite(sampleTs) ||
    sampleTs <= state.motion.lastLocationTs
  ) {
    return { state, commands: [] };
  }

  const isStaleSample = receiptTs - sampleTs > BACKGROUND_SAMPLE_STALE_MS;
  const nextStateWithSample = {
    ...state,
    motion: {
      ...state.motion,
      lastSpeedKmh: speedKmh,
      lastSpeedTs: sampleTs,
      lastLocationTs: sampleTs,
      lastAccuracyM: null,
    },
  };

  if (isStaleSample) {
    if (state.status === 'working' && state.isDriving && speedKmh <= STILL_SPEED_THRESHOLD_KMH) {
      return reduceDrivingDecision(nextStateWithSample, sampleTs, false, sampleTs);
    }

    return { state, commands: [] };
  }

  const decision = evaluateBackgroundSpeedDecision({
    nowMs: receiptTs,
    sampleTs,
    speedKmh,
    isDriving: state.isDriving,
    drivingThresholdKmh: DRIVING_SPEED_THRESHOLD_KMH,
    stillThresholdKmh: STILL_SPEED_THRESHOLD_KMH,
    immediateStartThresholdKmh: DRIVING_IMMEDIATE_START_THRESHOLD_KMH,
    lowSpeedStopThresholdKmh: LOW_SPEED_STOP_THRESHOLD_KMH,
    staleThresholdMs: BACKGROUND_SAMPLE_STALE_MS,
  });

  if (!decision.shouldApply || decision.nextDriving === null) {
    return { state: nextStateWithSample, commands: [] };
  }

  return reduceDrivingDecision(
    nextStateWithSample,
    nowMs,
    decision.nextDriving,
    decision.nextDriving ? null : sampleTs,
  );
};

export const reduceTachoEvent = (
  state: TachoState,
  event: TachoEvent,
): TachoReducerResult => {
  switch (event.type) {
    case 'RESTORE_STATE':
      return { state: event.state, commands: [] };
    case 'TIMER_TICK':
      return reduceTimerTick(state, event.nowMs);
    case 'STATUS_CHANGE_REQUESTED':
      return reduceStatusChange(state, event.nowMs, event.nextStatus);
    case 'DRIVING_DECISION_RECEIVED':
      return reduceDrivingDecision(
        state,
        event.nowMs,
        event.nextDriving,
        event.effectiveTransitionMs,
      );
    case 'BACKGROUND_SPEED_SAMPLE_RECEIVED':
      return reduceBackgroundSpeedSample(
        state,
        event.nowMs,
        event.receiptTs ?? event.nowMs,
        event.speedKmh,
        event.sampleTs,
      );
    default:
      return { state, commands: [] };
  }
};

export const reduceFromInitialState = (event: TachoEvent): TachoReducerResult =>
  reduceTachoEvent(createInitialTachoState(event.nowMs), event);
