# Test Plans to Validate Integration Issues

## Test Setup Prerequisites
- Test device/emulator with ability to simulate time passage
- Network simulation capability (to test failure scenarios)
- Log captured with detailed timestamps
- Session history accessible

---

## TEST 1: Break Duration Calculation with Stale breakStartMs

**Purpose**: Validate Fix #1 (breakStartMs clearance)

**Scenario**:
1. User starts shift
2. Enters break status at T+10min
3. Takes 20-minute break
4. Exits break to working at T+30min
5. Force close app at T+35min
6. Reopen app (restores from persistence)
7. Take another 15-minute break
8. Exit break

**Expected Result**:
- First break: 20 minutes recorded
- Second break: 15 minutes recorded
- No accumulation of old break time

**What to check**:
```
Display: breakDuration should show current break only, not legacy value
DB: Each break period should be independent
Logs: No "Invalid breakStartMs" warnings
```

**Failure Indicator**:
- Second break shows larger than actual duration
- legalBreakDisplayTotal doubles-counts
- App shows "20 + 15 = 42 min break" instead of tracking separately

**Test Code**:
```typescript
test('break time resets after app restart', async () => {
  // Start shift
  await act(() => startWork());
  await waitMs(1000);
  
  // Enter break
  await act(() => toggleBreak());
  const beforeBreak = display.legalBreak;
  await waitMs(20000); // 20 sec simulating 20 min
  
  // Exit break
  await act(() => toggleBreak());
  const afterFirstBreak = display.legalBreak;
  expect(afterFirstBreak).toBeGreaterThan(beforeBreak);
  
  // Simulate app restart
  await simulateAppRestart();
  
  // Enter break again
  const beforeSecondBreak = display.legalBreak;
  await act(() => toggleBreak());
  await waitMs(15000); // 15 sec simulating 15 min
  
  // Exit break
  await act(() => toggleBreak());
  const afterSecondBreak = display.legalBreak;
  
  // Should only add ~15 min, not 20 + 15
  const secondBreakDuration = afterSecondBreak - beforeSecondBreak;
  expect(secondBreakDuration).toBeLessThan((20 * 60) - 5 * 60); // Should be ~15min, not ~35min
});
```

---

## TEST 2: Weekly Driving Reset at Week Boundary

**Purpose**: Validate Fix #2 (weekly driving accumulator)

**Scenario**:
1. User accumulates 40 hours driving during the week
2. Continue driving into next week (Mon→Tue boundary)
3. Check weekly driving remaining

**Expected Result**:
- Friday (50 hrs driving): weeklyDrivingRemaining = 6 hours
- Saturday (52 hrs driving): weeklyDrivingRemaining = 4 hours
- Sunday (54 hrs driving): weeklyDrivingRemaining = 2 hours
- Monday (0 hrs driving in new week): weeklyDrivingRemaining = 56 hours

**What to check**:
```
Display: weeklyDrivingRemaining resets to MAX on Monday
DB: Weekly accumulator recalculated
Logs: No "Invalid weekly driving" related errors
```

**Failure Indicator**:
- Monday still shows 2 hours remaining (old week's value)
- App doesn't alert on Monday even though within limits
- Weekly total keeps accumulating across week boundary

**Test Code**:
```typescript
test('weekly driving resets on week boundary', async () => {
  const testTime = new Date('2026-04-27T10:00:00Z'); // Monday
  
  // Simulate Friday work
  mockDate(new Date('2026-04-24T10:00:00Z'));
  await act(() => startWork());
  weeklyDrivingAccumulatorRef.current = 54 * 3600; // 54 hours
  await waitMs(1000);
  
  // Check Friday remaining
  expect(display.weeklyDrivingRemaining).toBeLessThan(2 * 3600);
  
  // Move to Monday (next week)
  mockDate(new Date('2026-04-28T08:00:00Z'));
  await act(() => endWork());
  
  // Start new shift
  await act(() => startWork());
  
  // Check Monday should reset
  expect(display.weeklyDrivingRemaining).toBe(56 * 3600); // Full week
  expect(weeklyDrivingAccumulatorRef.current).toBe(0);
});
```

---

## TEST 3: Network Failure During Drive Stop Sync

**Purpose**: Validate Fix #3 (retry logic)

**Scenario**:
1. User driving (isDriving = true)
2. Network drops
3. Driver stops → commitAndFlipDriving(false)
4. Local isDriving updated to false
5. DB update fails
6. App restores session from DB
7. DB still has isDriving: true (from before network failure)

**Expected Result**:
- Local state and DB eventually consistent
- Retry mechanism recovers the stop event
- No lost driving time

**What to check**:
```
Logs: "Retrying..." messages appear
Display: isDriving immediately updates locally
DB: Eventually updates after network recovery
```

**Failure Indicator**:
- Log shows single failed attempt, no retries
- App shows driving=false locally, but DB shows driving=true
- Next refresh shows old state

**Test Code**:
```typescript
test('drive stop syncs with retries on network failure', async () => {
  await act(() => startWork());
  
  // Simulate active driving
  isDrivingRef.current = true;
  
  // Simulate network failure for first N attempts
  let attemptCount = 0;
  mockSupabaseUpdate.mockImplementation(() => {
    attemptCount++;
    if (attemptCount <= 2) {
      return Promise.reject(new Error('Network error'));
    }
    return Promise.resolve({ data: { ...sessionData, isDriving: false }, error: null });
  });
  
  // Trigger drive stop
  await act(() => commitAndFlipDriving(false));
  
  // Should immediately update locally
  expect(isDrivingRef.current).toBe(false);
  
  // Wait for retries
  await waitMs(500);
  
  // Should eventually succeed
  expect(attemptCount).toBeGreaterThanOrEqual(3);
  expect(mockSupabaseUpdate).toHaveBeenCalledTimes(3); // 2 failures + 1 success
});
```

---

## TEST 4: Display State Consistency After App Crash

**Purpose**: Validate display derivation doesn't drift from persisted counters

**Scenario**:
1. User works for 30 minutes
2. App is force-closed (no persist cycle)
3. Reopens app
4. Display calculated with potentially stale totalsRef
5. Compare against expected cumulative value

**Expected Result**:
- Display shows correct elapsed + persisted total
- No missing or duplicated work time
- totalsRef and display are consistent

**What to check**:
```
Logs: "restore failed:" should not appear unless actual DB issue
Display: work + elapsed = displayed work
DB: Matches display value when refetched
```

**Failure Indicator**:
- Display shows 25 min but DB shows 30 min (lost 5 min)
- Display shows 35 min but DB shows 30 min (double-counted 5 min)
- "Invalid persisted state" warning appears

**Test Code**:
```typescript
test('display consistency after app crash', async () => {
  // Setup a session
  await act(() => startWork());
  const startDisplayWork = display.work;
  
  // Simulate 30 seconds of work
  mockTime(Date.now() + 30000);
  await recalculateDisplay();
  const displayAfterWork = display.work;
  expect(displayAfterWork).toBe(startDisplayWork + 30);
  
  // Simulate force close without persist
  await simulateAppCrash();
  
  // Reopen without calling persistFromRefs
  await reopenApp();
  
  // Should restore and show correct total
  const restoredTotal = totalsRef.current.work;
  const displayAfterReopen = display.work;
  
  // They should match (within 1 sec)
  expect(Math.abs(displayAfterReopen - restoredTotal)).toBeLessThanOrEqual(1);
});
```

---

## TEST 5: Break Status with Active Driving

**Purpose**: Validate break doesn't corrupt driving state

**Scenario**:
1. User starts driving (working + isDriving=true)
2. Takes break while "driving" is still recorded
3. Check isDriving state during and after break
4. Resume work, isDriving should restore

**Expected Result**:
- isDriving=true before break
- isDriving stays true during break (or explicitly cleared)
- isDriving restored after break

**What to check**:
```
Logs: No warnings about invalid state transitions
Display: workDuration and drivingDuration correctly separated
State: isDriving consistent with status transitions
```

**Failure Indicator**:
- After exiting break, driving time isn't correctly accounted
- isDriving state lost or corrupted
- Back from break shows driving=false even though was driving before

**Test Code**:
```typescript
test('break with active driving preserves state', async () => {
  await act(() => startWork());
  
  // Start driving
  isDrivingRef.current = true;
  setIsDriving(true);
  const drivingBefore = display.driving;
  
  // Simulate some driving
  mockTime(Date.now() + 10000);
  await recalculateDisplay();
  const drivingMiddle = display.driving;
  expect(drivingMiddle).toBeGreaterThan(drivingBefore);
  
  // Take break while driving
  await act(() => toggleBreak());
  expect(status).toBe('break');
  
  // Simulate break time
  mockTime(Date.now() + 5000);
  await recalculateDisplay();
  
  // Resume work
  await act(() => toggleBreak());
  expect(status).toBe('working');
  
  // isDriving should still be true (or controlled explicitly)
  // Driving total should not have jumped
  const drivingAfter = display.driving;
  expect(drivingAfter).toBeLessThan(drivingMiddle + 10); // Only 10s added during break
});
```

---

## TEST 6: Segment Start Invalidation (Clock Jump)

**Purpose**: Validate segment timestamps survive system clock adjustments

**Scenario**:
1. User working normally
2. System clock adjusted backward (e.g., NTP sync)
3. App continues operation
4. Calculate elapsed time

**Expected Result**:
- No negative elapsed times
- Display remains valid
- No "NaN" or Infinity in calculations

**What to check**:
```
Logs: "Invalid segmentStart" warning if clock jumps
Display: No NaN values
Console: No math errors
```

**Failure Indicator**:
- display.work shows NaN
- negative remaining time values
- Console math errors (e.g., "floor(NaN)")

**Test Code**:
```typescript
test('survives system clock backward jump', async () => {
  await act(() => startWork());
  const segmentStartBefore = segmentStartRef.current;
  
  // Simulate clock backward jump
  const originalNow = Date.now;
  mockTime(-30000); // Jump clock back 30 seconds
  
  await recalculateDisplay();
  
  // Should not crash or produce NaN
  expect(isFinite(display.workTimeRemaining)).toBe(true);
  expect(isFinite(display.drivingTimeRemaining)).toBe(true);
  expect(Display.work).not.toBeNaN();
  
  // Logs should show defensive handling
  expectLog('Invalid', 'segmentStart');
});
```

---

## TEST 7: Overlapping Status Transitions Under Load

**Purpose**: Validate rapid status changes don't cause inconsistencies

**Scenario**:
1. Simulate rapid status changes: working→break→working→break→poa→working
2. Each transition completes before next starts (simulating UI button mashing)
3. Check totals accumulate correctly

**Expected Result**:
- Each period recorded with correct duration
- No skipped or double-counted time segments
- Cycles (workCycle, drivingCycle) monotonically increase

**What to check**:
```
Totals: work+break+poa+driving = shift total
Cycles: Never decrease
Status: Transitions recorded in correct order
```

**Failure Indicator**:
- workCycle shows 120s then 100s (decreased)
- Break duration recorded as negative
- Total time > actual elapsed

**Test Code**:
```typescript
test('handles rapid status transitions', async () => {
  const transitions = ['working', 'break', 'working', 'break', 'poa', 'working'];
  const durations = [5000, 3000, 7000, 4000, 2000, 6000];
  let prevWorkCycle = 0;
  
  await act(() => startWork());
  
  for (let i = 0; i < transitions.length; i++) {
    const targetStatus = transitions[i];
    
    // Skip if already in this status
    if (status === targetStatus) continue;
    
    await act(() => {
      if (targetStatus === 'break') toggleBreak();
      if (targetStatus === 'poa') togglePOA();
      if (targetStatus === 'working' && status !== 'working') {
        if (status === 'break') toggleBreak();
        if (status === 'poa') togglePOA();
      }
    });
    
    mockTime(Date.now() + durations[i]);
    await recalculateDisplay();
    
    // Cycles should never decrease
    if (targetStatus === 'working') {
      expect(workCycleRef.current).toBeGreaterThanOrEqual(prevWorkCycle);
      prevWorkCycle = workCycleRef.current;
    }
  }
  
  // Total should be sum of all durations (minus POA which doesn't add to work/drive)
  const totalNonBreak = durations.reduce((a, b, i) => a + (transitions[i] !== 'break' && transitions[i] !== 'poa' ? b : 0), 0);
  expect(display.work + display.driving).toBeCloseTo(totalNonBreak / 1000, 1); // Within 1 second
});
```

---

## TEST 8: Database Checkpoint Sync Reliability

**Purpose**: Validate 60-second DB checkpoint doesn't lose data

**Scenario**:
1. Run a shift for 2 minutes
2. During checkpoint syncs, simulate network failure on one of them
3. End shift
4. Verify all time was recorded

**Expected Result**:
- Failed checkpoint doesn't lose previous data
- Next checkpoint includes any missed time
- Final DB matches app's calculations

**What to check**:
```
DB: total_work_minutes matches calculated work
DB: other_data.workCycle matches expected
Logs: Warnings when checkpoints fail, not errors
```

**Failure Indicator**:
- DB shows less work time than calculated
- Checkpoint failures crash the app
- No warning logged for failed checkpoints

**Test Code**:
```typescript
test('checkpoint sync survives network failures', async () => {
  let failedCheckpoints = 0;
  
  mockSupabaseUpdate.mockImplementation(({ other_data }) => {
    // Fail every 2nd checkpoint
    if (failedCheckpoints++ % 2 === 0) {
      return Promise.reject(new Error('Network timeout'));
    }
    return Promise.resolve({ data: {}, error: null });
  });
  
  await act(() => startWork());
  mockTime(Date.now() + 60000); // Wait for first checkpoint
  await act(() => toggleBreak());
  mockTime(Date.now() + 60000); // Wait for second checkpoint (should fail)
  await act(() => toggleBreak());
  mockTime(Date.now() + 60000); // Wait for third checkpoint
  
  const displayedWork = display.work;
  
  // End shift
  await act(() => endWork());
  
  // Get final DB record
  const finalSession = mockDBSession;
  expect(finalSession.total_work_minutes).toBeCloseTo(Math.floor(displayedWork / 60), 0);
});
```

---

## Priority Order for Testing

1. **CRITICAL**: Test #1 (Break duration) - High impact on tracking accuracy
2. **CRITICAL**: Test #2 (Weekly driving reset) - Financial impact
3. **HIGH**: Test #4 (Display consistency) - Data loss risk
4. **HIGH**: Test #5 (Break with driving) - State corruption risk
5. **MEDIUM**: Test #3 (Network retry) - Reliability under poor conditions
6. **MEDIUM**: Test #6 (Clock jump) - Edge case handling
7. **MEDIUM**: Test #7 (Rapid transitions) - UI handling
8. **LOW**: Test #8 (Checkpoint) - Background reliability

---

**Execution Timeline**:
- Tests 1-2: Day 1 (foundational)
- Tests 3-5: Day 2 (state consistency)
- Tests 6-8: Day 3 (edge cases)

**Automation**:
- Can be run in Jest with mock timers and mock Supabase
- Should be added to CI/CD pipeline
- Manual testing recommended for Tests #6-7 on real device with system settings

