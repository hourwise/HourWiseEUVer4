# Launch Readiness Tracker

Created: 2026-06-02
Purpose: Track launch-preparation work in a resumable format so another agent can continue from this file if the session is interrupted.

Primary reference:

- `docs/LAUNCH_READINESS_IMPLEMENTATION_SEQUENCE_2026-06-02.md`

Supporting references:

- `docs/AUTH_STARTUP_REVIEW_2026-04-26.md`
- `AUTH_FLOW_ANALYSIS_AND_PLAN.md`
- `ARCHITECTURE_DATAFLOW.md`
- `docs/APP_HEALTH_REPORT_2026-04-25.md`
- `docs/APP_ACTION_PLAN_2026-04-27.md`
- `APP_READINESS_REPORT.md`

## Status Legend

- `not_started`
- `in_progress`
- `blocked`
- `ready_for_review`
- `done`
- `deferred`

## Owner Legend

- `USER`
- `AGENT`
- `USER+AGENT`
- `EXTERNAL`

## Resume Protocol

If a future agent resumes from this file:

1. Read `docs/LAUNCH_READINESS_IMPLEMENTATION_SEQUENCE_2026-06-02.md` first.
2. Read this tracker second.
3. Start with all items marked `in_progress` or `blocked`.
4. Update:
   - `Last Updated`
   - `Current Focus`
   - the relevant row status
   - `Notes / Evidence`
   - `Next Action`
5. Do not start paywall enforcement work until auth/startup stabilization and security audit phases are substantially complete.

## Snapshot

Last Updated: 2026-06-07
Current Focus: Auth/startup stabilization first slice: bootstrapping stage, durable onboarding flags, and explicit paywall policy while keeping bypass mode active.
Current Release Mode: Internal / controlled testing
Paywall Mode Target Right Now: `bypass`
Highest Priority Workstream: Auth and startup stabilization

## Launch Gate Summary

| Gate | Status | Owner | Notes |
| --- | --- | --- | --- |
| Auth/startup deterministic | `in_progress` | `USER+AGENT` | Bootstrapping stage introduced; full auth UI split still pending |
| Durable onboarding state | `in_progress` | `USER+AGENT` | Explicit last-shift completion persistence started with DB migration + auth flow wiring |
| Fleet invite flow verified | `not_started` | `USER+AGENT` | Still needs end-to-end real validation |
| Real-device field validation complete | `not_started` | `USER` | Notifications, drive detection, shift flows |
| Crash/event observability live | `not_started` | `USER+AGENT` | Sentry or Crashlytics not yet integrated |
| RevenueCat production policy ready | `in_progress` | `USER+AGENT` | Explicit paywall policy model added; current mode remains `bypass` |
| Supabase security audit complete | `not_started` | `USER+AGENT` | Launch blocker |
| Mobile app security audit complete | `not_started` | `USER+AGENT` | Launch blocker |
| Signing/secrets/release hygiene complete | `not_started` | `USER+AGENT` | Launch blocker |
| Final go/no-go review complete | `not_started` | `USER+AGENT` | Final phase only |

## Workstream Tracker

| ID | Workstream | Status | Owner | Priority | Dependencies | Deliverable | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LR-01 | Stabilize auth/startup flow | `in_progress` | `USER+AGENT` | `P0` | none | Single boot-state-driven startup flow | Finish consolidating remaining auth transitions and reduce auth screen complexity |
| LR-02 | Persist onboarding completion durably | `in_progress` | `USER+AGENT` | `P0` | LR-01 | Durable last-shift onboarding state | Apply new profile-column migration to Supabase and validate returning-user behavior |
| LR-03 | Remove setup auto-advance and flow hacks | `done` | `USER+AGENT` | `P1` | LR-01 | Stable setup UX without timer-driven navigation | Completed in `FirstTimeSetupGuide` |
| LR-04 | Refactor auth UI into smaller flows | `not_started` | `USER+AGENT` | `P1` | LR-01 | Separate sign-in, sign-up, invite, biometric surfaces | Define desired component split |
| LR-05 | Formalize paywall policy | `in_progress` | `USER+AGENT` | `P1` | LR-01 | `bypass / observe / enforce` policy model | Validate observe/enforce behavior after auth/startup flow is cleaner |
| LR-06 | Verify fleet invite onboarding | `not_started` | `USER+AGENT` | `P0` | LR-01 | Passing fleet invite create-account path | Test exact invite journey and capture failures |
| LR-07 | Verify solo auth/setup journey | `not_started` | `USER+AGENT` | `P0` | LR-01 | Passing solo sign-up/sign-in/setup path | Create test checklist for cold start and relogin |
| LR-08 | Real-device notification validation | `not_started` | `USER` | `P0` | current notification fixes | Confirm background notifications on test device | Run tomorrow’s field test and log results |
| LR-09 | Real-device drive/timer validation | `not_started` | `USER` | `P0` | current tacho fixes | Confirm behavior against real-world usage | Compare with expected thresholds and note drift |
| LR-10 | Add crash reporting | `not_started` | `USER+AGENT` | `P1` | LR-01 | Sentry or Crashlytics integration | Choose provider and DSN/keys strategy |
| LR-11 | Add key analytics/events | `not_started` | `USER+AGENT` | `P2` | LR-10 | Minimal launch analytics/event set | Define event list and privacy constraints |
| LR-12 | RevenueCat production wiring | `not_started` | `USER+AGENT` | `P1` | LR-05 | Production billing config ready | Gather API keys, entitlement ID, offering IDs |
| LR-13 | RevenueCat observe-mode validation | `not_started` | `USER+AGENT` | `P1` | LR-12 | Non-blocking paywall telemetry in test mode | Implement only after auth/startup is cleaner |
| LR-14 | Supabase asset inventory | `not_started` | `USER+AGENT` | `P0` | none | Inventory of tables, RPCs, storage, functions | Enumerate all app-used Supabase assets |
| LR-15 | Supabase RLS audit | `not_started` | `USER+AGENT` | `P0` | LR-14 | Table-by-table access matrix | Review client-accessible tables and policies |
| LR-16 | Supabase RPC and edge-function audit | `not_started` | `USER+AGENT` | `P0` | LR-14 | RPC/function audit notes and fixes list | Inspect invite, auth-adjacent, and messaging logic |
| LR-17 | Database type/schema reconciliation | `not_started` | `USER+AGENT` | `P1` | LR-14 | Confirm app expectations match live schema | Regenerate and verify `database.types.ts` when needed |
| LR-18 | Secrets handling audit | `not_started` | `USER+AGENT` | `P0` | none | Secret inventory and remediation list | Review env usage, EAS secrets, repo-tracked files |
| LR-19 | Signing and keystore hygiene | `not_started` | `USER+AGENT` | `P0` | LR-18 | Clean release-signing posture | Confirm no weak/exposed credentials remain |
| LR-20 | Secure storage and session audit | `not_started` | `USER+AGENT` | `P1` | LR-01 | Review of token/session handling | Inspect biometric/session lifecycle and revoke behavior |
| LR-21 | Release-mode config audit | `not_started` | `USER+AGENT` | `P0` | LR-18 | Verify release builds are free of test-only assumptions | Define prod vs test env checklist |
| LR-22 | Dependency and package security review | `not_started` | `USER+AGENT` | `P2` | none | Dependency review notes | Run package audit and record meaningful findings |
| LR-23 | Release checklist and rollback plan | `not_started` | `USER+AGENT` | `P1` | LR-01, LR-10, LR-15, LR-19 | Repeatable release process | Draft store release checklist and rollback triggers |
| LR-24 | Final launch readiness review | `not_started` | `USER+AGENT` | `P0` | all launch blockers | Go/no-go recommendation | Only start when all P0 items are at least review-ready |

## Detailed Checklist

## 1. Auth and Startup

| Item | Status | Owner | Notes / Evidence |
| --- | --- | --- | --- |
| Define canonical `BootState` shape | `in_progress` | `AGENT` | Navigator now derives one boot stage locally; provider consolidation still pending |
| Decide provider ownership model | `not_started` | `USER+AGENT` | BootstrapProvider vs refactor of AuthProvider |
| Add dedicated bootstrap route/state | `done` | `AGENT` | `BootstrappingScreen` added and driven by auth/bootstrap state |
| Persist last-shift onboarding completion | `in_progress` | `USER+AGENT` | DB migration + auth persistence added; needs live migration and device validation |
| Remove timed setup auto-advance | `done` | `AGENT` | `FirstTimeSetupGuide` no longer auto-navigates |
| Simplify login UX transitions | `in_progress` | `USER+AGENT` | Post-session bootstrap stage added; auth component is still overloaded |

## 2. Billing and Paywall

| Item | Status | Owner | Notes / Evidence |
| --- | --- | --- | --- |
| Keep bypass enabled in current testing builds | `done` | `USER` | Code path still defaults to `bypass` and does not enforce paywall |
| Define explicit paywall policy model | `done` | `AGENT` | `EXPO_PUBLIC_PAYWALL_POLICY` with `bypass / observe / enforce`, legacy bypass env still respected |
| Add observe-mode plan | `not_started` | `AGENT` | Non-blocking telemetry path |
| Gather RevenueCat production config | `not_started` | `USER` | Keys, entitlement, offering IDs |
| Validate solo subscribed/unsubscribed paths | `not_started` | `USER+AGENT` | After observe/enforce work begins |

## 3. Fleet and Solo Onboarding

| Item | Status | Owner | Notes / Evidence |
| --- | --- | --- | --- |
| Test fleet create-account invite path | `not_started` | `USER` | Use exact intended mobile flow |
| Improve invite verification diagnostics | `not_started` | `AGENT` | Missing, expired, used, environment mismatch |
| Test solo sign-up cold start behavior | `not_started` | `USER` | Ensure setup is shown once only |
| Test returning-user routing | `not_started` | `USER` | Verify no repeated onboarding |

## 4. Real-World Runtime Validation

| Item | Status | Owner | Notes / Evidence |
| --- | --- | --- | --- |
| Background notifications test | `not_started` | `USER` | Planned for tomorrow’s device test |
| Shift start/end flow test | `not_started` | `USER` | Real device only |
| Break timing test | `not_started` | `USER` | Validate expected transitions |
| Drive detection field validation | `not_started` | `USER` | Compare against real usage |
| Battery/background survival test | `not_started` | `USER` | Screen off, background, device idle |

## 5. Observability

| Item | Status | Owner | Notes / Evidence |
| --- | --- | --- | --- |
| Choose crash reporting provider | `not_started` | `USER+AGENT` | Sentry vs Crashlytics |
| Add build/environment identifier | `not_started` | `AGENT` | Beta/test labeling and version clarity |
| Define minimal event taxonomy | `not_started` | `USER+AGENT` | Keep privacy-conscious |
| Add startup/auth diagnostics policy | `not_started` | `AGENT` | Avoid sensitive logging |

## 6. Supabase Security Audit

| Item | Status | Owner | Notes / Evidence |
| --- | --- | --- | --- |
| Inventory tables, views, RPCs, buckets, functions | `not_started` | `AGENT` | Launch blocker workstream start |
| Document client-exposed tables | `not_started` | `AGENT` | Include read/write matrix |
| Review RLS for profiles/pay/work/invites/messages | `not_started` | `AGENT` | Launch blocker |
| Review RPC ownership validation | `not_started` | `AGENT` | Especially invite and account-adjacent RPCs |
| Review edge-function secret usage | `not_started` | `AGENT` | Ensure no over-broad behavior |
| Review storage bucket exposure | `not_started` | `AGENT` | Signed URLs vs public access |
| Regenerate/reconcile DB types if needed | `not_started` | `AGENT` | Keep app and schema aligned |

## 7. Mobile App Security Audit

| Item | Status | Owner | Notes / Evidence |
| --- | --- | --- | --- |
| Secret inventory across repo and build config | `not_started` | `AGENT` | Check envs, credentials, tracked files |
| Review EAS secret handling | `not_started` | `USER+AGENT` | Ensure secrets not committed locally |
| Review signing and keystore posture | `not_started` | `USER+AGENT` | Launch blocker |
| Review biometric/session storage flow | `not_started` | `AGENT` | SecureStore and revoke/sign-out behavior |
| Review logs for sensitive data leakage | `not_started` | `AGENT` | Tokens, payroll, personal info |
| Review release vs debug config separation | `not_started` | `AGENT` | No hidden test-only assumptions in prod |
| Review dependency risk | `not_started` | `AGENT` | Focus on meaningful launch issues only |

## 8. Release Operations

| Item | Status | Owner | Notes / Evidence |
| --- | --- | --- | --- |
| Confirm versioning strategy | `not_started` | `USER+AGENT` | Align app.json/native/release track |
| Define release candidate checklist | `not_started` | `AGENT` | Typecheck, tests, env, smoke checks |
| Define rollback triggers | `not_started` | `USER+AGENT` | Crash rate, auth failures, billing failures |
| Define store submission prerequisites | `not_started` | `USER` | Assets, policy text, metadata |

## Blockers

Record active blockers here.

| ID | Blocker | Status | Owner | Resolution Path |
| --- | --- | --- | --- | --- |
| B-01 | Auth/startup still janky | `open` | `USER+AGENT` | Complete LR-01 first |
| B-02 | Launch security audit not started | `open` | `USER+AGENT` | Complete LR-14 through LR-21 |
| B-03 | Real-device validation incomplete | `open` | `USER` | Execute LR-08 and LR-09 |

## Notes and Evidence Log

Use this section to leave continuity notes for future sessions.

### 2026-06-02

- Created from planning docs only.
- No implementation has started from this tracker yet.
- Current immediate next real-world task is device notification testing.
- Current highest-value engineering task remains auth/startup stabilization.

### 2026-06-07

- Added `BootstrappingScreen` and navigator boot-stage derivation so startup routing is driven from one derived stage instead of independent loading checks.
- Added `bootstrapping` state to `AuthProvider` so post-login and post-biometric bootstrap transitions have a dedicated loading phase.
- Added `last_shift_onboarding_completed_at` migration and wired `completeLastShiftEntry()` to persist it.
- Updated auth bootstrap logic to use the explicit last-shift completion flag, with `work_sessions` kept as a legacy fallback for existing users.
- `DriverSetup` now stamps `first_time_setup_completed_at` when setup is saved.
- `FirstTimeSetupGuide` auto-advance removed.
- Subscription config now supports explicit `bypass / observe / enforce` paywall policy while preserving `bypass` as the current default.
- Normal sign-out now preserves device biometric sign-in, with explicit disable controls added and invalid stored biometric sessions cleared automatically on restore failure.
- `Auth.tsx` is now split into smaller sign-in, sign-up, fleet-invite, and biometric presentation components under `src/components/auth/`.
- Invite verification diagnostics now distinguish empty, missing, expired, already-used, and other inactive invite states with user-facing guidance.
- Verification: `npm run ts:check` passed on 2026-06-07; `npm run test:tacho` passed on 2026-06-07.

## Suggested Immediate Next Actions

1. Apply the new Supabase migration and validate that returning users do not re-enter last-shift onboarding.
2. Continue LR-01 by splitting `Auth.tsx` into smaller sign-in/sign-up/invite/biometric units.
3. Validate `observe` paywall behavior only after the auth/startup slice is stable on device.
