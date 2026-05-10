# System Architecture & Data Flow Diagram

## Component Hierarchy

```
useWorkTimer Hook (useWorkTimer.ts)
│
├── State Management Layer
│   ├── status: 'idle' | 'working' | 'poa' | 'break'
│   ├── isDriving: boolean
│   ├── sessionId: string
│   └── display: DisplayState
│
├── Reference State (Not Re-render triggers)
│   ├── statusRef ──────────────────┐
│   ├── isDrivingRef ────────────┐  │
│   ├── totalsRef ────────┐      │  │
│   ├── workCycleRef      │      │  │
│   ├── drivingCycleRef   │      │  │
│   ├── breakTrackerRef   │      │  │
│   ├── segmentStartRef   │      │  │
│   ├── breakStartTimeRef │      │  │
│   └── ...               │      │  │
│                         │      │  │
├── Tacho Library Layer   │      │  │
│   ├── constants.ts      │      │  │
│   ├── types.ts          │      │  │
│   ├── timing.ts ◄───────┘      │  │
│   │   ├── applyElapsedToCounters  │  │
│   │   ├── evaluateBreakCompletion │  │
│   │   └── getMaxWorkSeconds       │  │
│   │                              │  │
│   ├── display.ts ◄───────────────┼──┘
│   │   └── deriveLiveDisplayState │
│   │       (updates state every 1s)
│   │                              │
│   ├── transitions.ts ◄───────────┘
│   │   ├── deriveDrivingTransition
│   │   └── deriveStatusTransition
│   │
│   ├── drivingDetection.ts
│   │   ├── evaluateLocationSample
│   │   ├── evaluateAccelerometerDecision
│   │   └── evaluateBackgroundSpeedDecision
│   │
│   ├── lifecycle.ts
│   │   ├── createStartedShiftState
│   │   ├── createEndedShiftResetState
│   │   └── createInitialDisplayState
│   │
│   ├── snapshot.ts
│   │   └── buildEndShiftSnapshot
│   │
│   ├── endShift.ts
│   │   ├── buildEndShiftSummary
│   │   └── buildEndSessionRequest
│   │
│   ├── sessionPayloads.ts
│   │   ├── buildDriveStopUpdatePayload
│   │   ├── buildStatusUpdatePayload
│   │   └── buildPeriodicCheckpointPayload
│   │
│   ├── runtimeStorage.ts
│   │   ├── saveActiveTimerState
│   │   ├── loadActiveTimerState
│   │   └── clearActiveTimerState
│   │
│   └── alerts.ts
│       └── ALERT_TEXT definitions
│
├── Data Persistence Layer
│   ├── AsyncStorage (Local)
│   │   ├── ACTIVE_TIMER_STATE_KEY
│   │   ├── SCHEDULED_COMPLIANCE_NOTIFICATION_IDS_KEY
│   │   └── BACKGROUND_ALERT_STATE_KEY
│   │
│   └── Supabase (Remote)
│       ├── work_sessions table
│       └── Session fields: status, totals, cycles, other_data
│
└── External Dependencies
    ├── Location API
    ├── Accelerometer API
    ├── Speech API
    ├── Notifications API
    └── workSessionService
```

---

## Data Flow: From Refs to Display

```
┌─────────────────────────────────────────────────────────────┐
│                    1-Second Tick (useEffect)                │
└─────────────────────────────────────────────────────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │ Read current state from Refs:         │
        │ - statusRef.current                   │
        │ - segmentStartRef.current             │
        │ - totalsRef.current                   │
        │ - workCycleRef.current                │
        │ - isDrivingRef.current                │
        └───────────────────────────────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │ Call deriveLiveDisplayState()          │
        │ (from display.ts)                     │
        └───────────────────────────────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │ Calculate current segment elapsed:    │
        │ elapsedSec = (nowMs - segmentStartMs) │
        │          / 1000                       │
        └───────────────────────────────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │ Apply elapsed to current status:      │
        │ if working: totals.work += elapsedSec │
        │ if break: totals.break += elapsedSec  │
        │ if driving: totals.driving += ...     │
        └───────────────────────────────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │ Calculate remaining times:            │
        │ workRemaining = maxWork - workCycle   │
        │ driveRemaining = maxDrive -           │
        │   drivingCycle                        │
        │ weeklyRemaining = maxWeekly -         │
        │   weeklyAccumulator                   │
        └───────────────────────────────────────┘
                            ↓
        ┌───────────────────────────────────────┐
        │ Update React state:                   │
        │ setDisplay(nextDisplay)               │
        │ (triggers component re-render)        │
        └───────────────────────────────────────┘
```

---

## Break Duration Calculation Path (ISSUE #1)

```
User enters break
      ↓
toggleBreak() called
      ↓
updateTotalsAndSwitchStatus('break')
      ↓
deriveStatusTransition() returns:
  nextBreakStartMs = nowMs ✓
      ↓
breakStartTimeRef.current = nowMs ✓
      ↓
User takes break for 20 seconds...
      ↓
User exits break
      ↓
toggleBreak() called again
      ↓
updateTotalsAndSwitchStatus('working')
      ↓
deriveStatusTransition() calculates:
  breakDuration = nowMs - breakStartMs ✓
  legalBreakDisplayTotal += getDisplayedBreakSeconds(20)
      ↓
[ISSUE] breakStartTimeRef.current NOT CLEARED ❌
      ↓
App crashes
      ↓
App restores:
  breakStartTimeRef.current = persisted breakStartMs (old value!)
      ↓
User takes new break
      ↓
Display calculates current break as:
  (currentTime - OLD_breakStartMs) ← WRONG! ❌
  Shows: 20 + newBreakTime instead of just newBreakTime
```

**Solution**: Clear `breakStartTimeRef.current = 0` after exiting break

---

## Weekly Driving Reset Issue (ISSUE #2)

```
Friday (May 23):
├── Driver completes 40 hours work
├── workSessionService.fetchWeeklyDrivingMinutes() → 40 hours
└── weeklyDrivingAccumulatorRef = 40 * 3600 seconds

Saturday (May 24):
├── Driver completes 52 hours total this week
├── No re-fetch (same week)
└── weeklyDrivingAccumulatorRef still = 40 * 3600 ✓

Sunday (May 25):
├── Driver completes 55 hours total this week
├── No re-fetch (still same week)
└── weeklyDrivingAccumulatorRef = 40 * 3600 (STALE) ❌

Monday (May 26) - NEW WEEK STARTS:
├── Driver starts new shift
├── [ISSUE] shouldResetWeeklyDriving() not called ❌
├── No DB re-fetch
└── weeklyDrivingAccumulatorRef still = 40 * 3600 (WRONG!)
    (Should be 0 for new week)

Display calculates:
  weeklyRemaining = 56*3600 - (40*3600 + newDriving)
  
Expected: 56 hours (full new week)
Actual: ~16 hours (old week's remainder) ❌
```

**Solution**: Check week boundary at shift start, recalculate if crossed

---

## Database Write Failure (ISSUE #3)

```
Driver stops driving at segment boundary:
      ↓
commitAndFlipDriving(false) called
      ↓
Local refs updated:
  isDrivingRef.current = false ✓
  UI immediately updates ✓
      ↓
Database update started:
  supabase.update(buildDriveStopUpdatePayload(...))
      ↓
[SCENARIO A: Success]       [SCENARIO B: Network Failure]
  DB updates to isDriving:false ✓   No response/timeout ❌
                                    Log: "Drive stop DB sync failed"
                                    ↓
                            Fire-and-forget, but app continues
                            
After app restart:
  refreshSession() calls        refreshSession() calls
  SELECT * FROM work_sessions   SELECT * FROM work_sessions
      ↓                             ↓
  DB has isDriving: false ✓     DB still has isDriving: true ❌
                                    (update never happened)
                                    ↓
  State syncs correctly           State syncs to OLD DATABASE
                                    ↓
  Everything correct              Driving stop event lost ❌
                                    Driving time not credited
```

**Solution**: Implement retry logic with exponential backoff

---

## Segment Start Validation Issues (ISSUE #4)

```
Normal case:
  segmentStartRef = "2026-05-04T10:30:45.123Z"
  new Date(segmentStartRef).getTime() = 1714827045123 ✓
  
System clock jumps backward:
  segmentStartRef = "2026-05-04T10:30:45.123Z" (old value)
  systemNow = 1714827000000 (jumped back 45 seconds)
  elapsed = (systemNow - segmentStartMs) / 1000
  = (1714827000000 - 1714827045123) / 1000
  = -45123 / 1000
  = -45 seconds ❌ NEGATIVE!
  
  If used: Math.floor(-45) → calculations fail
  
Bad ISO string:
  segmentStartRef = "invalid" or "2026-13-99T10:30:45Z"
  new Date("invalid").getTime() = NaN ❌
  elapsed = (nowMs - NaN) / 1000 = NaN
  
  Display calculates:
    work = totals.work + NaN = NaN
    display shows "NaN hours" ❌
```

**Solution**: Validate timestamps before use, clamp negatives, handle NaN

---

## Persistence Flow During App States

```
                    APPLICATION STATE LIFECYCLE

┌────────────────┐
│  APP ACTIVE    │ USER WORKING
└─────┬──────────┘
      │ Every 1 second
      ├─→ deriveLiveDisplayState() [DISPLAY ONLY]
      │
      │ Every 20 seconds
      ├─→ persistFromRefs() [SAVE TO ASYNCSTORAGE]
      │ Updates: statusRef, totalsRef, workCycleRef, etc.
      │
      │ Every 60 seconds
      ├─→ buildPeriodicCheckpointPayload()
      │ Updates: work_sessions table in DB
      │ Includes: total_work_minutes, other_data.workCycle, etc.
      │
      │ On status change (working→break)
      ├─→ updateTotalsAndSwitchStatus()
      │ Applies elapsed time
      │ Updates DB immediately
      │
      ↓ USER MINIMIZES APP / SCREEN OFF
┌─────────────────┐
│  APP INACTIVE   │ BACKGROUND STATE
└─────┬───────────┘
      │ (Keep last state in refs)
      │
      │ On app send to background
      ├─→ persistFromRefs() [SAVE TO ASYNCSTORAGE]
      │
      ↓ (Minutes pass with app backgrounded)
      │ [Nothing persists unless explicit background task]
      │
      ↓ USER OPENS APP AGAIN
┌─────────────────┐
│  APP RESUMING   │
└─────┬───────────┘
      │
      ├─→ refre  rSession()
      │   - Load from localStorage
      │   - Validate persisted state
      │   - Fetch from DB (work_sessions)
      │   - Reconcile: use whichever is newer
      │   - Calculate "catch up" elapsed time
      │   - Apply to counters
      │
      ├─→ buildComplianceSchedule()
      │   - Schedule notifications for limits
      │
      └─→ Continue normal operation
```

---

## Break Completion Evaluation Tree

```
evaluateBreakCompletion() receives:
  breakSeconds = 1200 (20 minutes)
  has15minBreak = false (first break)
  timerMode = '6h'

        ↓
getTachographBreakSeconds(1200)
  = Math.floor(1200 / 60 / 15) * 15 * 60
  = Math.floor(20 / 15) * 900
  = 1 * 900
  = 900 (15 minutes, rounded down to 15-min increments)
        ↓
Check qualification:
  
  isQualifyingBreak = (tachoBreakSeg >= 45*60) OR
                      (has15minBreak && tachoBreakSeg >= 30*60)
                    = (900 >= 2700) OR (false && 900 >= 1800)
                    = false OR false
                    = false ✓
        ↓
  tachoBreakSeg >= 15*60?
  900 >= 900? YES ✓
        ↓
RESULT:
  nextHas15minBreak = true (we now have a 15-min break recorded)
  nextTimerMode = '9h' (extended from 6h to 9h)
  resetWorkCycle = false (don't reset work counter)
  resetDrivingCycle = false (don't reset driving counter)
  isQualifyingBreak = false (not a full qualifying break yet)
```

---

## Driving Detection State Machine

```
DRIVING STATE TRANSITIONS

┌─────────────┐
│   PARKED    │ speed < 4 km/h, isDriving = false
└──────┬──────┘
       │
       │ Location: speed ≥ 14 km/h (immediate threshold)
       │ immediateStart = true
       │
       └──────────────────→ ┌─────────────┐
                            │   DRIVING   │
                            └──────┬──────┘
                                   │
                                   │ Speed drops to 6 km/h
                                   │ stationarySinceMs = nowMs
                                   │ Continue monitoring...
                                   │
                                   │ Speed ≤ 4 km/h for 1500ms
                                   │ (STATIONARY_CONFIRM_MS)
                                   │
                           ┌───────┴────────┐
                           │ Park & clear   │
                           │ driving score  │
                           └───────┬────────┘
                                   │
                                   └──→ ┌─────────────┐
                                        │   PARKED    │
                                        └─────────────┘
```

---

## Reference Map: Which Ref Affects What

| Ref Variable | Used In | Updated By | Cleared At |
|--------------|---------|-----------|-----------|
| `statusRef` | display, triggers, alerts | updateTotalsAndSwitchStatus | endWork |
| `isDrivingRef` | display, transitions | commitAndFlipDriving | endWork |
| `segmentStartRef` | elapsed calc, persists | persistFromRefs, transitions | endWork |
| `breakStartTimeRef` | break duration calc | deriveStatusTransition | ❌ **NOT CLEARED** (ISSUE #1) |
| `totalsRef` | display, DB payloads | applyElapsed | endWork |
| `workCycleRef` | remaining calc, DB | deriveStatusTransition | break reset |
| `drivingCycleRef` | remaining calc, DB | applyElapsed | break reset |
| `weeklyDrivingAccumulatorRef` | display, alerts | startWork, applyElapsed | ❌ **NOT RESET** (ISSUE #2) |
| `legalBreakDisplayTotalRef` | display, DB | updateTotalsAndSwitchStatus | endWork |
| `breakTrackerRef` | break eval, DB | deriveStatusTransition | endWork |

---

## Control Flow for Critical Operations

### When user taps "Start Work"
```
startWork()
  ↓
Check: isStartingRef = true (prevent double-start)
  ↓
Fetch: workSessionService.startSession()
  ↓
[DB returns session]
  ↓
Update refs:
  sessionIdRef, workStartRef, totalsRef, etc.
  ↓
Call: syncStateFromRefs()
  (updates React state from refs)
  ↓
Call: buildComplianceSchedule()
  (schedule notifications)
  ↓
isStartingRef = false
```

### When driving state changes
```
commitAndFlipDriving(nextDriving)
  ↓
Check: shouldFlip? (is driving status actually changing)
  ↓
If yes:
  ├─ Apply elapsed time to counters
  ├─ Update isDrivingRef.current
  ├─ Update UI with setIsDriving()
  ├─ Send DB update: buildDriveStopUpdatePayload()
  │   [But currently FIRE-AND-FORGET!]
  └─ [ISSUE #3: No retry logic]
```

---

This architecture shows why the issues emerged: the refs hold transient state that must stay in sync with the database, but the synchronization points aren't always defensive or complete.

