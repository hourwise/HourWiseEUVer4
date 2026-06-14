import { evaluateBreakCompletion } from './timing';
import {
  exceededShiftSpreadLimit,
  getShiftDurationSeconds,
  usedShiftExtension,
} from './spread';
import type { EndShiftSnapshot, EndShiftSnapshotInput } from './types';

const toMins = (seconds: number) => Math.max(0, Math.floor(seconds / 60));

export const buildEndShiftSnapshot = ({
  nowMs,
  status,
  segmentStartIso,
  breakStartMs,
  workStartIso,
  totals,
  workCycle,
  drivingCycle,
  has15minBreak,
  timerMode,
}: EndShiftSnapshotInput): EndShiftSnapshot => {
  const finalTotals = { ...totals };
  let effectiveWorkCycle = workCycle;
  let effectiveDrivingCycle = drivingCycle;
  let effectiveHas15minBreak = has15minBreak;

  if (status === 'break') {
    const segmentStartMs = segmentStartIso ? new Date(segmentStartIso).getTime() : nowMs;
    const breakStartedMs = breakStartMs || segmentStartMs;
    const finalBreakSec = Math.max(0, Math.floor((nowMs - breakStartedMs) / 1000));
    const breakEvaluation = evaluateBreakCompletion({
      breakSeconds: finalBreakSec,
      has15minBreak: effectiveHas15minBreak,
      timerMode,
    });

    if (breakEvaluation.resetWorkCycle) {
      effectiveWorkCycle = 0;
    }
    if (breakEvaluation.resetDrivingCycle) {
      effectiveDrivingCycle = 0;
    }
    effectiveHas15minBreak = breakEvaluation.nextHas15minBreak;
  }

  const shiftDurationSeconds = getShiftDurationSeconds(workStartIso, nowMs);
  const usedSpreadExtension = usedShiftExtension(shiftDurationSeconds);
  const exceededSpreadLimit = exceededShiftSpreadLimit(shiftDurationSeconds);

  return {
    finalTotals,
    effectiveWorkCycle,
    effectiveDrivingCycle,
    effectiveHas15minBreak,
    currentShift: {
      start_time: workStartIso,
      end_time: new Date(nowMs).toISOString(),
      total_work_minutes: toMins(finalTotals.work),
      total_break_minutes: toMins(finalTotals.break),
      total_poa_minutes: toMins(finalTotals.poa),
      other_data: {
        driving: toMins(finalTotals.driving),
        has15minBreak: effectiveHas15minBreak,
        workCycle: toMins(effectiveWorkCycle),
        drivingCycle: toMins(effectiveDrivingCycle),
        shiftDurationMinutes: toMins(shiftDurationSeconds),
        usedShiftExtension: usedSpreadExtension,
        exceededShiftSpreadLimit: exceededSpreadLimit,
        workIncludesDrivingReference: true,
      },
    },
  };
};
