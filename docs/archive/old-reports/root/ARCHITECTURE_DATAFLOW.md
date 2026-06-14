# Startup and Auth Architecture Data Flow

Updated: 2026-06-02

## Current Provider Hierarchy

```text
App
|- i18n + notification bootstrap
|- ErrorBoundary
   |- AuthProvider
      |- SubscriptionProvider
         |- PermissionsProvider
            |- AppNavigator
```

## Current Startup Data Flow

```text
App launch
  -> App.tsx initializes i18n + notifications
  -> AuthProvider restores session
  -> AuthProvider fetches profile + pay config + anySession
  -> SubscriptionProvider derives subscription state
  -> PermissionsProvider derives permission state
  -> AppNavigator chooses first route
```

## Current Route Decision Tree

```text
if authLoading or subscriptionLoading
  -> LoadingScreen
else if no session
  -> Auth
else if permissions not granted
  -> Permissions
else if needsSetup
  -> SetupStack
else if needsLastShiftEntry
  -> OnboardingCalendar
else if not subscribed
  -> Paywall
else
  -> Dashboard stack
```

## Why It Feels Janky

The app is routing from distributed state rather than one explicit boot model.

### State owners today

- `AuthProvider`
  - `session`
  - `profile`
  - `needsSetup`
  - `needsLastShiftEntry`
  - `loading`
- `SubscriptionProvider`
  - `isSubscribed`
  - `isLoading`
- `PermissionsProvider`
  - `areAllGranted`
  - `state`
- `AppNavigator`
  - combines all of the above into routes

This means login quality depends on several async sources settling in the right order.

## Current Data Sources

### Local/runtime

- React state in providers
- transient invite stored in memory in `AuthProvider`
- biometric tokens in secure storage via `src/lib/biometricAuth.ts`

### Remote

- `supabase.auth.getSession()`
- `profiles`
- `pay_configurations`
- `work_sessions`
- RevenueCat customer info for solo accounts when bypass is off

### Device capability / OS

- permissions state
- biometric hardware and enrollment

## Current Auth Interaction Flow

### Email/password sign-in

```text
Auth form submit
  -> supabase.auth.signInWithPassword
  -> auth listener updates session
  -> AuthProvider bootstrap fetch runs
  -> SubscriptionProvider reacts to auth/profile
  -> AppNavigator reroutes
```

### Biometric sign-in

```text
Biometric button
  -> local biometric prompt
  -> supabase.auth.setSession(access, refresh)
  -> auth listener updates session
  -> same bootstrap path as normal sign-in
```

### Sign-up

```text
Sign-up form submit
  -> supabase.auth.signUp
  -> profile row inserted
  -> optional invite/pay config wiring
  -> provider state partially updated locally
  -> later auth/bootstrap determines actual route
```

## Main Architectural Weak Spots

### 1. No single boot state

There is no explicit app-level concept of:

- auth unknown
- authenticated but bootstrapping
- authenticated and onboarding required
- authenticated and ready
- authenticated but blocked by paywall policy

That makes route transitions feel incidental rather than designed.

### 2. Onboarding completion is only partly durable

`needsSetup` is inferred from profile/setup data and a completion timestamp.

`needsLastShiftEntry` is not modeled as a durable onboarding step. It is currently reconstructed from work-session presence and local provider state.

### 3. Subscription policy is mixed with subscription state

The system currently asks one provider to answer both:

- what is the user subscription state?
- should the app block on paywall right now?

Those should be separate concepts.

### 4. Permissions are treated as startup routing, not capability gating

That is valid only if the product truly cannot function at all without them. Otherwise it makes the auth flow heavier than necessary.

## Target Architecture

### Introduce a single `BootState`

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

```ts
type PaywallPolicy = 'bypass' | 'observe' | 'enforce';
```

```ts
type BootState = {
  stage: BootStage;
  session: Session | null;
  profile: ProfileWithPay | null;
  needsSetup: boolean;
  needsLastShiftEntry: boolean;
  permissionsReady: boolean;
  paywallPolicy: PaywallPolicy;
  subscriptionReady: boolean;
  subscriptionActive: boolean;
  error?: string;
};
```

### Ownership model

- `App.tsx`
  - app shell initialization only
- `BootstrapProvider`
  - owns `bootState`
  - orchestrates auth/profile/onboarding/paywall policy
- `SubscriptionService`
  - returns subscription facts
- `PermissionsService`
  - returns permission facts
- `AppNavigator`
  - maps `bootState.stage` to screens

## Target Route Mapping

```text
app_init / auth_resolving / profile_bootstrapping
  -> BootstrappingScreen
signed_out
  -> Auth
onboarding_setup
  -> SetupStack
onboarding_last_shift
  -> OnboardingCalendar
permissions_gate
  -> Permissions
paywall_gate
  -> Paywall or PaywallPreview depending on policy
ready
  -> Dashboard stack
error
  -> Recoverable startup error screen
```

## Paywall Policy During Testing

For the current testing phase:

```text
policy = bypass
```

Behavior:

- never block navigation on paywall
- still compute and log the subscription state
- preserve the future ability to turn on `observe` or `enforce`

Suggested next production-capable progression:

```text
bypass -> observe -> enforce
```

## Durable Data Needed

Recommended durable profile fields:

- `first_time_setup_completed_at`
- `last_shift_onboarding_completed_at`
- optional `permissions_education_seen_at` if you want smoother gating later

## Operational Flow After Refactor

```text
User signs in
  -> session is set
  -> BootstrappingScreen appears immediately
  -> bootstrap provider fetches one consolidated profile payload
  -> bootstrap provider derives onboarding + paywall policy
  -> navigator routes exactly once to the correct next stage
```

## Expected Benefits

- fewer route flickers
- simpler reasoning about startup bugs
- cleaner login UX
- clearer testing behavior with paywall bypass still enabled
- easier future analytics because every launch/sign-in has a named boot stage

