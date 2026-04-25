import { evaluateBreakCompletion } from './timing';
import type {
  DrivingTransitionInput,
  DrivingTransitionResult,
  StatusTransitionInput,
  StatusTransitionResult,
  WorkStatus,
} from './types';

export const deriveDrivingTransition = ({
  nowMs,
  status,
  segmentStartIso,
  currentDriving,
  nextDriving,
}: DrivingTransitionInput): DrivingTransitionResult => {
  if (nextDriving === currentDriving) {
    return {
      shouldFlip: false,
      elapsedSecToApply: 0,
      nextSegmentStartIso: segmentStartIso,
    };
  }

  if (status !== 'working' || !segmentStartIso) {
    return {
      shouldFlip: true,
      elapsedSecToApply: 0,
      nextSegmentStartIso: segmentStartIso,
    };
  }

  const segmentStartMs = new Date(segmentStartIso).getTime();
  const elapsedSecToApply = Math.max(0, Math.floor((nowMs - segmentStartMs) / 1000));

  return {
    shouldFlip: true,
    elapsedSecToApply,
    nextSegmentStartIso: new Date(nowMs).toISOString(),
  };
};

export const deriveStatusTransition = ({
  nowMs,
  prevStatus,
  nextStatus,
  segmentStartIso,
  breakStartMs,
  has15minBreak,
  timerMode,
  workCycle,
  drivingCycle,
}: StatusTransitionInput): StatusTransitionResult => {
  const segmentStartMs = segmentStartIso ? new Date(segmentStartIso).getTime() : nowMs;
  const elapsedSecToApply = Math.max(0, Math.floor((nowMs - segmentStartMs) / 1000));
  const nowIso = new Date(nowMs).toISOString();

  let nextTimerMode = timerMode;
  let nextHas15minBreak = has15minBreak;
  let nextWorkCycle = workCycle;
  let nextDrivingCycle = drivingCycle;
  let nextBreakStartMs = 0;
  let lastBreakDuration = 0;
  let lastBreakEndTime = 0;

  if (prevStatus === 'break') {
    const breakStartedMs = breakStartMs || segmentStartMs;
    const fullBreakSec = Math.max(0, Math.floor((nowMs - breakStartedMs) / 1000));
    const breakEvaluation = evaluateBreakCompletion({
      breakSeconds: fullBreakSec,
      has15minBreak,
      timerMode,
    });

    nextHas15minBreak = breakEvaluation.nextHas15minBreak;
    nextTimerMode = breakEvaluation.nextTimerMode;
    if (breakEvaluation.resetWorkCycle) {
      nextWorkCycle = 0;
    }
    if (breakEvaluation.resetDrivingCycle) {
      nextDrivingCycle = 0;
    }
  }

  if (nextStatus === 'break') {
    nextBreakStartMs = nowMs;
  } else if (prevStatus === 'break') {
    const breakStartedMs = breakStartMs || nowMs;
    lastBreakDuration = Math.max(0, Math.floor((nowMs - breakStartedMs) / 1000));
    lastBreakEndTime = nowMs;
  }

  return {
    elapsedSecToApply,
    nowIso,
    nextTimerMode,
    nextHas15minBreak,
    nextWorkCycle,
    nextDrivingCycle,
    nextBreakStartMs,
    lastBreakDuration,
    lastBreakEndTime,
  };
};

export const getStatusTransitionAlertKey = (
  prevStatus: WorkStatus,
  nextStatus: WorkStatus,
): string | null => {
  if (prevStatus === 'working' && nextStatus === 'break') return 'audioBreakStarted';
  if (prevStatus === 'break' && nextStatus === 'working') return 'audioResumeWork';
  if (prevStatus === 'working' && nextStatus === 'poa') return 'audioPoaStarted';
  if (prevStatus === 'poa' && nextStatus === 'working') return 'audioResumeWork';
  if (prevStatus === 'poa' && nextStatus === 'break') return 'audioBreakStarted';
  return null;
};
