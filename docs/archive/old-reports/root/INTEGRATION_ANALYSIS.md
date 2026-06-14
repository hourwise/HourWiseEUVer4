# Integration Analysis: useWorkTimer Hook & Tacho Library Split

## Overview
The `useWorkTimer.ts` hook has been split into 12 constituent files in `src/lib/tacho/`. This analysis identifies potential integration issues and inconsistencies.

---

## CRITICAL ISSUES FOUND

### 1. **🔴 CRITICAL: breakStartMs Type Inconsistency**
**Location**: Across multiple files
**Severity**: HIGH - Causes incorrect break duration calculations

**Problem:**
- `lifecycle.ts` → `createStartedShiftState()`: `breakStartMs: 0` (number)
- `lifecycle.ts` → `createEndedShiftResetState()`: `breakStartMs: 0` (number)
- `useWorkTimer.ts` LINE 159: `breakStartTimeRef.current` initialized as `number` (milliseconds)
- `types.ts` → `PersistedState`: `breakStartMs?: number` (optional)
- `display.ts` LINE 74: Uses `breakStartMs || segmentStartMs` directly
- `sessionPayloads.ts` LINE 109: Wraps in `new Date(breakStartMs || ...)`

**Issue**: 
When break status ends and transitions back to working, the hook uses `breakStartTimeRef.current` directly from persisted state. However, in `display.ts`, it's treated as if it's always set. If `breakStartMs` comes from a previous session where it wasn't properly cleaned up, calculations will be wrong.

**Expected vs Actual**:
```typescript
// useWorkTimer.ts - LINE 159
breakStartTimeRef.current: number = 0; // Milliseconds

// But in runtimeStorage.ts - LINE 23-27
saveActiveTimerState() saves breakStartMs from ref
// If this value persists incorrectly, next session will have wrong timing

// display.ts - LINE 74 assumes it's always valid
breakStartMs || segmentStartMs // Could be stale from previous session
```

**Fix Required**:
```typescript
// In useWorkTimer.ts - ensure breakStartTimeRef is cleared on status transitions
// When transitioning FROM break, set it to 0
if (prevStatus === 'break' && statusRef.current !== 'break') {
  breakStartTimeRef.current = 0; // Clear it!
}
```

---

### 2. **🔴 CRITICAL: Weekly Driving Accumulator Reset Issue**
**Location**: `useWorkTimer.ts` vs `lifecycle.ts`
**Severity**: HIGH - Money/earnings miscalculation

**Problem:**
- `lifecycle.ts` → `createStartedShiftState()` LINE 39: Sets `weeklyDrivingAccumulator` from parameter
- `lifecycle.ts` → `createEndedShiftResetState()` LINE 77: Resets to `0`
- `useWorkTimer.ts` LINE 924: Fetches weekly driving with `workSessionService.fetchWeeklyDrivingMinutes(userId)`
- `useWorkTimer.ts` LINE 506: Also fetches in `refreshSession()`

**Issue**: 
The weekly driving accumulator should roll over at specific times (weekly reset). Currently:
1. On shift start, it fetches from DB and sets the ref
2. On shift end, it resets to 0
3. But there's no check for WHEN the weekly period resets

If you end a shift at 23:55 and start a new one at 00:05 (crossing week boundary), the accumulator isn't recalculated.

**Expected**: Weekly driving resets on Monday (or periodic reset boundary)
**Actual**: Only resets when shift ends

---

### 3. **🟠 HIGH: Missing bidirectional sync for isDriving state**
**Location**: `useWorkTimer.ts` LINE 535-577 (commitAndFlipDriving)
**Severity**: MEDIUM-HIGH

**Problem:**
```typescript
// useWorkTimer.ts - LINE 535-577
const commitAndFlipDriving = useCallback((nextDriving: boolean, onFlipped?: () => void) => {
  // ...applies elapsed time...
  isDrivingRef.current = nextDriving;
  setIsDriving(nextDriving); // Updates state
  
  // But then sends to DB asynchronously
  Promise.resolve(
    supabase.from('work_sessions')
      .update(buildDriveStopUpdatePayload(...))
      .eq('id', sessionIdRef.current)
  )
  // What if this fails? isDriving state is already updated locally
  // Next time app refreshes, it might read old isDriving from DB
});
```

**Issue**: 
- Local state is updated immediately
- DB update happens asynchronously
- If DB update fails silently, there's no rollback
- Future `refreshSession()` calls will use the DB state (which is stale)

**Scenario**:
1. Driver starts driving
2. `isDriving` set to true locally, DB update sent
3. Network fails, DB update never happens
4. Driver stops, app syncs with DB
5. DB still has `isDriving: false` (from before)
6. Local state synced to DB's false value
7. Driving time lost

---

### 4. **🟠 HIGH: Display state and actual counters can drift**
**Location**: `display.ts` vs `useWorkTimer.ts`
**Severity**: MEDIUM-HIGH

**Problem:**
The display state is derived every second (LINE 811-841), but the actual `totalsRef` counters are only updated when:
- A status transitions (updateTotalsAndSwitchStatus)
- Elapsed time applies (applyElapsed)
- Session is persisted (persistFromRefs)
- Session refreshes (refreshSession)

**Issue**: 
```typescript
// useWorkTimer.ts - LINE 815
const nextDisplay = deriveLiveDisplayState({
  nowMs,
  status: statusRef.current,
  totals: totalsRef.current, // STALE if not just updated
  // ...
});

// This DERIVES from current totals, doesn't update them
// So totalsRef.work might be 120s
// But nextDisplay.work calculates on-the-fly adding current segment elapsed
// totalsRef never gets updated UNTIL next applyElapsed
```

**Scenario**:
1. App crashes or is force-closed
2. OnResume, Display gets re-rendered with stale totals
3. `lastTickMs` hasn't been updated
4. First calculation might count the "dead time" incorrectly

---

### 5. **🟠 MEDIUM: Break status doesn't persist isDriving correctly**
**Location**: `transitions.ts` vs `useWorkTimer.ts`
**Severity**: MEDIUM

**Problem:**
When transitioning to/from break:
```typescript
// useWorkTimer.ts - LINE 713-773 (updateTotalsAndSwitchStatus)
const transition = deriveStatusTransition({
  // ...but doesn't pass isDriving!
  // isDriving stays the same throughout break
});

// If user was driving, took a break, then resume:
// isDriving should be false during break
// But the code doesn't explicitly handle this
```

When in break status:
- `isDriving` isn't used (break doesn't track driving)
- But if you immediately exit break and resume working, what was the driving state?

**Expected**: Break transitions should not affect driving state
**Actual**: Works, but not explicitly handled - relies on code flow

---

### 6. **🟡 MEDIUM: legalBreakDisplayTotal accumulation can be inconsistent**
**Location**: `useWorkTimer.ts` LINE 732, `display.ts` LINE 57-64
**Severity**: MEDIUM

**Problem:**
The `legalBreakDisplayTotal` gets updated in two places:
1. When exiting break (increases by `getDisplayedBreakSeconds`)
2. Derived in display state based on multiple conditions

```typescript
// useWorkTimer.ts - LINE 732
if (prevStatus === 'break' && transition.lastBreakDuration > 0) {
  legalBreakDisplayTotalRef.current += getDisplayedBreakSeconds(transition.lastBreakDuration);
}

// display.ts - LINE 57-64
const completedLegalBreakDisplay =
  legalBreakDisplayTotal > 0
    ? legalBreakDisplayTotal // Use this
    : !shouldClearLastBreak && lastBreakDuration > 0
      ? getLegalBreakContributionSeconds(lastBreakDuration, has15minBreak)
      : status !== 'break' && nextTotals.break > 0
        ? getDisplayedBreakSeconds(nextTotals.break)
        : 0;
```

**Issue**: 
If display is calculated BEFORE the total is updated, it might use fallback logic. If calculated AFTER, it uses the explicit total. This can create UI flicker or inconsistency.

---

### 7. **🟡 MEDIUM: No guard against negative remaining time**
**Location**: `display.ts` LINE 80-82, 88
**Severity**: MEDIUM

**Problem:**
```typescript
// display.ts
workTimeRemaining: maxWork - nextWorkCycle,
drivingTimeRemaining: maxDriveSeconds - nextDrivingCycle,
spreadoverRemaining: spreadOverSeconds - shiftElapsed,
weeklyDrivingRemaining: maxWeeklyDriveSeconds - weeklyDrivingTotal,
```

If `nextWorkCycle > maxWork` due to any sync issue, these go negative. The hook does check with `crossedDown()` on alerts (LINE 855), but:
- Display shows negative numbers to user
- Not explicitly clamped to 0

**Expected**: `Math.max(0, maxWork - nextWorkCycle)`
**Actual**: Can be negative

---

### 8. **🟡 MEDIUM: Segment start timestamp can become invalid**
**Location**: `useWorkTimer.ts` LINE 340, 503, 746
**Severity**: MEDIUM

**Problem:**
`segmentStartRef.current` is reassigned in multiple places:
```typescript
// LINE 340
segmentStartRef.current = new Date(nowMs).toISOString();

// LINE 503
segmentStartRef.current = new Date(nowMs).toISOString();

// LINE 546
segmentStartRef.current = drivingTransition.nextSegmentStartIso;

// LINE 741
segmentStartRef.current = transition.nowIso;
```

If creation of ISO string fails or system clock jumps backward, subsequent elapsed time calculations create negative values.

---

### 9. **🟡 MEDIUM: Break tracker state can be lost on app restart**
**Location**: `runtimeStorage.ts` vs `useWorkTimer.ts`
**Severity**: MEDIUM

**Problem:**
```typescript
// runtimeStorage.ts - saves breakTracker
saveActiveTimerState(state) // saves breakTrackerRef.current = { has15min: boolean }

// But has15min is also updated in:
// transitions.ts - deriveStatusTransition
// timing.ts - evaluateBreakCompletion

// On restore (useWorkTimer LINE 791):
breakTrackerRef.current = s.breakTracker || { has15min: false };

// If saved state is corrupted or missing, defaults to false
// But this might not match what the DB thinks
```

When `refreshSession()` loads from DB, it overwrites with DB values, but this happens AFTER the restore. Brief window of inconsistency.

---

### 10. **🟡 MEDIUM: workSessionService is never verified for compatibility**
**Location**: `useWorkTimer.ts` - multiple calls to `workSessionService`
**Severity**: MEDIUM

**Problem:**
The hook imports and uses `workSessionService` but:
- No type checking on return values
- Errors not consistently handled
- Methods called: `fetchSessionsForDateRange()`, `fetchWeeklyDrivingMinutes()`, `startSession()`, `endSession()`

If the service signatures changed, this would break silently in places.

---

## INTEGRATION WARNINGS (Not Critical)

### 11. **🟡 Dependencies Chain Complexity**
```
useWorkTimer.ts
├── → tacho/constants
├── → tacho/timing (uses constants)
├── → tacho/display (uses timing)
├── → tacho/transitions (uses timing)
├── → tacho/drivingDetection
├── → tacho/lifecycle (uses constants, timing)
├── → tacho/snapshot (uses timing)
└── → tacho/endShift
```

Deep dependency chain means changes to `timing.ts` or `constants.ts` could cascade.

---

### 12. **🟡 Ref Updates Not Always Synchronized**
When multiple refs are updated in sequence, if an async operation is awaited in between, values can become inconsistent.

**Example**:
```typescript
// LINE 535-577
isDrivingRef.current = nextDriving;    // Updated
movingSinceRef.current = 0;            // Updated
stationarySinceRef.current = 0;        // Updated
setIsDriving(nextDriving);             // State update (async batch)

// Promise starts here - but refs already changed
Promise.resolve(supabase...) // If this fails, only DB out of sync, refs already updated
```

---

## RECOMMENDATIONS

### High Priority Fixes:

1. **Implement defensive zero-check for breakStartMs**
   ```typescript
   // In display.ts, add guards
   const effectiveBreakStartMs = (breakStartMs && breakStartMs > 0) ? breakStartMs : null;
   ```

2. **Add weekly driving reset logic**
   - Calculate current week start
   - If session crosses week boundary, reset accumulator

3. **Implement DB sync retry with rollback**
   ```typescript
   // Instead of fire-and-forget, implement retry + rollback
   const updateDBPayload = (payload) => {
     return supabase.from('work_sessions')
       .update(payload)
       .eq('id', sessionIdRef.current)
       .then(() => ({ success: true }))
       .catch(() => ({ success: false, rollback: true }));
   };
   ```

4. **Clear breakStartMs explicitly on status exit from break**
   ```typescript
   if (prevStatus === 'break') {
     breakStartTimeRef.current = 0;
   }
   ```

5. **Clamp negative remaining times to 0**
   ```typescript
   workTimeRemaining: Math.max(0, maxWork - nextWorkCycle),
   ```

6. **Add persistence layer validation**
   ```typescript
   // Validate segmentStartRef is valid ISO string
   try {
     new Date(segmentStartRef.current).getTime();
   } catch {
     segmentStartRef.current = new Date().toISOString();
   }
   ```

---

## TESTING RECOMMENDATIONS

1. **Test state persistence across app suspend/resume**
2. **Test weekly driving reset at week boundary**
3. **Test with network failures during DB sync**
4. **Test break transitions with active driving state**
5. **Test rapid status transitions (working→break→working→break)**
6. **Test with system clock adjustments**
7. **Test display state consistency after app crash simulation**

---

## FILES THAT NEED REVIEW

- [ ] `useWorkTimer.ts` - Main hook, primary refactor target
- [ ] `timing.ts` - Break evaluation logic
- [ ] `display.ts` - Real-time state derivation
- [ ] `sessionPayloads.ts` - DB payload construction
- [ ] `runtimeStorage.ts` - Persistence layer

---

Generated: 2026-05-04

