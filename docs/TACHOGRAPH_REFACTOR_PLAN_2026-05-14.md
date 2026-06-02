# Tachograph Refactor Plan

Date: 2026-05-14

## Goal

Refactor the tachograph/work timer implementation as a staged extraction, not a rewrite. The immediate objective is to move rule decisions into pure modules first, then make `useWorkTimer.ts` dispatch into them while leaving the current UI, notifications, storage, and Supabase flow intact.

## Guiding Principles

- Preserve the current public hook API used by `Dashboard.tsx`.
- Extract pure logic before changing side-effect wiring.
- Keep each phase reversible and testable.
- Unify foreground and background rule execution to reduce drift.
- Reduce direct mutation inside `useWorkTimer.ts` before attempting bug repair.

## Phase 0: Baseline And Tests

### Objectives

- Add a minimal pure-logic test setup.
- Capture current behaviour before moving logic.
- Add restore/resume and background reconciliation coverage.

### Scope

- Add a test runner to `package.json`.
- Write characterization tests for:
  - `src/lib/tacho/timing.ts`
  - `src/lib/tacho/transitions.ts`
  - `src/lib/tacho/drivingDetection.ts`
  - `src/lib/tacho/display.ts`
- Add restore/resume scenarios based on:
  - `src/hooks/useWorkTimer.ts`
  - `index.ts`

### Intended Outcome

The existing behaviour is documented in executable tests so later extractions can be verified instead of guessed.

## Phase 1: Canonical State Model

### Objectives

- Introduce a single machine-oriented state shape.
- Define typed events and effect commands.
- Stop relying on scattered refs as the informal state machine contract.

### Scope

- Add a new module such as `src/lib/tacho/machine.ts`.
- Define:
  - `TachoState`
  - `TachoEvent`
  - `TachoCommand`
- Include:
  - work status
  - segment start
  - work start
  - break state
  - timer mode
  - totals
  - work and driving cycles
  - weekly driving accumulator
  - shift extension allowance
  - reduced rest metadata
  - motion debounce state
  - previous alert threshold state

### Intended Outcome

There is one canonical state definition that can be shared by the hook and the background task.

## Phase 2: Pure Reducer Extraction

### Objectives

- Move rule decisions into one reducer.
- Make state transitions explicit and testable.

### Scope

- Centralize:
  - elapsed-time application from `timing.ts`
  - status transitions from `transitions.ts`
  - driving flips from `transitions.ts`
  - alert threshold crossing logic currently in `useWorkTimer.ts`
- Make the reducer return:
  - `nextState`
  - `commands`

### Example Commands

- `persist`
- `sync_session`
- `schedule_alerts`
- `speak_alert`
- `start_tracking`
- `stop_tracking`

### Intended Outcome

Rule decisions become pure and side-effect free, while the hook remains responsible for executing commands.

## Phase 3: Hook Becomes Dispatcher

### Objectives

- Keep `useWorkTimer.ts` as the integration layer.
- Stop mutating business state in multiple places.

### Scope

- Replace direct mutation paths for:
  - `commitAndFlipDriving`
  - `updateTotalsAndSwitchStatus`
  - restore flow
  - periodic ticking
  - end-shift transitions
- Keep side effects in the hook for now:
  - AsyncStorage
  - Supabase sync
  - notifications
  - speech

### Intended Outcome

`useWorkTimer.ts` becomes an orchestrator around reducer dispatch and command execution rather than the main rules engine.

## Phase 4: Motion Detector Adapter

### Objectives

- Extract motion debounce and sensor coordination from the hook.
- Reuse the current driving heuristics, but centralize stateful interpretation.

### Scope

- Add a dedicated module such as `src/lib/tacho/motionDetector.ts`.
- Move ownership of:
  - `lastSpeed`
  - `lastSpeedTs`
  - `movingSince`
  - `stationarySince`
  - `drivingScore`
- Emit normalized events such as:
  - `LOCATION_SAMPLE`
  - `ACCEL_SAMPLE`
  - `MOVEMENT_STARTED`
  - `MOVEMENT_STOPPED`
  - `BACKGROUND_SPEED_SAMPLE`

### Intended Outcome

Motion detection is isolated from hook orchestration and can be tested independently.

## Phase 5: Unify Background And Foreground Logic

### Objectives

- Make `index.ts` and `useWorkTimer.ts` use the same rule path.
- Remove background-only rule drift.

### Scope

- Route background task updates through the same reducer/event path used in the hook.
- Remove hardcoded background-specific logic where possible, including fixed spread-limit assumptions.

### Intended Outcome

Foreground and background state progress consistently under the same rules.

## Phase 6: Simplify Hook State

### Objectives

- Remove redundant `useState` and `useRef` mirrors.
- Keep only UI-facing state and async flags in React state.

### Scope

- Reduce duplicated synchronization code inside `useWorkTimer.ts`.
- Keep React state for:
  - render-facing display
  - loading flags such as `isStarting`
  - shift summary modal data
- Source business state from the canonical machine state.

### Intended Outcome

The hook becomes smaller, more predictable, and easier to debug.

## Recommended Delivery Order

1. First deliverable: Phase 0 and Phase 1.
2. Second deliverable: Phase 2 with tests.
3. Third deliverable: Phase 3 for status changes and ticking.
4. Fourth deliverable: Phase 4 and Phase 5 for motion and background unification.
5. Final cleanup: Phase 6.

## Expected Early Benefits

- Fewer double-apply and catch-up timing bugs.
- One rule path for foreground and background.
- Safer restore and resume behaviour.
- A smaller, more testable surface area before fixing the newly discovered bugs.
