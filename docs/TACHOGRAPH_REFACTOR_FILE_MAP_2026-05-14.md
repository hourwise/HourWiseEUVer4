# Tachograph Refactor File Map

Date: 2026-05-14

## Purpose

This map turns the staged refactor plan into concrete file-by-file work. It is designed for incremental delivery, beginning with Phase 0 and Phase 1 so the current behaviour is preserved before deeper extraction.

## Phase 0: Baseline And Tests

### Create

- `package.json`
  - Add test scripts for pure TypeScript logic.
  - Add the minimum dev dependencies needed for running unit tests.

- `tsconfig.test.json`
  - Optional separate TypeScript config for tests if the chosen runner benefits from it.

- `src/lib/tacho/__tests__/timing.test.ts`
  - Cover elapsed application, break rounding, legal break contribution, and timer mode break completion rules.

- `src/lib/tacho/__tests__/transitions.test.ts`
  - Cover status transitions, driving flips, break completion, and segment rollover timing.

- `src/lib/tacho/__tests__/drivingDetection.test.ts`
  - Cover location-driven start and stop, accelerometer fallback, stale GPS handling, and resume decisions.

- `src/lib/tacho/__tests__/display.test.ts`
  - Cover derived totals, remaining counters, shift duration, current break display, and invalid timestamp fallback.

- `src/lib/tacho/__tests__/restoreResume.test.ts`
  - Characterize restore, catch-up, and resume assumptions currently split across `useWorkTimer.ts` and `index.ts`.

### Edit

- `src/lib/tacho/timing.ts`
  - Export any tiny helpers needed for tests only if necessary.
  - Avoid changing behaviour in this phase.

- `src/lib/tacho/transitions.ts`
  - Same rule as above: only expose what tests require.

- `src/lib/tacho/drivingDetection.ts`
  - Same rule as above.

- `src/lib/tacho/display.ts`
  - Same rule as above.

### Deliverable

The current pure logic and restore assumptions are covered by tests before refactor work starts.

## Phase 1: Canonical State Model

### Create

- `src/lib/tacho/machine.ts`
  - Initial home for:
    - `TachoState`
    - `TachoEvent`
    - `TachoCommand`
    - state factory helpers
    - adapter helpers for mapping existing persisted and hook state into canonical state

- `src/lib/tacho/machineState.ts`
  - Optional if `machine.ts` becomes too large.
  - Define canonical state shape and initialization helpers.

- `src/lib/tacho/machineEvents.ts`
  - Optional if event and command unions should be split from state types.

### Edit

- `src/lib/tacho/types.ts`
  - Keep existing shared types.
  - Add references or narrower aliases only where the machine should reuse existing types such as `Totals`, `TimerMode`, `WorkStatus`, and `DisplayState`.

- `src/lib/tacho/runtimeStorage.ts`
  - Prepare for canonical state serialization by mapping persisted data into `TachoState`-compatible fields.
  - Do not change storage keys yet unless unavoidable.

- `src/hooks/useWorkTimer.ts`
  - Add adapter functions at the boundary to build canonical state from current refs without changing flow yet.
  - Do not rewrite the hook in this phase.

- `index.ts`
  - Add canonical state mapping helpers for background restore only if needed.
  - Do not change behaviour yet.

### Deliverable

There is one typed state and event model that both the hook and background task can target.

## Phase 2: Pure Reducer Extraction

### Create

- `src/lib/tacho/reducer.ts`
  - Central reducer for:
    - elapsed-time application
    - work or break or POA transitions
    - driving flips
    - alert threshold crossing

- `src/lib/tacho/commands.ts`
  - Define typed command payloads if command unions make `machine.ts` noisy.

- `src/lib/tacho/selectors.ts`
  - Derived state helpers that are pure and reusable by both hook and background task.

- `src/lib/tacho/__tests__/reducer.test.ts`
  - High-value regression coverage for event-driven transitions.

### Edit

- `src/lib/tacho/timing.ts`
  - Reuse existing helpers from the reducer instead of duplicating them.

- `src/lib/tacho/transitions.ts`
  - Either fold logic into the reducer or keep as leaf helpers called by the reducer.

- `src/hooks/useWorkTimer.ts`
  - Start importing the reducer without dispatching everything through it yet.

### Deliverable

One pure reducer owns transition decisions and returns state plus commands.

## Phase 3: Hook Becomes Dispatcher

### Edit

- `src/hooks/useWorkTimer.ts`
  - Replace direct business-state mutation in:
    - `commitAndFlipDriving`
    - `updateTotalsAndSwitchStatus`
    - restore flow
    - periodic tick
    - end-shift transition handling
  - Keep side effects local to the hook, but drive them from reducer commands.

- `src/lib/tacho/sessionPayloads.ts`
  - Add helper functions if command execution needs cleaner payload construction.

- `src/lib/tacho/runtimeStorage.ts`
  - Add machine-state persistence helpers if that reduces hook branching.

- `src/lib/tacho/display.ts`
  - Keep it as a selector or adapt it into `selectors.ts` if the reducer pipeline needs one canonical derivation path.

### Deliverable

The hook becomes an orchestrator around dispatch and effect handling while preserving the current public API.

## Phase 4: Motion Detector Adapter

### Create

- `src/lib/tacho/motionDetector.ts`
  - Stateful adapter around the pure heuristics in `drivingDetection.ts`.
  - Own:
    - `lastSpeedKmh`
    - `lastSpeedTs`
    - `movingSinceMs`
    - `stationarySinceMs`
    - `drivingScore`

- `src/lib/tacho/__tests__/motionDetector.test.ts`
  - Cover GPS-driven start or stop, debounce behaviour, stale GPS fallback, and accelerometer-only fallback paths.

### Edit

- `src/lib/tacho/drivingDetection.ts`
  - Keep the low-level pure decisions and let the adapter compose them.

- `src/hooks/useWorkTimer.ts`
  - Remove direct ownership of sensor debounce refs where replaced by the adapter.

### Deliverable

Sensor interpretation becomes a distinct module that emits normalized events into the reducer path.

## Phase 5: Unify Background And Foreground Logic

### Edit

- `index.ts`
  - Replace custom background rule progression with reducer dispatch plus shared selectors.
  - Remove hardcoded background-specific rule assumptions where possible.

- `src/lib/tacho/machine.ts`
  - Add any background-safe event helpers needed by the task runner.

- `src/lib/tacho/reducer.ts`
  - Ensure background-originated events use the same transition rules as foreground events.

- `src/lib/tacho/runtimeStorage.ts`
  - Ensure persisted state remains compatible across foreground and background execution.

### Deliverable

Background location updates advance the same state machine used by the hook.

## Phase 6: Simplify Hook State

### Edit

- `src/hooks/useWorkTimer.ts`
  - Remove redundant `useRef` and `useState` mirrors after machine state is stable.
  - Retain only:
    - render-facing display state
    - async flags
    - shift summary UI state

- `src/screens/Dashboard.tsx`
  - Only adjust if the hook output shape needs minor compatibility helpers.

### Deliverable

`useWorkTimer.ts` becomes smaller and easier to reason about, with business state sourced from the canonical machine state.

## Suggested First Execution Slice

If work starts immediately, the safest first slice is:

1. Add test runner support in `package.json`.
2. Add `timing`, `transitions`, `drivingDetection`, and `display` characterization tests.
3. Create `src/lib/tacho/machine.ts` with the initial canonical `TachoState`, `TachoEvent`, and `TachoCommand` definitions only.
4. Add adapter helpers in `useWorkTimer.ts` and `index.ts` that map current state into the canonical shape without changing behaviour.

This gets test coverage and the shared type contract in place before any reducer migration begins.
