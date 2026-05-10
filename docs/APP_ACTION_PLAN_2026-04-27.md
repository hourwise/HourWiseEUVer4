# App Action Plan

Date: 2026-04-27
Repo: `HourWiseEUVer4`

## Current Position

The repo is in a materially better state than it was on 2026-04-25.

### Completed since the original plan

- `ts:check` is now clean at **0 errors**
- `useWorkTimer` has been split into smaller `src/lib/tacho/*` modules
- tachograph break/work/drive logic has been corrected in several key areas
- dead/stale files have been reduced
- duplicate background task wiring was removed
- `ErrorBoundary` is now mounted
- auth/startup lifecycle problems were fixed:
  - auth listener cleanup
  - fail-closed bootstrap defaults
  - invite verify UI hardening
  - missing subscription route fixed
- subscription gating now uses env/config scaffolding instead of a hardcoded code-path hack
- RevenueCat bootstrap/helper scaffolding is in place
- biometric quick sign-in has been added using secure token storage

### Current practical state

- core compiler safety: **good**
- tachograph logic: **improving, but still field-validated**
- auth/startup: **better, still needs flow refinement**
- subscription/revenuecat: **scaffolded, not production-ready**
- fleet invite flow: **still needs investigation**

## What is done

### Phase 1: TypeScript trust

Status: **done**

Completed:

- compile scope narrowed
- i18n bootstrap fixed
- timer constant/type drift fixed
- icon typing normalized
- database types reconciled enough for mobile app compile

Outcome:

- `npm run ts:check` passes

### Phase 2: Auth/profile contract stabilization

Status: **mostly done**

Completed:

- canonical `useAuth()` contract established around `session` / `profile`
- stale consumers fixed or removed
- auth listener cleanup fixed
- bootstrap fail-closed behavior added
- missing subscription route registered

Still open:

- improve bootstrap failure UX beyond simple fail-closed routing
- verify fleet invite creation/verification end to end

### Phase 3: Dead-thread cleanup

Status: **partly done**

Completed removals:

- `src/components/AlertTestPanel.tsx`
- `src/hooks/useCreateProfile.ts`
- `src/hooks/useDriverStats.ts`
- `src/screens/CreateProfileScreen.tsx`
- `src/components/TimeGapConfirmationModal.tsx`
- `src/components/TimezoneSelector.tsx`

Completed cleanup:

- duplicate background task removed from `src/App.tsx`
- `ErrorBoundary` wired into app root

Still intentionally kept:

- `src/screens/SettingsScreen.tsx`
- `src/components/RegionalRulesModal.tsx`

### Phase 4: Structural refactors

Status: **started**

Completed:

- `useWorkTimer` decomposition into `src/lib/tacho`

Not yet done:

- `Dashboard.tsx` split
- `DownloadReportModal.tsx` split
- `BusinessProfileModal.tsx` split

### Phase 5: Safety nets

Status: **partly done**

Completed:

- local tachograph harness maintained
- core timer logic more testable than before

Still open:

- extend pure scenario tests
- add release-check routine
- document auth/session/subscription contracts

## Immediate Known Issues

### 1. Fleet invite verification still unresolved

Current likely causes:

- tester used invite code on sign-in path instead of create-account fleet path
- portal edge function/email UX mismatch
- possible environment mismatch between portal and app

Next task:

- inspect actual invite usage path and add better mobile-side diagnostics

### 2. RevenueCat is not fully live

Current state:

- env-driven bypass exists
- helper/provider scaffold exists
- paywall now fails safely when config is missing
- internal test path should use bypass

Still needed:

- real RevenueCat keys
- real entitlement/offering wiring
- verified solo/fleet subscription behavior in a real build

### 3. Drive detection still needs field validation

Recent fixes:

- poor-accuracy GPS samples no longer suppress accelerometer fallback by refreshing stale speed timestamps
- break/work/drive counters have been improved

Still unknown:

- stop/start behavior in live traffic across a full shift
- low-speed manoeuvring and reverse undercount
- end-of-day drift against vehicle tachograph

## Next Steps

## Priority 1: Restore reliable internal testing

Goal:

- ensure testers cannot get blocked from the app again

Tasks:

1. rebuild internal-test artifact with:
   - `EXPO_PUBLIC_BYPASS_SUBSCRIPTION=true`
2. verify solo user bypasses paywall in the built artifact
3. verify paywall still has sign-out escape if reached unexpectedly

## Priority 2: Fix fleet invite onboarding

Goal:

- confirm fleet driver can create account with invite code

Tasks:

1. test the exact intended path:
   - `Create Account`
   - `Fleet Member`
   - `Verify`
2. add better mobile-side invite verification diagnostics:
   - missing
   - expired
   - not pending
3. review portal edge function behavior around invite creation vs email-send failure

## Priority 3: Real-world tachograph validation

Goal:

- compare app against vehicle tacho under actual road conditions

Tasks:

1. validate stop/start detection in:
   - lights
   - queues
   - junction pauses
   - yard/depot movements
2. record variance against vehicle display
3. decide whether to tune:
   - still threshold
   - stop confirmation delay
   - low-speed manoeuvre heuristic

## Priority 4: RevenueCat production wiring

Goal:

- move from scaffold to working solo-driver billing

Tasks:

1. provide RevenueCat public SDK keys
2. provide entitlement ID
3. verify offerings/paywall configuration
4. test:
   - solo unsubscribed
   - solo subscribed
   - restore purchases
   - fleet bypass

## Priority 5: Next structural cleanup

Goal:

- keep the codebase maintainable while feature work continues

Tasks:

1. split `Dashboard.tsx`
2. split `DownloadReportModal.tsx`
3. decide final fate of:
   - `src/main.tsx`
   - `src/index.css`
4. decide how `RegionalRulesModal` should source changing rules data

## Suggested Execution Order

### Next session

1. verify internal-test build env
2. fix fleet invite verification path
3. capture real-world drive detection observations

### After that

1. finish RevenueCat live setup
2. tune drive detection from field evidence
3. continue `Dashboard` / reporting refactors

## Decision Notes

- do **not** reintroduce manual timezone selection unless a real device-timezone failure case appears
- keep reverse/low-speed manoeuvre undercount as a documented limitation for now
- treat the app as a driver aid/training tool, not a legal tachograph replacement
