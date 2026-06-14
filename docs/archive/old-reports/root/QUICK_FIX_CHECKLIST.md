# Quick Fix Checklist

A step-by-step guide to apply all critical integration fixes.

---

## ✅ PHASE 1: Replace Modified Files (5 mins)

### Step 1.1: Update runtimeStorage.ts
**File**: `src/lib/tacho/runtimeStorage.ts`
**Action**: Replace with content from `runtimeStorage.FIXED.ts`
**Changes**:
- Added `validatePersistedState()` function
- Added error handling in load/save functions
- Validates segment start timestamps before returning

**After this step:**
```bash
npm run lint src/lib/tacho/runtimeStorage.ts
```
Should have no errors.

### Step 1.2: Update display.ts
**File**: `src/lib/tacho/display.ts`
**Action**: Replace with content from `display.FIXED.ts`
**Changes**:
- Added `isValidTimestamp()` validation
- Added defensive checks for all timestamp parsing
- Clamped negative remaining times to 0
- Added detailed warnings for invalid timestamps

**After this step:**
```bash
npm run lint src/lib/tacho/display.ts
```
Should have no errors.

---

## ✅ PHASE 2: Update useWorkTimer.ts (15 mins)

### Step 2.1: Add Helper Functions (Top of file, before export)
**Location**: `useWorkTimer.ts` - before the `useWorkTimer` export
**Add**:
```typescript
// Week boundary detection for weekly driving resets
export const calculateWeekStartMs = (nowMs: number): number => {
  const now = new Date(nowMs);
  const day = now.getUTCDay();
  const diff = now.getUTCDate() - day + (day === 0 ? -6 : 1);
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

// Retry logic for critical DB updates
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

// Timestamp validation
const isValidSegmentStart = (iso: string | null): boolean => {
  if (!iso) return false;
  try {
    const ts = new Date(iso).getTime();
    return !isNaN(ts) && ts > 0 && ts <= Date.now() + 86400000;
  } catch {
    return false;
  }
};
```

### Step 2.2: Fix persistFromRefs (Around LINE 330-370)
**Current code**:
```typescript
if (statusRef.current !== 'idle' && segmentStartRef.current) {
  const segStartMs = new Date(segmentStartRef.current).getTime();
  const elapsedSinceSegment = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
  if (elapsedSinceSegment > 0) {
    applyElapsed(elapsedSinceSegment, statusRef.current, isDrivingRef.current);
    segmentStartRef.current = new Date(nowMs).toISOString();
  }
}
```

**Replace with**:
```typescript
if (statusRef.current !== 'idle' && segmentStartRef.current) {
  if (!isValidSegmentStart(segmentStartRef.current)) {
    console.warn('Invalid segmentStart, resetting to now:', segmentStartRef.current);
    segmentStartRef.current = new Date(nowMs).toISOString();
    return; // Skip this persist cycle
  }
  
  const segStartMs = new Date(segmentStartRef.current).getTime();
  const elapsedSinceSegment = Math.max(0, Math.floor((nowMs - segStartMs) / 1000));
  
  // Sanity check: elapsed should be < 24 hours
  if (elapsedSinceSegment > 0 && elapsedSinceSegment < 86400) {
    applyElapsed(elapsedSinceSegment, statusRef.current, isDrivingRef.current);
    segmentStartRef.current = new Date(nowMs).toISOString();
  } else if (elapsedSinceSegment >= 86400) {
    console.warn('Abnormal elapsed time detected (>24h), possible clock issue');
    segmentStartRef.current = new Date(nowMs).toISOString();
  }
}
```

### Step 2.3: Fix startWork Weekly Driving (Around LINE 913-925)
**Current code**:
```typescript
const weeklyDrivingMins = await workSessionService.fetchWeeklyDrivingMinutes(userId);
weeklyDrivingAccumulatorRef.current = weeklyDrivingMins * 60;
```

**Replace with**:
```typescript
// Fetch weekly driving, accounting for week resets
const now = Date.now();
let weeklyDrivingAccumulator = 0;

if (!lastTickMsRef.current || shouldResetWeeklyDriving(lastTickMsRef.current, now)) {
  // Week boundary crossed or first session, fetch from DB
  const weeklyDrivingMins = await workSessionService.fetchWeeklyDrivingMinutes(userId);
  weeklyDrivingAccumulator = weeklyDrivingMins * 60;
} else {
  // Same week, use potentially cached value
  weeklyDrivingAccumulator = weeklyDrivingAccumulatorRef.current;
}

weeklyDrivingAccumulatorRef.current = weeklyDrivingAccumulator;
```

### Step 2.4: Fix updateTotalsAndSwitchStatus (Around LINE 729-747)
**Current code**:
```typescript
if (prevStatus === 'break' && transition.lastBreakDuration > 0) {
  legalBreakDisplayTotalRef.current += getDisplayedBreakSeconds(transition.lastBreakDuration);
}

workCycleRef.current = transition.nextWorkCycle;
drivingCycleRef.current = transition.nextDrivingCycle;
```

**Replace with**:
```typescript
if (prevStatus === 'break' && transition.lastBreakDuration > 0) {
  legalBreakDisplayTotalRef.current += getDisplayedBreakSeconds(transition.lastBreakDuration);
}

// CRITICAL FIX: Clear break start time when exiting break status
if (prevStatus === 'break' && newStatus !== 'break') {
  breakStartTimeRef.current = 0;
}

workCycleRef.current = transition.nextWorkCycle;
drivingCycleRef.current = transition.nextDrivingCycle;
```

### Step 2.5: Fix commitAndFlipDriving (Around LINE 554-577)
**Current code**:
```typescript
if (!suppressDriveStopSyncRef.current && !nextDriving && sessionIdRef.current && statusRef.current === 'working') {
  Promise.resolve(
    supabase
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
    .single()
  )
    .then(({ data, error }) => {
      if (error) console.warn('Drive stop DB sync error:', error);
      else if (data) { setSessionData(data); sessionDataRef.current = data; }
    })
    .catch((e: unknown) => console.warn('Drive stop DB sync failed:', e));
}
```

**Replace with**:
```typescript
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
    3,
  )
    .then((result: DBUpdateResult) => {
      if (result.success && result.data) {
        setSessionData(result.data);
        sessionDataRef.current = result.data;
      } else if (!result.success) {
        console.warn('Drive stop DB sync failed after retries:', result.error);
      }
    })
    .catch((e: unknown) => console.warn('Drive stop DB sync exception:', e));
}
```

### Step 2.6: Fix endWork onConfirm (Around LINE 1092-1110)
**Locate this section**:
```typescript
const endedShift = createEndedShiftResetState(Date.now());
statusRef.current = endedShift.status;
sessionIdRef.current = endedShift.sessionId;
```

**Add after the sessionIdRef update**:
```typescript
breakStartTimeRef.current = 0;  // Explicitly clear break state
```

---

## ✅ PHASE 3: Validation (5 mins)

### Step 3.1: TypeScript Check
```bash
npm run tsc -- src/hooks/useWorkTimer.ts src/lib/tacho/*.ts
```
**Expected**: No errors

### Step 3.2: Lint Check
```bash
npm run lint src/hooks/useWorkTimer.ts src/lib/tacho/
```
**Expected**: No new errors

### Step 3.3: Run Type Tests
```bash
npm test -- useWorkTimer.test.ts
```
**If tests exist**: Should pass

---

## ✅ PHASE 4: Manual Testing (varies)

### Priority Order:
1. [ ] Start a shift, take a break, exit break - verify legalBreakTotal
2. [ ] Do the same 2-3 times in succession (no app restart) - verify accumulation
3. [ ] Force close app during a break session, reopen - verify breakStartMs not stale
4. [ ] Run for 2+ minutes across a simulated week boundary - verify weekly reset
5. [ ] Disable network, trigger drive stop event, re-enable network - verify retry

---

## ✅ PHASE 5: Deploy

### Before deploying to production:
```bash
# Build
npm run build

# Run all tests
npm test

# Check bundle size didn't increase significantly
npm run analyze

# Create a release candidate tag
git tag -a rc-v$(date +%Y%m%d)-integration-fix -m "Integration fixes for tacho split"
```

---

## 📋 Quick Reference: What Each Fix Does

| Fix # | Issue | File(s) | Impact | Priority |
|-------|-------|---------|--------|----------|
| 1 | breakStartMs stale | useWorkTimer, display | Incorrect break duration | CRITICAL |
| 2 | Weekly driving no reset | useWorkTimer | Money miscalculation | CRITICAL |
| 3 | DB update fails silently | useWorkTimer | Data loss on network failure | HIGH |
| 4 | Invalid timestamps crash | display, runtimeStorage | NaN in calculations | HIGH |
| 5 | Break status inconsistent | useWorkTimer | State corruption | MEDIUM |
| 6 | Negative remaining times shown | display | UI shows wrong values | MEDIUM |
| 7 | Persistence validation missing | runtimeStorage | Corrupted state loaded | MEDIUM |

---

## ⏱️ Estimated Time

- **Phase 1**: 5 min (file replacement)
- **Phase 2**: 15 min (code edits)
- **Phase 3**: 5 min (validation)
- **Phase 4**: 10-30 min (manual testing)
- **Phase 5**: 5-10 min (deploy prep)

**Total**: ~45-60 minutes

---

## 🆘 Troubleshooting

**Problem**: TypeScript errors after applying fixes
**Solution**: 
- Check that import statements match your actual file names
- Run `npm install` to ensure all types are available
- Check that the fix functions are placed in the right scope

**Problem**: React hooks dependency warning after changes
**Solution**:
- The new helper functions don't depend on hooks
- If you see warnings, they're likely from the surrounding useCallback()
- Add them to dependency array if needed

**Problem**: App crashes after fixes
**Solution**:
- Check console for the specific error
- Verify all string replacements matched exactly
- Run `npm run build` to catch syntax errors

---

## ✅ Sign-off Checklist

- [ ] All Phase 2 code changes applied
- [ ] Phase 3 validation passes
- [ ] Phase 4 manual tests complete
- [ ] No console errors on app startup
- [ ] Break duration tracking works correctly
- [ ] Weekly driving resets at week boundary
- [ ] DB syncs recover from network failures
- [ ] Ready for production deployment

**Date Completed**: ___________
**Tested By**: ___________
**Approved By**: ___________

