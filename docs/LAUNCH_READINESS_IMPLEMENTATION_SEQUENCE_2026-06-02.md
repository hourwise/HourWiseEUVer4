# Launch Readiness Implementation Sequence

Updated: 2026-06-02

## Purpose

This document turns the current review set into one practical workflow for getting HourWise EU ready for launch without losing momentum during active field testing.

Reviewed inputs:

- `docs/AUTH_STARTUP_REVIEW_2026-04-26.md`
- `AUTH_FLOW_ANALYSIS_AND_PLAN.md`
- `ARCHITECTURE_DATAFLOW.md`
- `docs/APP_HEALTH_REPORT_2026-04-25.md`
- `docs/APP_ACTION_PLAN_2026-04-27.md`
- `APP_READINESS_REPORT.md`

## Current Position

The app is in a much better state than the older health reports suggest, but it is not yet launch-ready.

What is already materially improved:

- `ts:check` is clean
- auth listener/bootstrap bugs were addressed
- notification scheduling and diagnostics were improved
- tachograph logic is more modular and testable
- subscription bypass is now config-driven instead of hardcoded

What still blocks a confident launch:

- login/startup flow is still janky
- onboarding completion is not fully durable
- paywall policy is still in testing mode
- fleet invite flow still needs end-to-end validation
- real-device tachograph behavior still needs field confirmation
- launch security and Supabase posture need a formal audit
- observability and release workflow are not yet robust enough

## Operating Principles

1. Do not enforce the paywall yet.
2. Keep `EXPO_PUBLIC_BYPASS_SUBSCRIPTION=true` during current field testing.
3. Treat auth/startup stabilization as a launch blocker.
4. Treat Supabase security, secret handling, and release signing as launch blockers.
5. Do not ship public release until field validation, security audit, and release workflow are all complete.

## Target End State

Before launch, the app should have:

- deterministic startup routing
- durable onboarding state
- a clear paywall policy with production enforcement ready
- verified fleet and solo auth flows
- validated field behavior for timing/detection/notifications
- crash and event observability
- clean secret handling and release signing hygiene
- completed Supabase security review
- completed mobile app security review
- a documented release checklist and rollback plan

## Recommended Execution Order

## Phase 0: Freeze the Launch Track

Goal:

- create a stable branch and checklist-driven path to launch

Tasks:

1. Declare one active launch branch and one active test branch.
2. Stop mixing launch fixes with broad refactors unless the refactor directly removes launch risk.
3. Define severity levels:
   - `P0`: public release blocker
   - `P1`: closed-test blocker
   - `P2`: post-launch acceptable with mitigation
4. Start a single launch issue tracker grouped by:
   - auth/startup
   - billing/paywall
   - fleet onboarding
   - tachograph/field validation
   - Supabase/security
   - release operations

Exit criteria:

- one launch board exists
- all known launch blockers are categorized

## Phase 1: Stabilize Auth and Startup

Goal:

- make login and cold start feel deterministic

Primary source docs:

- `docs/AUTH_STARTUP_REVIEW_2026-04-26.md`
- `AUTH_FLOW_ANALYSIS_AND_PLAN.md`
- `ARCHITECTURE_DATAFLOW.md`

Implementation sequence:

1. Introduce one startup `BootState` model.
2. Route `AppNavigator` from one source of truth rather than separate provider loading flags.
3. Add a dedicated `BootstrappingScreen` after sign-in and biometric sign-in.
4. Persist last-shift onboarding completion explicitly.
5. Remove the timed auto-advance in `src/components/FirstTimeSetupGuide.tsx`.
6. Refactor `src/components/Auth.tsx` into smaller sign-in/sign-up/invite/biometric units.
7. Reduce visible startup churn in bypassed subscription mode.

Notes:

- Keep paywall bypassed in this phase.
- Do not combine this phase with large UI redesign work.

Exit criteria:

- no auth-form to loading-screen flicker during sign-in
- no repeated onboarding calendar after completion
- correct first route on cold start and app resume

## Phase 2: Restore Clean Onboarding and Setup Flow

Goal:

- make first-run and returning-user behavior clearly different

Tasks:

1. Persist:
   - `first_time_setup_completed_at`
   - `last_shift_onboarding_completed_at`
2. Define exact onboarding rules for:
   - new solo user
   - returning solo user
   - new fleet user
   - returning fleet user
3. Validate fleet prefill behavior in `DriverSetup`.
4. Decide whether permissions are:
   - true startup gate
   - or capability gate shown at first required feature

Exit criteria:

- onboarding is only shown when truly needed
- fleet and solo setup paths are clearly defined and testable

## Phase 3: Keep Testing Fast While Formalizing Paywall Policy

Goal:

- preserve testing velocity without leaving billing architecture ambiguous

Tasks:

1. Replace implicit bypass behavior with explicit paywall policy:
   - `bypass`
   - `observe`
   - `enforce`
2. In `bypass` mode:
   - never block navigation
   - still compute and log subscription state
3. In `observe` mode:
   - never block navigation
   - show whether paywall would have blocked
4. In `enforce` mode:
   - production billing behavior
5. Confirm sign-out escape exists from billing surfaces.
6. Prepare RevenueCat production checklist:
   - API keys
   - entitlement ID
   - offering configuration
   - restore purchases behavior

Exit criteria:

- field testers remain unblocked
- production paywall enforcement path is clearly defined

## Phase 4: Validate Fleet Invite and Solo Billing Paths End to End

Goal:

- verify the account creation and billing flows that convert users into real customers

Tasks:

1. Test fleet invite flow exactly as intended:
   - create account
   - fleet member
   - verify invite
   - finish setup
2. Improve user-facing invite diagnostics:
   - expired
   - already used
   - not found
   - wrong environment
3. Test solo flow:
   - sign up
   - setup
   - bypass mode dashboard entry
   - future paywall enforcement path
4. Confirm biometric sign-in behavior after:
   - normal sign-in
   - sign-out
   - expired session

Exit criteria:

- fleet account creation works reliably
- solo account creation works reliably
- biometric path does not create stale-session confusion

## Phase 5: Complete Real-Device Product Validation

Goal:

- verify runtime behavior under actual use conditions

Tasks:

1. Test on real Android devices only for launch sign-off.
2. Validate:
   - cold start
   - sign-in
   - sign-out
   - biometric sign-in
   - onboarding
   - permissions
   - background notifications
   - shift start/end
   - break transitions
   - drive detection
3. Compare app behavior against:
   - actual driving sessions
   - expected legal thresholds
   - actual notification delivery timing
4. Record known limitations explicitly.

Important:

- treat the app as a driver aid/training/compliance support tool unless and until its legal positioning is reviewed separately

Exit criteria:

- test matrix completed on multiple devices
- no unresolved `P0` runtime failures

## Phase 6: Add Observability and Release Safety Nets

Goal:

- make failures visible before public users report them

Tasks:

1. Add crash reporting:
   - Sentry or Firebase Crashlytics
2. Add basic analytics/events for:
   - sign-in success/failure
   - setup completion
   - permission completion
   - paywall policy state
   - shift start/end
   - major notification events
3. Add build identifiers:
   - app version
   - build number
   - environment
   - paywall policy
4. Create a pre-release verification routine:
   - type check
   - tests
   - env sanity
   - launch checklist

Exit criteria:

- production/test builds are observable
- release candidate verification is documented and repeatable

## Phase 7: Supabase Security Audit and Hardening Guide

Goal:

- verify that backend auth, data access, and secrets are safe for launch

## Supabase Audit Scope

Review:

- auth settings
- RLS policies
- table permissions
- service role usage
- edge functions
- storage buckets
- secrets and environment variables
- auditability of admin operations

## Supabase Audit Workflow

1. Inventory all Supabase assets used by the app:
   - tables
   - views
   - RPCs
   - storage buckets
   - edge functions
2. For each table used by the client, document:
   - who can `select`
   - who can `insert`
   - who can `update`
   - who can `delete`
   - which columns are sensitive
3. Review auth-related tables and flows:
   - profiles
   - driver invites
   - pay configurations
   - work sessions
   - messages/broadcasts
4. Verify all client-accessible tables have intentional RLS policies.
5. Confirm no app flow relies on accidental broad permissions.
6. Review RPCs for:
   - ownership validation
   - argument validation
   - over-broad updates
   - side effects that could be abused
7. Review edge functions for:
   - secret usage
   - auth verification
   - rate-limiting needs
   - logging of sensitive data
8. Review storage:
   - bucket visibility
   - signed URL policies
   - upload validation
9. Review secrets handling:
   - no service-role key in the mobile client
   - publishable values only in `EXPO_PUBLIC_*`
   - project secrets stored in EAS/Supabase secret management
10. Review database types:
   - regenerate `src/lib/database.types.ts`
   - confirm app assumptions still match live schema

## Supabase Hardening Deliverables

Produce:

1. table-by-table access matrix
2. RLS policy review checklist
3. edge-function secret inventory
4. list of schema/type mismatches
5. remediation list with severity

## Supabase Launch Blockers

Do not launch if any of these are true:

- client can read or write data it should not own
- service-role credentials appear in client code or public env
- invites or payroll-related data lack proper ownership controls
- storage buckets expose sensitive assets publicly without intent

## Phase 8: Mobile App Security Audit and Hardening Guide

Goal:

- verify the shipped mobile app, release pipeline, and device-side storage are suitable for launch

## Mobile App Security Audit Scope

Review:

- secrets in repo and build pipeline
- Android signing and keystore handling
- token storage
- biometric flow
- logging
- deep links and intent handling
- WebView usage if any
- dependency risk
- debug-only behavior in release builds

## Mobile Security Workflow

1. Secret inventory
   - search repo for:
     - keys
     - passwords
     - tokens
     - credentials files
   - verify `.gitignore` covers secrets and build artifacts
2. Signing review
   - confirm keystore is not hardcoded in repo
   - rotate any previously exposed credentials
   - move signing secrets into EAS-managed secrets
3. Environment review
   - verify only public-safe config uses `EXPO_PUBLIC_*`
   - verify production env is separated from test env
4. Token/session review
   - confirm Supabase session handling is intentional
   - review biometric token storage in secure store
   - define behavior for token revocation and sign-out
5. Logging review
   - remove sensitive values from logs
   - ensure diagnostics do not print tokens, personal data, or payroll data
6. Build-mode review
   - ensure debug-only behavior is not present in release
   - verify test bypass flags are explicit and controllable
7. Dependency review
   - audit major dependencies
   - check for stale packages with known security concerns
8. Device-surface review
   - notification contents for sensitive data exposure
   - exported activities/intents
   - background service expectations
   - screenshot/privacy considerations for sensitive screens if required

## Mobile Security Deliverables

Produce:

1. secret handling checklist
2. signing/keystore checklist
3. secure storage review notes
4. release-build configuration checklist
5. remediation backlog with severity

## Mobile Launch Blockers

Do not launch if any of these are true:

- signing credentials are exposed or weakly managed
- sensitive secrets are committed or shipped improperly
- session tokens can be leaked through logs or insecure storage
- release build still depends on testing-only bypasses without explicit policy

## Phase 9: Final Launch Readiness Review

Goal:

- convert engineering progress into a clear go/no-go decision

Tasks:

1. Re-run the auth/startup checklist.
2. Re-run the Supabase audit checklist.
3. Re-run the mobile security checklist.
4. Re-run real-device validation.
5. Verify production environment values.
6. Verify release signing and store metadata.
7. Produce:
   - open risks
   - mitigations
   - rollback plan
   - launch recommendation

Exit criteria:

- all `P0` items closed
- remaining `P1` items have explicit owner and ship decision
- go/no-go recorded

## Practical Near-Term Sequence

Recommended next execution order:

1. stabilize auth/startup
2. persist onboarding completion
3. formalize paywall policy while keeping bypass on
4. validate fleet invite flow
5. complete field testing
6. add crash/event observability
7. perform Supabase security audit
8. perform mobile app security audit
9. switch paywall from `bypass` to `observe`
10. only later consider `enforce`

## Definition of Launch Ready

The app is launch ready when:

- startup is deterministic
- onboarding is durable
- billing policy is explicit
- fleet and solo flows are verified
- field testing is complete
- crash reporting and release checks are in place
- Supabase audit is complete
- app security audit is complete
- release secrets and signing are clean

Until then, the app should be treated as:

- suitable for controlled internal and closed testing
- not yet ready for broad public release
