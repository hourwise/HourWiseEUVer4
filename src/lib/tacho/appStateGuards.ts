export const RESUME_REFRESH_DEBOUNCE_MS = 1500;

export const shouldRunDebouncedResumeRefresh = ({
  nowMs,
  lastRefreshAtMs,
  isRefreshInFlight,
  debounceMs = RESUME_REFRESH_DEBOUNCE_MS,
}: {
  nowMs: number;
  lastRefreshAtMs: number;
  isRefreshInFlight: boolean;
  debounceMs?: number;
}): boolean => {
  if (isRefreshInFlight) return false;
  if (lastRefreshAtMs <= 0) return true;
  return nowMs - lastRefreshAtMs >= debounceMs;
};

export const shouldRunInitialRestore = ({
  restoreKey,
  lastRestoreKey,
}: {
  restoreKey: string | null;
  lastRestoreKey: string | null;
}): boolean => !!restoreKey && restoreKey !== lastRestoreKey;
