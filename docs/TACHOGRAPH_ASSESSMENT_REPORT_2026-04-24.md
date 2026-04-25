# Tachograph Assessment Report

Date: 2026-04-24  
Project: `HourWiseEUVer4`  
Scope reviewed: `useWorkTimer`, `calculateCompliance`, session persistence, background speed reconciliation, and report output

## Executive Summary

`useWorkTimer` is materially better than it was before the recent fixes. It now separates:

- full-shift totals
- resettable work-cycle counters
- resettable driving-cycle counters
- break-start timing used to qualify a break correctly

That is the right shape for a simulated tachograph-like workflow.

However, in my opinion it is **not yet "the best it can be"** and it is **not yet a complete EU HGV tachograph implementation**.

My current judgment is:

- As a **driver aid / compliance-oriented simulator**, it is credible.
- As a **full EU tachograph rules engine**, it is incomplete.
- As a **production-grade legal monitor**, it still has rule gaps, evidence gaps, and mobile-runtime risks.

## What It Does Well

### 1. Separation of totals vs live legal counters

The current hook now keeps shift totals separate from break-resettable counters:

- elapsed time is accumulated into full totals in [`useWorkTimer.ts`](../src/hooks/useWorkTimer.ts)
- work-cycle warnings use `workCycleRef` ([src/hooks/useWorkTimer.ts:239](../src/hooks/useWorkTimer.ts:239), [287](../src/hooks/useWorkTimer.ts:287))
- driving-cycle warnings use `drivingCycleRef` ([src/hooks/useWorkTimer.ts:240](../src/hooks/useWorkTimer.ts:240), [288](../src/hooks/useWorkTimer.ts:288))

This is the right direction. A tachograph-style model needs those counters to be distinct.

### 2. Qualifying break handling is more robust

Break qualification now relies on a stable break-start timestamp, rather than only the latest persisted segment:

- break start recorded on entry to break: [src/hooks/useWorkTimer.ts:602](../src/hooks/useWorkTimer.ts:602)
- full break duration evaluated using `breakStartTimeRef`: [src/hooks/useWorkTimer.ts:582](../src/hooks/useWorkTimer.ts:582)
- qualifying break resets the cycle counters only: [src/hooks/useWorkTimer.ts:586](../src/hooks/useWorkTimer.ts:586)

That fixes the earlier failure mode where persistence could prevent a real 45-minute break from qualifying.

### 3. Background speed handoff is aligned

The background task now writes the same key and JSON shape that `useWorkTimer` reads:

- writer: [index.ts:8](../index.ts:8), [22](../index.ts:22)
- reader: [src/hooks/useWorkTimer.ts:480](../src/hooks/useWorkTimer.ts:480)

That is necessary for the app to recover some driving-state continuity after backgrounding.

### 4. Compliance storage is richer than before

The app now stores:

- `driving`
- `has15minBreak`
- `workCycle`
- `drivingCycle`

in `other_data` during active use and at end of shift ([src/hooks/useWorkTimer.ts:626](../src/hooks/useWorkTimer.ts:626), [771](../src/hooks/useWorkTimer.ts:771), [884](../src/hooks/useWorkTimer.ts:884)).

This gives the compliance layer more usable state than simple daily totals.

## Why It Is Not Yet a Full EU Tachograph

### 1. It does not model all legally significant break structure

The code still stores only:

- total break minutes
- a boolean `has15minBreak`
- final cycle counters

That is not enough to reconstruct the actual sequence of break segments across a shift.

Examples of what remains weak:

- whether the `15 + 30` split happened in the legally valid order
- whether a 30-minute WTD break was uninterrupted
- whether breaks happened before or after the relevant work/driving accumulation
- whether there were multiple short breaks that should not qualify

The current compliance code still relies heavily on end-of-shift totals and a single boolean:

- [src/lib/compliance.ts:145](../src/lib/compliance.ts:145)
- [src/lib/compliance.ts:165](../src/lib/compliance.ts:165)

That is workable as an approximation, not as a full tachograph evidence model.

### 2. The rule set is incomplete

The compliance layer currently covers only part of the EU/UK HGV landscape:

- 4.5h continuous driving
- 9h / 10h daily driving
- 56h weekly driving
- 90h fortnightly driving
- 6h / 9h WTD break obligations
- 48h / 60h weekly work
- simplified daily rest

Missing or materially simplified areas include:

- weekly rest rules
- split daily rest
- regular vs reduced weekly rest
- compensation for reduced weekly rest
- multi-manning rules
- ferry/train interruption logic
- out-of-scope work before driving windows
- night work rules where jurisdiction-specific
- special cases by derogation, country, sector, and vehicle/activity

There is no evidence in `calculateCompliance` that those are implemented. The rule surface is much narrower than a true tachograph/compliance product.

### 3. Daily rest handling is simplified and not fully regulation-grade

Daily rest is evaluated from the previous session end to the current session start:

- [src/lib/compliance.ts:349](../src/lib/compliance.ts:349)

That gives a usable warning model, but not a complete rest regime engine. It assumes:

- clean session boundaries
- one previous relevant session
- simple counting of reduced rests in the current week

That is not enough for all legal rest interpretations.

### 4. Live monitoring depends on mobile sensors that are inherently noisy

Driving detection is based on:

- foreground location speed
- background location speed handoff
- accelerometer fallback scoring

See:

- [src/hooks/useWorkTimer.ts:505](../src/hooks/useWorkTimer.ts:505)
- [src/hooks/useWorkTimer.ts:530](../src/hooks/useWorkTimer.ts:530)

This is reasonable for a simulator, but it is not the same as data from a real tachograph head unit and vehicle motion source.

Risks still present:

- poor GPS accuracy
- stale background updates
- Android battery throttling
- false positives while moving in a passenger seat
- false negatives at low speed / slow yard movement
- sensor behavior differing by handset

### 5. The app still has project-wide type-health issues

`npm run ts:check` still fails across the project. `useWorkTimer.ts` itself no longer appears in the current error list, but the wider project does.

That matters because broken type health reduces confidence in surrounding integrations and data shapes.

## Current Fit-for-Purpose Assessment

### Does it function very similarly to a Euro tachograph?

**Partially.**

It simulates several user-facing behaviors of a digital tachograph:

- shift start/end
- work / POA / break states
- driving-state detection
- live countdowns
- warnings at key thresholds
- shift persistence

But it is still a software approximation, not a full tachograph-grade rules and evidence engine.

### Will it monitor correctly for all EU HGV rules?

**No.**

It will monitor some important limits, but not all EU HGV rules and not all edge cases. It should be treated as:

- a strong compliance assistant
- not the final legal authority

### Is `useWorkTimer` the best it can be?

**No.**

It is materially improved and now much closer to the right design, but there are clear next steps.

## Highest-Value Improvements

### 1. Store segment history, not just totals

This is the single biggest improvement.

For each shift, persist an ordered activity log:

- `working`
- `driving`
- `break`
- `poa`

with:

- `started_at`
- `ended_at`
- derived duration
- source (`manual`, `gps`, `accelerometer`, `reconciled`)

Once you have that, compliance can be calculated from actual events rather than inferred from totals.

### 2. Move rule evaluation into a pure engine

`useWorkTimer` currently mixes:

- UI state
- persistence
- notifications
- sensor handling
- compliance counters

A better structure is:

1. pure activity/segment reducer
2. pure rules engine
3. side-effect layer for sensors, DB, notifications
4. UI hook on top

That would make PC-side testing much stronger and much cheaper.

### 3. Add explicit rule coverage metadata

Create a single document or config stating:

- implemented rule
- source regulation
- exact interpretation used
- known exclusions

Without that, it is too easy to assume "EU compliant" when the actual implementation is narrower.

### 4. Add device telemetry / debug mode

For field verification, log:

- raw GPS speed
- accelerometer score
- current state
- state transitions
- work/driving cycle values
- break qualification result

This is extremely useful when drivers report false transitions.

### 5. Add fortnight live alerting and more explicit weekly counters

You already compute weekly driving and have a service for fortnightly totals. Extending that to live warnings would improve usefulness.

### 6. Make the break model explicit in UI

The app should distinguish:

- total break this shift
- qualifying break toward 4.5h driving
- qualifying break toward WTD work

Those are not always the same thing.

## Bottom Line

The current `useWorkTimer` is **good enough to behave like a serious tachograph-inspired monitoring tool**, but **not complete enough to be described as fully meeting all EU HGV tachograph and working-time rules**.

My recommendation is:

- position it as a strong driver-assistance and compliance-support tool
- do not overstate it as a full tachograph-equivalent rules authority yet
- prioritize segment-based rule calculation next
