# Timer Reliability Hardening Plan

Date: 2026-06-11

## Goal

Harden HourWise so drivers can rely on shift, work, break, POA, driving reference totals, and warning alerts even when the app is backgrounded, suspended, resumed, or restarted.

This app is not intended to perfectly replicate a certified tachograph. The priority is reliable driver guidance:

- Start shift and end shift must be 100% accurate.
- Working-time totals, max shift warnings, daily rest totals, and compliance warnings must be stable and trustworthy.
- Driving-time totals are for driver reference, mainly weekly and two-weekly awareness.
- Minor driving-detection variation is acceptable if the app avoids timer resets, deleted saved state, and gross over-counting.
- All added dependencies or native approaches must be open source and usable without paid licence fees.

## Current Risk Summary

The main risks are not the EU/WTD calculations themselves. The main risks are state durability and motion-source reliability:

- A single mutable session snapshot can be overwritten by stale local state or stale DB state.
- Background task location samples may be applied using receipt time instead of GPS sample time.
- Background task currently processes only the first delivered location sample.
- Pending driving-stop evidence can be lost when the app is backgrounded or killed.
- The app lacks enough motion/timer diagnostics to prove why a live-test decision happened.
- Driving detection is allowed to influence totals, but it should never destabilize the core shift/work/break timers.

## Priority Order

### 1. Make Timer Persistence Authoritative And Monotonic

Importance: Critical

Difficulty: Medium

Purpose: Prevent timer resets, vanished saved statuses, and stale restores after background/resume.

Changes:

- Define one restore precedence rule that cannot be bypassed: active DB session plus the most progressed valid local runtime state.
- Treat start shift and end shift as hard boundaries. No local restore may create a shift before the DB start time or continue after the DB end time.
- Add monotonic guards before applying restored totals. A restored active timer must not reduce already accrued work, break, POA, or driving totals unless it is correcting a known pending overrun.
- Store a `last_checkpoint_at`, `last_tick_at`, and `state_version` in persisted runtime state.
- Reject any local state whose `session_id`, `user_id`, `shift_start`, or `state_version` does not match the active DB session.
- Add tests for resume after background, resume after app kill, stale local state, stale DB state, break restore, POA restore, and end-shift restore.

Acceptance criteria:

- Opening the screen repeatedly cannot reset elapsed work time.
- A break, POA, work, or driving status saved to DB cannot vanish because older local storage wins.
- Ended shifts cannot be resurrected from local storage.

### 2. Add An Append-Only Activity Segment Ledger

Importance: Critical

Difficulty: High

Purpose: Stop relying only on one mutable snapshot for the truth of what happened.

Changes:

- Add a local-first segment model for shift activity changes:
  - `id`
  - `session_id`
  - `activity_type`
  - `start_time`
  - `end_time`
  - `source`
  - `confidence`
  - `created_at`
  - `updated_at`
  - `synced_at`
- Activity types should cover `work`, `break`, `poa`, and `driving_reference`.
- Start shift creates the first open segment.
- Changing mode closes the current segment and opens the next one atomically.
- End shift closes the current segment and locks the session.
- Derive display totals from closed segments plus the current open segment.
- Keep the existing `work_sessions` row as a summary/cache, not the only source of truth.
- Queue unsynced segment writes locally when offline or backgrounded, then sync later.

Acceptance criteria:

- If the app crashes mid-shift, totals can be reconstructed from segments.
- If a summary row is stale, the segment ledger can repair it.
- Duplicate mode-change calls do not create overlapping segments.

### 3. Persist Pending Motion Transitions

Importance: High

Difficulty: Medium

Purpose: Preserve stop/start evidence across backgrounding so driving overrun corrections remain stable.

Changes:

- Persist motion detector state:
  - `moving_since_ms`
  - `stationary_since_ms`
  - `last_speed_kmh`
  - `last_speed_ts`
  - `last_location_ts`
  - `last_accuracy_m`
  - `driving_score`
  - `pending_transition_type`
  - `pending_transition_started_at_ms`
- Save this state from both foreground and background location handling.
- On resume, continue confirmation from the original pending timestamp rather than restarting the confirmation window.
- If a driving stop is confirmed late, move only the already-accrued overrun from driving reference totals into normal work totals. Do not reset the live work timer.

Acceptance criteria:

- Backgrounding during a stop confirmation does not lose the original stopped timestamp.
- Stop-start traffic does not cause large accumulated driving overrun.
- Overrun correction adjusts totals without causing visible work timer resets.

### 4. Process Background Location Samples Correctly

Importance: High

Difficulty: Low

Purpose: Remove avoidable background timing errors.

Changes:

- Process every location in `data.locations`, not just `locations[0]`.
- Sort samples by `location.timestamp` before applying them.
- Use the GPS sample timestamp as `sampleTs` and decision time where safe.
- Keep receipt time separately for diagnostics.
- Ignore stale samples that arrive too late to be useful.
- Save the latest processed sample timestamp to prevent double-processing.

Acceptance criteria:

- A batch of delayed background locations is replayed in chronological order.
- Driving stop/start decisions are based on when the vehicle moved or stopped, not when JS woke up.
- Duplicate background samples are ignored safely.

### 5. Add Computed-Speed Fallback

Importance: High

Difficulty: Medium

Purpose: Reduce bad decisions when platform-reported GPS speed is missing, delayed, or sticky.

Changes:

- Store the last accepted location sample with latitude, longitude, timestamp, speed, and accuracy.
- When `coords.speed` is null, zero while distance clearly changed, or suspiciously stale, compute speed from distance over elapsed time.
- Use computed speed only when both samples have acceptable accuracy and realistic elapsed time.
- Prefer platform speed when it is present, fresh, and plausible.
- Record whether each decision used GPS speed or computed speed.

Acceptance criteria:

- Driving can still be detected when Android does not provide reliable `coords.speed`.
- Stop detection is not held open by one stale high-speed reading.
- Bad GPS jumps do not create false driving spikes.

### 6. Add A Motion And Timer Diagnostic Ring Buffer

Importance: High

Difficulty: Low

Purpose: Make live-test failures explainable instead of guessed.

Changes:

- Store the last 100 to 250 decision records locally.
- Record:
  - receipt time
  - sample time
  - app state
  - speed from GPS
  - computed speed
  - selected speed
  - accuracy
  - previous driving state
  - next driving state
  - moving/stationary since timestamps
  - ignored reason
  - reducer event applied
  - totals before and after
- Add a developer/export action to copy or share diagnostics after a live test.
- Keep diagnostics bounded so storage cannot grow unbounded.

Acceptance criteria:

- After a bad live test, the last decisions show exactly why the timer changed or did not change.
- Diagnostics can confirm whether the cause was stale GPS, background delay, restore logic, or reducer logic.

### 7. Isolate Driving Reference Logic From Core Work Timers

Importance: High

Difficulty: Medium

Purpose: Ensure imperfect driving detection cannot corrupt the core working-time product.

Changes:

- Treat automatic driving as a reference overlay on top of working time.
- Work time should continue accruing during detected driving because driving is also work for WTD purposes.
- Driving changes should affect driving reference totals, drive-cycle warnings, and weekly/two-weekly driving reference totals.
- Driving detection must not be allowed to reset shift start, work start, current mode, or manually selected break/POA status.
- Add explicit guards that pause or ignore auto-driving decisions during break and POA unless the product deliberately wants driving to interrupt those modes.

Acceptance criteria:

- A false driving start cannot reset work elapsed time.
- A false driving stop cannot reset current work segment start.
- Manual break and POA remain stable after background/resume.

### 8. Add Local Offline Queue For Critical Timer Writes

Importance: Medium-High

Difficulty: Medium

Purpose: Avoid losing state when DB writes fail or the device has poor signal.

Changes:

- Queue critical writes locally:
  - start shift
  - mode change
  - segment close/open
  - checkpoint summary
  - end shift
- Make queued writes idempotent with deterministic IDs.
- Retry in order.
- Never let a failed checkpoint overwrite newer local progress.
- Surface a small internal health flag if critical writes are pending too long.

Acceptance criteria:

- Poor network cannot cause a visible timer reset.
- Replayed writes do not duplicate segments.
- End shift remains reliable even if the first DB update fails.

### 9. Harden AppState Resume And Screen Mount Behaviour

Importance: Medium-High

Difficulty: Medium

Purpose: Stop screen open/close cycles from rehydrating stale state.

Changes:

- Separate screen mount from session restore. Mounting a screen should not repeatedly run destructive restore logic.
- Debounce resume refreshes.
- Allow one active restore operation at a time.
- Make refresh idempotent: running it five times should produce the same state as running it once.
- On AppState `background`, persist local state first, then attempt DB checkpoint.
- On AppState `active`, load DB/local state, reconcile, then apply only if it advances or validates current state.

Acceptance criteria:

- Opening and closing the screen repeatedly does not change totals unexpectedly.
- App resume cannot apply an older snapshot over a newer in-memory state.
- Rapid AppState changes do not interleave checkpoint and restore writes.

### 10. Add Open-Source Native Background Reliability Options

Importance: Medium

Difficulty: High

Purpose: Improve Android background survival without paid SDK dependencies.

Open-source candidates to investigate before implementation:

- Expo TaskManager plus stricter processing and diagnostics, keeping the current dependency path.
- A small custom Android foreground service module for location and heartbeat persistence.
- Open-source React Native background service/location libraries, only if actively maintained and compatible with the current Expo/EAS setup.

Preferred direction:

- First harden the current Expo implementation.
- If live tests still show OS wakeup gaps, build a minimal open-source native Android foreground service owned by this app.
- Keep all service output behind the same motion-source adapter so the reducer and timer model do not change.

Acceptance criteria:

- No paid licence dependency.
- Background location/timer updates survive normal Android backgrounding with battery optimization handled.
- The native layer only supplies events; business rules remain in the TypeScript reducer.

### 11. Tune Driving Detection Conservatively

Importance: Medium

Difficulty: Low-Medium

Purpose: Improve 98-99% reference accuracy without destabilizing timers.

Changes:

- Tune thresholds only after diagnostics are available.
- Prefer slightly late driving stop correction over false stopping during slow traffic.
- Prefer immediate driving start only above a clear threshold.
- Add configurable internal test presets for urban stop-start, motorway, yard movement, and poor GPS.
- Keep all tuning covered by reducer/detection tests.

Acceptance criteria:

- Two-hour drive reference total should normally stay within a small margin of the tacho.
- Stop-start traffic should not accumulate repeated 20+ second stale driving tails.
- Poor GPS should degrade gracefully rather than thrash modes.

### 12. Expand Reliability Test Coverage

Importance: Medium

Difficulty: Medium

Purpose: Prevent regressions like the live-test reset from returning.

Changes:

- Add tests for:
  - start shift, background 5 minutes, resume
  - screen mount/unmount loops
  - work to break, background, resume
  - work to POA, background, resume
  - driving stop confirmed after delayed background batch
  - DB stale but local newer
  - local stale but DB newer
  - end shift followed by stale local restore attempt
- Add fixture timelines for real-world driving:
  - motorway
  - stop-start city traffic
  - delivery yard crawling
  - GPS stale while app backgrounded

Acceptance criteria:

- Timer reset regressions fail tests.
- Driving overrun correction is tested with delayed samples.
- Restore precedence is tested independently from UI rendering.

## Suggested Implementation Sequence

Phase 1: Stop the resets

1. Make timer persistence authoritative and monotonic.
2. Harden AppState resume and screen mount behaviour.
3. Process background location samples correctly.
4. Add immediate tests for the live-test reset scenario.

Phase 2: Make failures diagnosable

1. Add the diagnostic ring buffer.
2. Add computed-speed fallback.
3. Persist pending motion transitions.

Phase 3: Make state reconstructable

1. Add the append-only activity segment ledger.
2. Add the offline queue for critical writes.
3. Derive totals from segments plus the current open segment.

Phase 4: Improve background robustness

1. Live-test the hardened Expo path.
2. If background gaps remain, investigate an open-source custom Android foreground service.
3. Keep native background code as an event source only.

Phase 5: Tune driving reference accuracy

1. Use diagnostics from real routes.
2. Tune thresholds conservatively.
3. Add fixture tests for every tuning decision.

## Non-Goals

- Do not implement paid/licensed background geolocation SDKs.
- Do not chase certified tachograph-level precision.
- Do not let automatic driving detection override the reliability of shift/work/break/POA timers.
- Do not make threshold changes without diagnostics that show the current failure mode.

## Definition Of Done

The hardening work is complete when:

- Start and end shift are durable and cannot be changed by stale restore state.
- Work, break, POA, and driving reference totals do not reset after background/resume.
- Repeated screen opening does not alter totals.
- Background location batches are processed by sample time.
- Driving overrun corrections do not affect the live work timer incorrectly.
- A failed live test produces enough diagnostics to identify the cause.
- All new dependencies and native code paths are open source and free to ship.
