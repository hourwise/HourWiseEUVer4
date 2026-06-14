# Auth Flow Analysis and Improvement Plan

Updated: 2026-06-02

## Goal

Make login and startup feel deterministic, fast, and boring:

- user signs in once
- app shows one clear loading/bootstrap transition
- routing lands on the correct next screen the first time
- onboarding does not reappear unexpectedly
- paywall remains bypassed during current testing

## Current Flow

Today the effective flow is:

1. `App.tsx` waits for i18n + notification channel init.
2. `AuthProvider` restores session and fetches profile/pay config/work-session presence.
3. `SubscriptionProvider` derives subscription state from auth/profile.
4. `PermissionsProvider` derives permissions state.
5. `AppNavigator` chooses one of:
   - `Auth`
   - `Permissions`
   - `Setup`
   - `OnboardingCalendar`
   - `Paywall`
   - `Dashboard`

This works, but it is implemented as several independent gates rather than a single startup state machine.

## Confirmed Friction Points

### A. Cold-start routing is inference-heavy

Current routing depends on a mix of:

- session presence
- fetched profile
- optional pay config
- existence of any historical session row
- current permission state
- current subscription state

That makes the first route hard to reason about and easy to make janky.

### B. Onboarding completion is not fully durable

`needsLastShiftEntry` is local state reconstructed from `work_sessions` existence, not an explicit durable onboarding flag.

### C. Auth submission and app bootstrap are not visually separated

After login, the user does not move into a dedicated "signing you in" / "preparing your workspace" state. The UI waits for provider churn and then reroutes.

### D. Setup flow still contains race-era workarounds

`FirstTimeSetupGuide` auto-advances after 5 seconds. That is a symptom, not a design.

### E. Permission gating is too early for a smooth login flow

The app currently treats permissions as a route gate immediately after authentication.

### F. Subscription bypass is testing-friendly but architecturally muddy

`SUBSCRIPTION_CONFIG.bypassSubscription` is the right testing switch for now, but it should be expressed as a clear paywall policy rather than a boolean hidden inside provider logic.

## Target State Machine

The navigator should consume one boot model, not several loading booleans.

```ts
type BootStage =
  | 'app_init'
  | 'auth_resolving'
  | 'signed_out'
  | 'profile_bootstrapping'
  | 'onboarding_setup'
  | 'onboarding_last_shift'
  | 'permissions_gate'
  | 'paywall_gate'
  | 'ready'
  | 'error';
```

And one derived object:

```ts
type BootState = {
  stage: BootStage;
  session: Session | null;
  profile: ProfileWithPay | null;
  needsSetup: boolean;
  needsLastShiftEntry: boolean;
  permissionsReady: boolean;
  paywallPolicy: 'bypass' | 'observe' | 'enforce';
  subscriptionReady: boolean;
  subscriptionActive: boolean;
  error?: string;
};
```

## Recommended Architecture

### Phase 1. Consolidate startup into one orchestrator

Create either:

- `BootstrapProvider`, or
- a refactor of `AuthProvider` into a broader `SessionBootstrapProvider`

Responsibilities:

- restore session
- fetch profile bootstrap payload
- derive onboarding state
- derive paywall policy
- expose one `bootState`

`SubscriptionProvider` and `PermissionsProvider` can still exist internally, but `AppNavigator` should route from one source of truth.

### Phase 2. Persist onboarding explicitly

Add durable profile fields such as:

- `first_time_setup_completed_at` (already in use conceptually)
- `last_shift_onboarding_completed_at`

Then make routing use those explicit flags, not inferred `work_sessions` existence.

Recommended rules:

- `needsSetup` = profile missing required setup data and setup completion flag is absent
- `needsLastShiftEntry` = durable onboarding flag absent
- if product later wants this optional, gate it by dismiss state rather than hard redirecting forever

### Phase 3. Split auth UI into clearer screens or subflows

Refactor `src/components/Auth.tsx` into smaller units:

- `SignInForm`
- `SignUpForm`
- `InviteVerificationSection`
- `BiometricPromptSheet` or post-login prompt

Immediate UX gains:

- cleaner validation
- easier loading states
- easier analytics/instrumentation
- fewer cross-mode state leaks

### Phase 4. Add a dedicated post-login bootstrap screen

After successful sign-in or biometric sign-in:

- leave the auth form immediately
- show a dedicated `BootstrappingScreen`
- run profile/bootstrap logic there through the single boot state

This removes the feeling that the auth button "did nothing" or that the app is flickering through random routes.

### Phase 5. Remove auto-navigation from setup guide

`FirstTimeSetupGuide` should do one of these:

- become a static informational screen with explicit Continue, or
- be removed entirely if `DriverSetup` can own its own intro state

Do not keep timer-driven navigation.

### Phase 6. Re-sequence permissions

Recommended order for smoother UX:

1. authenticate user
2. resolve profile/setup state
3. land in setup or dashboard shell
4. request permissions when entering location-dependent flow or as a clearly explained step

If regulations/product require early permission gating, still keep it as one explicit stage inside the boot state machine.

### Phase 7. Formalize paywall policy while keeping bypass on

For the current testing cycle:

- keep paywall bypass enabled
- do not block testers on RevenueCat

But replace the implicit boolean approach with:

```ts
type PaywallPolicy = 'bypass' | 'observe' | 'enforce';
```

Meaning:

- `bypass`: always route through, but still log subscription state
- `observe`: never block, but surface whether the paywall would have shown
- `enforce`: real production behavior

This will let you test auth and onboarding now without losing the ability to harden paywall behavior later.

## Suggested Implementation Plan

### Step 1. Add a `bootState` model

Files likely affected:

- `src/providers/AuthProvider.tsx`
- `src/providers/SubscriptionProvider.tsx`
- `src/providers/PermissionsProvider.tsx`
- `src/navigation/AppNavigator.tsx`

Deliverable:

- navigator consumes one derived state object
- remove route decisions that depend on multiple provider loading flags independently

### Step 2. Persist `last shift onboarding complete`

Files likely affected:

- profile schema / migration
- `src/providers/AuthProvider.tsx`
- `src/navigation/AppNavigator.tsx`
- `src/components/CalendarView.tsx` or onboarding completion action source

Deliverable:

- no more repeated calendar redirect on cold start

### Step 3. Introduce `BootstrappingScreen`

Files likely affected:

- `src/navigation/AppNavigator.tsx`
- new `src/screens/BootstrappingScreen.tsx`

Deliverable:

- explicit transition after login/biometric sign-in
- no auth-form lingering during bootstrap

### Step 4. Break up `Auth.tsx`

Files likely affected:

- `src/components/Auth.tsx`
- new smaller auth form components

Deliverable:

- simpler state ownership
- inline validation
- easier future polish

### Step 5. Remove `FirstTimeSetupGuide` timer behavior

Files likely affected:

- `src/components/FirstTimeSetupGuide.tsx`
- maybe `src/navigation/AppNavigator.tsx`

Deliverable:

- no auto-push after 5 seconds

### Step 6. Optimize bypass-mode subscription startup

Files likely affected:

- `src/providers/SubscriptionProvider.tsx`
- `src/lib/subscriptionConfig.ts`

Deliverable:

- bypass mode does not create visible startup delay
- paywall policy is explicit and testable

## Acceptance Criteria

### Login UX

- tapping Sign In always moves the app into one clear transition state
- user never sees auth form, then loading, then auth form again during one attempt
- biometric sign-in follows the same transition path

### Routing correctness

- first post-login route is correct on the first render after bootstrap
- onboarding calendar does not reappear after completion unless explicitly reset
- setup screens do not appear for already-complete users

### Startup performance

- bypassed paywall does not add visible latency
- provider loading flags no longer compete for routing control

### Testing mode

- paywall remains bypassed for current device testing
- app still logs whether the user would have been gated under production policy

## Recommended Order of Work

1. Boot state consolidation
2. Durable onboarding persistence
3. Post-login bootstrap screen
4. Auth screen refactor
5. Setup guide cleanup
6. Paywall policy formalization

## Notable Non-Goals for This Pass

- redesigning Supabase auth itself
- turning permissions into a background-only flow immediately
- enforcing RevenueCat during the current testing phase

