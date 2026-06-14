# Tachograph Test Plan

Date: 2026-04-24  
Scope: `useWorkTimer`, `calculateCompliance`, session persistence, driving detection, and threshold alerts

## How To Use This

There are two test layers:

1. **PC-runnable checks**
2. **mobile/device checks**

PC tests can verify deterministic logic and source-level regressions.  
Device tests are still required for:

- GPS behavior
- accelerometer behavior
- background tracking
- notification delivery
- battery optimization side effects

## PC-Runnable Test

Run:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\run-tachograph-local-tests.ps1
```

This runs a local Node-based test harness that checks:

- driving/work cycle separation still exists
- qualifying breaks reset cycle counters, not full totals
- background speed key alignment between `index.ts` and `useWorkTimer`
- report output uses `other_data.driving`
- compliance still contains the expected rule blocks

## Manual Mobile Tests

### 1. Start Shift

Expected:

- shift enters `working`
- totals all start at zero
- work and driving countdowns start from full values
- DB session row is created

### 2. Work Without Driving

Procedure:

- start shift
- stay stationary
- let timer run 2 to 3 minutes

Expected:

- `work` increases
- `driving` stays zero
- `workTimeRemaining` decreases
- `drivingTimeRemaining` does not decrease

### 3. Enter Driving Automatically

Procedure:

- start shift
- drive above threshold

Expected:

- `isDriving` becomes true
- `driving` increases
- `drivingTimeRemaining` decreases
- `workTimeRemaining` also decreases

### 4. Stop Driving But Remain Working

Procedure:

- drive
- stop vehicle
- remain on working screen without starting break

Expected:

- `isDriving` becomes false after confirmation delay
- `driving` stops increasing
- `work` resumes increasing

### 5. Short Break Under 15 Minutes

Expected:

- break total increases
- work/driving cycle does not reset
- returning to work continues countdown from previous cycle

### 6. Break of 15 to 29 Minutes

Expected:

- break total increases
- split-break first leg is recognized
- work mode moves to the longer break threshold behavior (`6h` to `9h` path in current implementation)
- full cycle does not reset yet

### 7. Break of 30 Minutes After a Prior 15

Expected:

- driving and work cycle reset
- full-shift totals do not reset
- next work/driving countdown starts from full cycle allowance

### 8. Single Break of 45 Minutes

Expected:

- work/driving cycle reset
- full shift totals preserved
- last break display shows the real break duration

### 9. End Shift During Break

Expected:

- final break duration is counted
- qualifying break logic is reflected in saved compliance state
- shift summary totals remain correct

### 10. App Background / Foreground

Procedure:

- start shift
- drive
- background app
- keep moving
- reopen app

Expected:

- app reconciles background speed state
- driving state is recovered or corrected
- totals are not duplicated

### 11. Battery Optimization Path

Expected:

- first relevant prompt appears on Android
- “Don’t Ask Again” persists
- settings path opens successfully

### 12. Notification Thresholds

Use controlled short-form test scenarios or temporary debug thresholds if needed.

Expected:

- work warnings fire only while actively working
- driving warnings fire from driving cycle, not full daily driving total
- weekly warning fires from weekly accumulator

## Recommended Next Test Upgrade

The next useful engineering step is to extract:

- a pure activity timeline reducer
- a pure rules engine

Once that exists, you can add true unit tests for:

- state transitions
- break qualification
- driving-cycle resets
- weekly and fortnightly accumulation
- compliance outputs
