# Auth and Startup Review

Reviewed: 2026-06-02

## Scope

Reviewed current startup/auth flow in:

- `src/App.tsx`
- `src/providers/AuthProvider.tsx`
- `src/providers/SubscriptionProvider.tsx`
- `src/providers/PermissionsProvider.tsx`
- `src/navigation/AppNavigator.tsx`
- `src/components/Auth.tsx`
- `src/components/FirstTimeSetupGuide.tsx`
- `src/components/DriverSetup.tsx`
- `src/lib/subscriptionConfig.ts`
- `src/lib/biometricAuth.ts`

## Summary

The auth flow is no longer broken in the same ways called out in the April review. Several of those issues have already been fixed:

- auth listener cleanup is now returned correctly from `AuthProvider`
- startup now fails closed more safely when profile bootstrap fails
- invite verification resets its loading state correctly
- subscription bypass is now an explicit config flag, not a hardcoded `true`
- the `Subscription` route is registered in the navigator
- setup completion now checks `first_time_setup_completed_at`

The current problem is different: the flow is functionally correct more often, but still feels janky because startup is spread across several async providers and route gates that do not behave like one coherent state machine.

## Findings

### 1. `needsLastShiftEntry` is only persisted in memory

Files:

- `src/providers/AuthProvider.tsx`
- `src/navigation/AppNavigator.tsx`

`completeLastShiftEntry()` only flips local React state. On the next cold start, `needsLastShiftEntry` is rebuilt from whether any work session exists. That means a user who intentionally dismisses or completes onboarding without creating a historical session can be routed back to the onboarding calendar again.

Impact:

- repeated onboarding calendar after login
- confusing "why am I here again?" behavior
- state depends on current app process, not durable account state

Severity: High

### 2. Startup gating is split across three providers plus the navigator

Files:

- `src/App.tsx`
- `src/providers/AuthProvider.tsx`
- `src/providers/SubscriptionProvider.tsx`
- `src/providers/PermissionsProvider.tsx`
- `src/navigation/AppNavigator.tsx`

The app boots through these layers in sequence:

1. app-level i18n and notifications init
2. auth session restore and profile bootstrap
3. subscription sync
4. permission refresh
5. navigator route decision

Each layer owns its own loading flag and fallback behavior. The result is correct often enough, but it is not deterministic from the user?s point of view.

Impact:

- spinner churn
- extra route recomputation
- hard-to-debug transient states
- login feels slower than the actual auth call

Severity: High

### 3. The post-login transition has no dedicated "auth bootstrap" UX

Files:

- `src/components/Auth.tsx`
- `src/providers/AuthProvider.tsx`
- `src/navigation/AppNavigator.tsx`
- `src/components/LoadingScreen.tsx`

After a successful sign-in, the user does not move into a distinct post-auth bootstrap state. Instead, the form submits, then the providers and navigator eventually move away from the auth screen.

That means the user can experience:

- the auth form still visible while the session/bootstrap finishes
- a jump into `LoadingScreen`
- then another jump into permissions/setup/calendar/dashboard

Severity: Medium

### 4. `FirstTimeSetupGuide` auto-advances after 5 seconds

File:

- `src/components/FirstTimeSetupGuide.tsx`

This is a workaround for earlier routing races, but it now creates its own UX problems:

- unexpected navigation without user intent
- possible double-transition if the user taps continue near the timeout
- setup flow feels unstable even when data is correct

Severity: Medium

### 5. Permissions are part of login routing instead of feature activation routing

Files:

- `src/navigation/AppNavigator.tsx`
- `src/providers/PermissionsProvider.tsx`
- `src/screens/PermissionsScreen.tsx`

The navigator routes authenticated users to permissions before setup, onboarding, paywall, or dashboard access. That gives the auth flow a heavy "grant everything now" feel.

This may be acceptable for core location features, but it makes login feel like a compliance wizard instead of a clean sign-in flow.

Severity: Medium

### 6. Subscription bypass still costs startup work

Files:

- `src/providers/SubscriptionProvider.tsx`
- `src/lib/subscriptionConfig.ts`
- `src/navigation/AppNavigator.tsx`

The paywall is correctly bypassed for testing through `SUBSCRIPTION_CONFIG.bypassSubscription`, but the app still waits on `subscriptionLoading` before routing. In bypass mode this should be near-zero-cost and ideally not a visible phase at all.

Severity: Medium

### 7. The auth screen is overloaded

File:

- `src/components/Auth.tsx`

One component currently owns:

- sign in
- sign up
- fleet invite verification
- account type switching
- biometric enable prompt
- biometric sign in
- alert-based error handling

The result is functional, but brittle and hard to make smooth.

Severity: Medium

## Assessment

The current auth flow is not primarily suffering from broken authentication. It is suffering from orchestration and UX coupling.

The core auth and profile logic is now good enough to build on. The next step is to turn the startup sequence into an explicit boot state machine and to separate sign-in, onboarding, permissions, and paywall policy into clearer phases.

## Recommended Direction

1. Introduce a single boot/auth state model that the navigator consumes.
2. Persist onboarding completion explicitly instead of inferring it from work session presence.
3. Add a dedicated post-login bootstrap screen/state.
4. Remove `FirstTimeSetupGuide` auto-advance behavior.
5. Keep paywall bypassed during testing, but move it behind a clear runtime policy.

