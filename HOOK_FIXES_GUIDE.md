// CRITICAL FIXES FOR useWorkTimer.ts
// These are the key changes needed to address integration issues

// ============================================================================
// FIX #1: Clear breakStartMs when exiting break status
// ============================================================================
// LOCATION: useWorkTimer.ts - updateTotalsAndSwitchStatus function
// AROUND: LINE 729-747

// BEFORE (BUGGY):
/*
  if (prevStatus === 'break' && transition.lastBreakDuration > 0) {
    legalBreakDisplayTotalRef.current += getDisplayedBreakSeconds(transition.lastBreakDuration);
  }

  workCycleRef.current = transition.nextWorkCycle;
  drivingCycleRef.current = transition.nextDrivingCycle;
  // ... no clearance of breakStartMs
*/

// AFTER (FIXED):
/*
  if (prevStatus === 'break' && transition.lastBreakDuration > 0) {
    legalBreakDisplayTotalRef.current += getDisplayedBreakSeconds(transition.lastBreakDuration);
  }

  // CRITICAL: Clear break start time when exiting break status
  if (prevStatus === 'break' && newStatus !== 'break') {
    breakStartTimeRef.current = 0;
  }

  workCycleRef.current = transition.nextWorkCycle;
  drivingCycleRef.current = transition.nextDrivingCycle;
*/

// ============================================================================
// FIX #2: Implement weekly driving reset logic
// ============================================================================
// LOCATION: useWorkTimer.ts - NEW HELPER FUNCTION before useWorkTimer export

export const calculateWeekStartMs = (nowMs: number): number => {
  const now = new Date(nowMs);
  const day = now.getUTCDay();
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1); // Adjust when day is Sunday
  const weekStart = new Date(now.setUTCDate(diff));
  weekStart.setUTCHours(0, 0, 0, 0);
  return weekStart.getTime();
};

export const shouldResetWeeklyDriving = (
  lastRefreshMs: number,
  currentMs: number,
): boolean => {
  const lastWeekStart = calculateWeekStartMs(lastRefreshMs);
  const currentWeekStart = calculateWeekStartMs(currentMs);
  return currentWeekStart > lastWeekStart;
};

// THEN IN startWork function:
// AROUND: LINE 932-934

// BEFORE (BUGGY):
/*
  const weeklyDrivingMins = await workSessionService.fetchWeeklyDrivingMinutes(userId);
  weeklyDrivingAccumulatorRef.current = weeklyDrivingMins * 60;
*/

// AFTER (FIXED):
/*
  // Fetch weekly driving, accounting for week resets
  const now = Date.now();
  let weeklyDrivingAccumulator = 0;
  
  // Check if we've crossed a week boundary since last session
  if (!lastTickMsRef.current || shouldResetWeeklyDriving(lastTickMsRef.current, now)) {
    // Week boundary crossed or first session, fetch from DB
    const weeklyDrivingMins = await workSessionService.fetchWeeklyDrivingMinutes(userId);
    weeklyDrivingAccumulator = weeklyDrivingMins * 60;
  } else {
    // Same week, could use cached value if available
    weeklyDrivingAccumulator = weeklyDrivingAccumulatorRef.current;
  }
  
  weeklyDrivingAccumulatorRef.current = weeklyDrivingAccumulator;
*/

// ============================================================================
// FIX #3: Add retry logic with rollback for critical DB updates
// ============================================================================
// LOCATION: useWorkTimer.ts - NEW HELPER FUNCTION before useWorkTimer export

interface DBUpdateResult {
  success: boolean;
  data?: any;
  error?: any;
}

export const updateSessionWithRetry = async (
  update: () => Promise<any>,
  maxRetries: number = 3,
): Promise<DBUpdateResult> => {
  let lastError;
  
  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      const { data, error } = await update();
      if (error) {
        lastError = error;
        const shouldRetry = attempt < maxRetries - 1;
        if (shouldRetry) {
          // Exponential backoff: 100ms, 200ms, 400ms
          await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
          continue;
        }
      }
      return { success: !error, data, error };
    } catch (e) {
      lastError = e;
      const shouldRetry = attempt < maxRetries - 1;
      if (shouldRetry) {
        await new Promise(resolve => setTimeout(resolve, 100 * Math.pow(2, attempt)));
        continue;
      }
    }
  }
  
  return { success: false, error: lastError };
};

// THEN in commitAndFlipDriving:
// AROUND: LINE 554-577

// BEFORE (BUGGY - fire and forget):
/*
  if (!suppressDriveStopSyncRef.current && !nextDriving && sessionIdRef.current && statusRef.current === 'working') {
    Promise.resolve(
      supabase
      .from('work_sessions')
      .update(buildDriveStopUpdatePayload({...}))
      .eq('id', sessionIdRef.current)
      .select()
      .single()
    )
      .then(({ data, error }) => {
        if (error) console.warn('Drive stop DB sync error:', error);
        else if (data) { setSessionData(data); sessionDataRef.current = data; }
      })
      .catch((e: unknown) => console.warn('Drive stop DB sync failed:', e));
  }
*/

// AFTER (FIXED - with retry):
/*
  if (!suppressDriveStopSyncRef.current && !nextDriving && sessionIdRef.current && statusRef.current === 'working') {
    updateSessionWithRetry(
      () => supabase
        .from('work_sessions')
        .update(buildDriveStopUpdatePayload({
          totals: totalsRef.current,
          legalBreakDisplayTotal: legalBreakDisplayTotalRef.current,
          has15minBreak: breakTrackerRef.current.has15min,
          workCycle: workCycleRef.current,
          drivingCycle: drivingCycleRef.current,
          timerMode: timerModeRef.current,
          existingOtherData: sessionDataRef.current?.other_data,
          currentSegmentStart: segmentStartRef.current,
        }))
        .eq('id', sessionIdRef.current)
        .select()
        .single(),
      3, // max retries
    )
      .then((result: DBUpdateResult) => {
        if (result.success && result.data) {
          setSessionData(result.data);
          sessionDataRef.current = result.data;
        } else {
          console.warn('Drive stop DB sync failed after retries:', result.error);
        }
      })
      .catch((e: unknown) => console.warn('Drive stop DB sync exception:', e));
  }
*/

// ============================================================================
// FIX #4: Validate segment start before using in calculations
// ============================================================================
// LOCATION: useWorkTimer.ts - applyElapsed callback
// AROUND: LINE 243-257

// ADD HELPER:
const isValidSegmentStart = (iso: string | null): boolean => {
  if (!iso) return false;
  try {
    const ts = new Date(iso).getTime();
    return !isNaN(ts) && ts > 0 && ts <= Date.now();
  } catch {
    return false;
  }
};

// THEN use in persistFromRefs:
// AROUND: LINE 335-341

// BEFORE (BUGGY):
/*
  if (statusRef.current !== 'idle' && segmentStartRef.current) {
    const segStartMs = new Date(segmentStartRef.current).getTime();
    const elapsedSinceSegment = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
    if (elapsedSinceSegment > 0) {
      applyElapsed(elapsedSinceSegment, statusRef.current, isDrivingRef.current);
      segmentStartRef.current = new Date(nowMs).toISOString();
    }
  }
*/

// AFTER (FIXED):
/*
  if (statusRef.current !== 'idle' && segmentStartRef.current) {
    if (!isValidSegmentStart(segmentStartRef.current)) {
      console.warn('Invalid segmentStart, resetting to now:', segmentStartRef.current);
      segmentStartRef.current = new Date(nowMs).toISOString();
      return;
    }
    
    const segStartMs = new Date(segmentStartRef.current).getTime();
    const elapsedSinceSegment = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
    if (elapsedSinceSegment > 0 && elapsedSinceSegment < 86400) { // Sanity check: < 1 day
      applyElapsed(elapsedSinceSegment, statusRef.current, isDrivingRef.current);
      segmentStartRef.current = new Date(nowMs).toISOString();
    } else if (elapsedSinceSegment >= 86400) {
      console.warn('Abnormal elapsed time detected (>24h), possible clock issue');
      segmentStartRef.current = new Date(nowMs).toISOString();
    }
  }
*/

// ============================================================================
// FIX #5: Ensure breakStartMs is cleared on idle status
// ============================================================================
// LOCATION: useWorkTimer.ts - endWork function onConfirm callback
// AROUND: LINE 1092-1110

// ADD after line 1102:
/*
  breakStartTimeRef.current = 0;  // Explicitly clear break state
*/

// ============================================================================
// SUMMARY OF CHANGES NEEDED
// ============================================================================
/*
1. Add helper functions for weekly reset detection
2. Add retry logic wrapper for critical DB updates
3. Add validation helpers for timestamps
4. Clear breakStartMs when exiting break status
5. Reimplement weekly driving check at shift start
6. Add timestamp validation in persistFromRefs
7. Explicitly clear breakStartMs in endWork onConfirm
8. Update display.ts with defensive checks (see display.FIXED.ts)
9. Update runtimeStorage.ts with validation (see runtimeStorage.FIXED.ts)
10. Add error handling around ISO string parsing
*/

