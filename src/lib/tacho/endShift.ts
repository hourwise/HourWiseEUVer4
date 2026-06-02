import type {
  EndSessionRequest,
  EndSessionRequestInput,
  EndShiftSummary,
  EndShiftSummaryInput,
  EndShiftSummaryState,
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

export const createEndShiftSummaryState = (
  input: EndShiftSummaryInput,
): EndShiftSummaryState => ({
  ...buildEndShiftSummary(input),
  isConfirming: false,
});

export const setEndShiftSummaryConfirming = <T extends EndShiftSummaryState>(
  summary: T,
  isConfirming: boolean,
): T => ({
  ...summary,
  isConfirming,
} as T);

export const getEndShiftConfirmationError = (
  sessionId: string | null,
): 'missing_active_session' | null => (
  sessionId ? null : 'missing_active_session'
);

export const buildEndSessionRequest = ({
  sessionId,
  finalTotals,
  effectiveHas15minBreak,
  effectiveWorkCycle,
  effectiveDrivingCycle,
  shiftMetadata,
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
    ...(shiftMetadata ?? {}),
    workCycle: toMins(effectiveWorkCycle),
    drivingCycle: toMins(effectiveDrivingCycle),
  },
  latitude,
  longitude,
  complianceScore: score,
  complianceViolations: violations,
});
