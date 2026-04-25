import type {
  EndSessionRequest,
  EndSessionRequestInput,
  EndShiftSummary,
  EndShiftSummaryInput,
} from './types';

const toMins = (seconds: number) => Math.max(0, Math.floor(seconds / 60));

export const buildEndShiftSummary = ({
  finalTotals,
  score,
  violations,
}: EndShiftSummaryInput): EndShiftSummary => ({
  totals: finalTotals,
  score,
  violations,
});

export const buildEndSessionRequest = ({
  sessionId,
  finalTotals,
  effectiveHas15minBreak,
  effectiveWorkCycle,
  effectiveDrivingCycle,
  existingOtherData,
  latitude,
  longitude,
  score,
  violations,
}: EndSessionRequestInput): EndSessionRequest => ({
  sessionId,
  workMins: toMins(finalTotals.work),
  poaMins: toMins(finalTotals.poa),
  breakMins: toMins(finalTotals.break),
  drivingMins: toMins(finalTotals.driving),
  has15minBreak: effectiveHas15minBreak,
  existingOtherData: {
    ...(existingOtherData ?? {}),
    workCycle: toMins(effectiveWorkCycle),
    drivingCycle: toMins(effectiveDrivingCycle),
  },
  latitude,
  longitude,
  complianceScore: score,
  complianceViolations: violations,
});
