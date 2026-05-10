import {
  MAX_WORK_6H,
  MAX_WORK_9H,
  TACHO_15_MIN,
  TACHO_30_MIN,
  TACHO_45_MIN,
} from './constants';
import type {
  BreakEvaluationInput,
  BreakEvaluationResult,
  CounterState,
  TimerMode,
  WorkStatus,
} from './types';

export const toLocalDateString = (date: Date) => {
  const offset = date.getTimezoneOffset();
  const localDate = new Date(date.getTime() - offset * 60 * 1000);
  return localDate.toISOString().split('T')[0];
};

export const getTachographBreakSeconds = (seconds: number) => {
  const minutes = Math.floor(seconds / 60);
  return Math.floor(minutes / 15) * 15 * 60;
};

export const getDisplayedBreakSeconds = (seconds: number) => {
  if (seconds < TACHO_15_MIN) return 0;
  if (seconds < TACHO_45_MIN) return TACHO_15_MIN;
  return seconds;
};

export const getLegalBreakContributionSeconds = (
  seconds: number,
  hasPrior15minBreak: boolean,
) => {
  if (hasPrior15minBreak) {
    if (seconds < TACHO_30_MIN) return 0;
    return seconds;
  }

  return getDisplayedBreakSeconds(seconds);
};

export const getMaxWorkSeconds = (timerMode: TimerMode) =>
  timerMode === '6h' ? MAX_WORK_6H : MAX_WORK_9H;

export const applyElapsedToCounters = (
  counterState: CounterState,
  elapsedSec: number,
  lastStatus: WorkStatus,
  lastDriving: boolean,
): CounterState => {
  if (elapsedSec <= 0 || lastStatus === 'idle') return counterState;

  const nextState: CounterState = {
    totals: { ...counterState.totals },
    workCycle: counterState.workCycle,
    drivingCycle: counterState.drivingCycle,
  };

  if (lastStatus === 'break') {
    nextState.totals.break += elapsedSec;
    return nextState;
  }

  if (lastStatus === 'poa') {
    nextState.totals.poa += elapsedSec;
    return nextState;
  }

  if (lastDriving) {
    nextState.totals.driving += elapsedSec;
    nextState.drivingCycle += elapsedSec;
  } else {
    nextState.totals.work += elapsedSec;
  }

  nextState.workCycle += elapsedSec;
  return nextState;
};

export const evaluateBreakCompletion = ({
  breakSeconds,
  has15minBreak,
  timerMode,
}: BreakEvaluationInput): BreakEvaluationResult => {
  const tachoBreakSeg = getTachographBreakSeconds(breakSeconds);
  const isQualifyingBreak =
    tachoBreakSeg >= TACHO_45_MIN ||
    (has15minBreak && tachoBreakSeg >= TACHO_30_MIN);

  if (isQualifyingBreak) {
    return {
      nextHas15minBreak: false,
      nextTimerMode: '6h',
      resetWorkCycle: true,
      resetDrivingCycle: true,
      isQualifyingBreak: true,
    };
  }

  if (tachoBreakSeg >= TACHO_15_MIN) {
    return {
      nextHas15minBreak: true,
      nextTimerMode: timerMode === '6h' ? '9h' : timerMode,
      resetWorkCycle: false,
      resetDrivingCycle: false,
      isQualifyingBreak: false,
    };
  }

  return {
    nextHas15minBreak: has15minBreak,
    nextTimerMode: timerMode,
    resetWorkCycle: false,
    resetDrivingCycle: false,
    isQualifyingBreak: false,
  };
};
