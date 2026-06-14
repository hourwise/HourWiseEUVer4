# Launch Readiness Tracker

Created: 2026-06-02
Purpose: Track launch-preparation work in a resumable format so another agent can continue from this file if the session is interrupted.

Primary reference:

- `docs/LAUNCH_READINESS_IMPLEMENTATION_SEQUENCE_2026-06-02.md`

Supporting references:

- `docs/archive/old-reports/docs/AUTH_STARTUP_REVIEW_2026-04-26.md`
- `docs/archive/old-reports/root/AUTH_FLOW_ANALYSIS_AND_PLAN.md`
- `docs/archive/old-reports/root/ARCHITECTURE_DATAFLOW.md`
- `docs/archive/old-reports/docs/APP_HEALTH_REPORT_2026-04-25.md`
- `docs/archive/old-reports/docs/APP_ACTION_PLAN_2026-04-27.md`
- `docs/archive/old-reports/root/APP_READINESS_REPORT.md`

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

Last Updated: 2026-06-14
Current Focus: Mobile app security/release hygiene after LR-15 remediation moved to the shared portal/database repo.
Current Release Mode: Internal / controlled testing
Paywall Mode Target Right Now: `bypass`
Highest Priority Workstream: Auth and startup stabilization

## Launch Gate Summary

| Gate | Status | Owner | Notes |
| --- | --- | --- | --- |
| Auth/startup deterministic | `ready_for_review` | `USER+AGENT` | Navigator consumes `useBootState()` backed by a typed `deriveBootState()` model; device validation still needed |
| Durable onboarding state | `in_progress` | `USER+AGENT` | Explicit last-shift completion persistence started with DB migration + auth flow wiring |
| Fleet invite flow verified | `not_started` | `USER+AGENT` | Still needs end-to-end real validation |
| Real-device field validation complete | `not_started` | `USER` | Notifications, drive detection, shift flows |
| Crash/event observability live | `not_started` | `USER+AGENT` | Sentry or Crashlytics not yet integrated |
| RevenueCat production policy ready | `in_progress` | `USER+AGENT` | Explicit paywall policy model added; current mode remains `bypass` |
| Supabase security audit complete | `in_progress` | `USER+AGENT` | LR-15 actioned in portal/shared-DB repo per user; mobile tracker proceeds with LR-18+ |
| Mobile app security audit complete | `in_progress` | `USER+AGENT` | Repo-side LR-18 audit note created; external rotation/history checks remain |
| Signing/secrets/release hygiene complete | `in_progress` | `USER+AGENT` | Release debug signing fallback blocked in CI/EAS; production signing still needs EAS verification |
| Final go/no-go review complete | `not_started` | `USER+AGENT` | Final phase only |

## Workstream Tracker

| ID | Workstream | Status | Owner | Priority | Dependencies | Deliverable | Next Action |
| --- | --- | --- | --- | --- | --- | --- | --- |
| LR-01 | Stabilize auth/startup flow | `ready_for_review` | `USER+AGENT` | `P0` | none | Single boot-state-driven startup flow | Validate cold start, sign-in, biometric sign-in, and returning-user routing on device |
| LR-02 | Persist onboarding completion durably | `in_progress` | `USER+AGENT` | `P0` | LR-01 | Durable last-shift onboarding state | Apply new profile-column migration to Supabase and validate returning-user behavior |
| LR-03 | Remove setup auto-advance and flow hacks | `done` | `USER+AGENT` | `P1` | LR-01 | Stable setup UX without timer-driven navigation | Completed in `FirstTimeSetupGuide` |
| LR-04 | Refactor auth UI into smaller flows | `done` | `USER+AGENT` | `P1` | LR-01 | Separate sign-in, sign-up, invite, biometric surfaces | Components split under `src/components/auth/`; future work is polish only |
| LR-05 | Formalize paywall policy | `in_progress` | `USER+AGENT` | `P1` | LR-01 | `bypass / observe / enforce` policy model | Validate observe/enforce behavior after auth/startup flow is cleaner |
| LR-06 | Verify fleet invite onboarding | `not_started` | `USER+AGENT` | `P0` | LR-01 | Passing fleet invite create-account path | Test exact invite journey and capture failures |
| LR-07 | Verify solo auth/setup journey | `not_started` | `USER+AGENT` | `P0` | LR-01 | Passing solo sign-up/sign-in/setup path | Create test checklist for cold start and relogin |
| LR-08 | Real-device notification validation | `not_started` | `USER` | `P0` | current notification fixes | Confirm background notifications on test device | Run tomorrow’s field test and log results |
| LR-09 | Real-device drive/timer validation | `not_started` | `USER` | `P0` | current tacho fixes | Confirm behavior against real-world usage | Compare with expected thresholds and note drift |
| LR-10 | Add crash reporting | `not_started` | `USER+AGENT` | `P1` | LR-01 | Sentry or Crashlytics integration | Choose provider and DSN/keys strategy |
| LR-11 | Add key analytics/events | `not_started` | `USER+AGENT` | `P2` | LR-10 | Minimal launch analytics/event set | Define event list and privacy constraints |
| LR-12 | RevenueCat production wiring | `not_started` | `USER+AGENT` | `P1` | LR-05 | Production billing config ready | Gather API keys, entitlement ID, offering IDs |
| LR-13 | RevenueCat observe-mode validation | `not_started` | `USER+AGENT` | `P1` | LR-12 | Non-blocking paywall telemetry in test mode | Implement only after auth/startup is cleaner |
| LR-14 | Supabase asset inventory | `ready_for_review` | `USER+AGENT` | `P0` | none | Inventory of tables, RPCs, storage, functions | Review `docs/SUPABASE_ASSET_INVENTORY_2026-06-13.md` and confirm portal-only assets |
| LR-15 | Supabase RLS audit | `ready_for_review` | `USER+AGENT` | `P0` | LR-14 | Table-by-table access matrix | Actioned in portal/shared-DB repo per user; re-import final evidence when available |
| LR-16 | Supabase RPC and edge-function audit | `deferred` | `USER+AGENT` | `P0` | LR-14 | RPC/function audit notes and fixes list | Portal/shared-DB repo owns remaining function-source review |
| LR-17 | Database type/schema reconciliation | `not_started` | `USER+AGENT` | `P1` | LR-14 | Confirm app expectations match live schema | Regenerate and verify `database.types.ts` after shared DB changes settle |
| LR-18 | Secrets handling audit | `ready_for_review` | `USER+AGENT` | `P0` | none | Secret inventory and remediation list | Rotate exposed OCR key and confirm credential history status |
| LR-19 | Signing and keystore hygiene | `in_progress` | `USER+AGENT` | `P0` | LR-18 | Clean release-signing posture | Configure secure EAS/CI release signing and verify an AAB build |
| LR-20 | Secure storage and session audit | `ready_for_review` | `USER+AGENT` | `P1` | LR-01 | Review of token/session handling | Validate encrypted session restore and start/end shift queue sync on real devices |
| LR-21 | Release-mode config audit | `ready_for_review` | `USER+AGENT` | `P0` | LR-18 | Verify release builds are free of test-only assumptions | Verify merged release manifest and production env with an EAS build |
| LR-22 | Dependency and package security review | `not_started` | `USER+AGENT` | `P2` | none | Dependency review notes | Run package audit and record meaningful findings |
| LR-23 | Release checklist and rollback plan | `not_started` | `USER+AGENT` | `P1` | LR-01, LR-10, LR-15, LR-19 | Repeatable release process | Draft store release checklist and rollback triggers |
| LR-24 | Final launch readiness review | `not_started` | `USER+AGENT` | `P0` | all launch blockers | Go/no-go recommendation | Only start when all P0 items are at least review-ready |

## Detailed Checklist

## 1. Auth and Startup

| Item | Status | Owner | Notes / Evidence |
| --- | --- | --- | --- |
| Define canonical `BootState` shape | `done` | `AGENT` | `src/lib/startup/bootState.ts` defines `BootStage`, `BootState`, and `deriveBootState()` |
| Decide provider ownership model | `done` | `USER+AGENT` | Chosen model: keep existing providers internally, expose one route-facing `useBootState()` hook |
| Add dedicated bootstrap route/state | `done` | `AGENT` | `BootstrappingScreen` added and driven by auth/bootstrap state |
| Persist last-shift onboarding completion | `in_progress` | `USER+AGENT` | DB migration + auth persistence added; needs live migration and device validation |
| Remove timed setup auto-advance | `done` | `AGENT` | `FirstTimeSetupGuide` no longer auto-navigates |
| Simplify login UX transitions | `ready_for_review` | `USER+AGENT` | Post-session bootstrap stage added; navigator now routes from one boot state; needs device validation |

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
| Inventory tables, views, RPCs, buckets, functions | `ready_for_review` | `AGENT` | `docs/SUPABASE_ASSET_INVENTORY_2026-06-13.md` created from mobile usage, local Supabase files, generated types, and supplied schema |
| Document client-exposed tables | `ready_for_review` | `AGENT` | Client-used tables listed in LR-14 inventory; operation-level matrix belongs to LR-15 |
| Review RLS for profiles/pay/work/invites/messages | `ready_for_review` | `AGENT` | Predicate review created; remediation required for invite read access and storage/shift-job gaps |
| Review RPC ownership validation | `in_progress` | `AGENT` | Routine inventory supplied; function bodies still needed, especially `accept_driver_invite` and helper functions |
| Review edge-function secret usage | `in_progress` | `AGENT` | Trigger export exposed service-role bearer tokens; rotate secret and remove embedded tokens |
| Review storage bucket exposure | `ready_for_review` | `AGENT` | Bucket rows and storage policies reviewed; remediation required for upload path mismatches and bucket limits |
| Regenerate/reconcile DB types if needed | `not_started` | `AGENT` | Keep app and schema aligned |

## 7. Mobile App Security Audit

| Item | Status | Owner | Notes / Evidence |
| --- | --- | --- | --- |
| Secret inventory across repo and build config | `ready_for_review` | `AGENT` | `docs/MOBILE_SECURITY_AUDIT_2026-06-14.md`; OCR key removed from public app config, rotation still required |
| Review EAS secret handling | `ready_for_review` | `USER+AGENT` | Literal keystore placeholders removed from `eas.json`; real signing secrets still need EAS/CI setup |
| Review signing and keystore posture | `in_progress` | `USER+AGENT` | Release builds no longer silently use debug signing in CI/EAS; verify production AAB signing |
| Review biometric/session storage flow | `ready_for_review` | `AGENT` | Supabase session now uses Expo split storage: encrypted payload in AsyncStorage, key in SecureStore; biometric-gated storage intentionally not used |
| Review logs for sensitive data leakage | `in_progress` | `AGENT` | Startup/auth debug logs gated behind `__DEV__`; broader log review remains |
| Review release vs debug config separation | `ready_for_review` | `AGENT` | Unused mic/overlay permissions removed; Android backup disabled; release manifest still needs build verification |
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
| B-01 | Auth/startup still needs device validation | `open` | `USER+AGENT` | Validate LR-01 cold start, sign-in, biometric sign-in, and returning-user routing on device |
| B-02 | Launch security audit incomplete | `open` | `USER+AGENT` | LR-15 is portal/shared-DB owned; mobile LR-18/LR-20/LR-21 are review-ready, LR-19 remains open |
| B-03 | Real-device validation incomplete | `open` | `USER` | Execute LR-08 and LR-09 |
| B-04 | Release signing not verified | `open` | `USER+AGENT` | Configure secure EAS/CI signing material and verify a production/internal AAB build |
| B-05 | Exposed OCR key requires rotation | `open` | `USER` | Rotate the OCR.space key previously committed through public Expo config |

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

### 2026-06-13

- Added `src/lib/startup/bootState.ts` with the canonical boot-stage model and pure `deriveBootState()` route decision.
- Added `src/hooks/useBootState.ts` so `AppNavigator` consumes one derived startup object instead of independently combining auth, subscription, and permission loading flags.
- Updated `AppNavigator` to route from `bootState.stage` and handle startup error state explicitly.
- Added boot-state regression tests in `src/lib/tacho/__tests__/bootState.test.ts`.
- Reconciled tracker state: `Auth.tsx` component split is already done under `src/components/auth/`.
- Verification: `npm run test:tacho` passed with 80 tests; `npm run ts:check` passed.
- Created LR-14 Supabase asset inventory at `docs/SUPABASE_ASSET_INVENTORY_2026-06-13.md`.
- Inventory cross-references mobile client table/RPC/storage usage, local Supabase functions/migrations, generated DB types, and the supplied schema-only DDL.
- LR-14 is marked ready for review; LR-15 initially remained blocked because the first schema export did not include policy metadata.
- Added preliminary LR-15 policy-surface review at `docs/SUPABASE_RLS_PRELIMINARY_REVIEW_2026-06-13.md` from the dashboard policy listing.
- LR-15 then received exact policy predicates, storage bucket rows, routine metadata, and trigger metadata.
- Updated LR-15 with exact predicates, storage bucket rows, routine metadata, and trigger metadata.
- Confirmed launch blockers: exposed service-role bearer tokens in trigger definitions, anonymous `driver_invites` `SELECT true`, missing `shift_jobs` policies despite mobile usage, and storage policy/path mismatches for mobile uploads.
- LR-15 is marked ready for review/remediation planning; LR-16 is in progress pending function bodies and portal edge-function source.

### 2026-06-14

- User clarified LR-15 remediation has been actioned in the portal/shared-DB repo; mobile repo moved on to LR-18/LR-19/LR-21.
- Created `docs/MOBILE_SECURITY_AUDIT_2026-06-14.md`.
- Removed public OCR.space key from `app.json`; mobile OCR now calls Supabase `ocr-receipt`.
- Hardened `supabase/functions/ocr-receipt/index.ts` to require configured `OCR_API_KEY` secret and normalize OCR error output.
- Removed duplicate direct OCR.space client path from `AddExpenseModal`.
- Updated Android release signing so CI/EAS release builds fail if real signing material is not configured; local non-CI release builds can still debug-sign for developer testing.
- Removed literal keystore placeholder env values from `eas.json`.
- Removed unused `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` permissions and disabled Android backup in both `app.json` and the checked-in Android manifest.
- Gated startup/auth debug logs behind `__DEV__` and removed partial user-id logging from those debug payloads.
- Verification: `npm run ts:check` passed; `npm run test:tacho` passed with 80 tests.

### 2026-06-14 LR-20 implementation

- Implemented Supabase session split storage using encrypted session payloads in `AsyncStorage` and encryption keys in `SecureStore`.
- Added `src/lib/supabaseSessionStorage.ts` and wired it into `src/lib/supabase.ts`.
- Added `src/lib/sessionStorageCrypto.ts` and tests covering encryption/decryption payload behavior.
- Added one-time migration behavior for the old plain Supabase `AsyncStorage` session value.
- Added client-side user-match guard for critical timer queue flushing so queued start/end shift writes only flush for the currently authenticated user.
- Added queue guard test coverage.
- Updated `docs/SUPABASE_SESSION_STORAGE_MIGRATION_PLAN_2026-06-14.md` with implementation status and validation still required.
- Verification: `npm run ts:check` passed; `npm run test:tacho` passed with 83 tests.

### 2026-06-14 repository cleanup

- Added `.claude/` and `supabase/.temp/` to `.gitignore` and `.easignore`.
- Removed generated `.expo/`, `.test-dist/`, and `supabase/.temp/` local output.
- Removed unused tracked legacy tachograph files `display.FIXED.ts` and `runtimeStorage.FIXED.ts`.
- Removed `.claude/worktrees/*` from Git tracking without deleting the local `.claude` worktree folder.
- Archived old root-level and older review Markdown files under `docs/archive/old-reports/`.
- Kept current launch/security docs active in `docs/`.

## Suggested Immediate Next Actions

1. Rotate the exposed OCR.space key because it was previously committed in public Expo config.
2. Configure secure EAS/CI release signing and verify a production/internal AAB build.
3. Validate encrypted Supabase session restore, offline queued start/end shift sync, and portal payroll visibility on real devices.
