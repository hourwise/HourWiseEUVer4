# Auth and Startup Review

Date: 2026-04-26

## Scope

Reviewed:

- [src/App.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/App.tsx)
- [src/providers/AuthProvider.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/providers/AuthProvider.tsx)
- [src/navigation/AppNavigator.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/navigation/AppNavigator.tsx)
- [src/components/Auth.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/Auth.tsx)
- [src/providers/SubscriptionProvider.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/providers/SubscriptionProvider.tsx)

## Findings

### 1. Auth state subscription cleanup is not actually returned from the effect

In [AuthProvider.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/providers/AuthProvider.tsx#L171), the effect calls an inner async `init()` function, and the unsubscribe cleanup is returned from inside that async function:

- listener created at line `184`
- unsubscribe returned at line `197`
- effect itself only calls `init()` at line `199`

That means React never receives the cleanup function from `useEffect`.

Risk:

- leaked auth listeners
- duplicate `onAuthStateChange` callbacks after remounts
- hard-to-trace startup/session bugs

Severity: High

### 2. Profile/bootstrap failures fail open into the app instead of failing closed

`AuthProvider` initializes:

- `needsSetup` as `false` at [line 49](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/providers/AuthProvider.tsx#L49)
- `needsLastShiftEntry` as `false` at [line 50](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/providers/AuthProvider.tsx#L50)

If `fetchProfile()` times out or fails, it only logs a warning at [line 99](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/providers/AuthProvider.tsx#L99) and then clears loading. No fallback state is applied.

Result:

- `session` may be present
- `profile` may still be `null`
- setup state may remain falsely complete
- navigator can route into the main app based on incomplete auth/bootstrap data

Given [AppNavigator.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/navigation/AppNavigator.tsx#L86), this can drop the user into the wrong screen after a transient network or Supabase timeout.

Severity: High

### 3. Fleet invite verification can leave the UI stuck in a verifying state if the request throws

In [Auth.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/Auth.tsx#L25), `handleVerifyCode()` does:

- `setVerifying(true)`
- awaits `verifyInviteCode(inviteCode)`
- `setVerifying(false)`

But there is no `try/finally`. If `verifyInviteCode()` throws on a network/API failure, `verifying` never resets and the Verify button stays disabled.

Severity: Medium

### 4. Subscription gating is intentionally bypassed, so the paywall path is not currently exercised

In [SubscriptionProvider.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/providers/SubscriptionProvider.tsx#L20), `isSubscribed` is hardcoded to `true`.

That is fine for internal testing, but it means:

- [PaywallScreen.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/screens/PaywallScreen.tsx) is effectively unreachable in normal startup flow
- auth/startup routing for subscription state is not currently validated
- any RevenueCat regressions can sit unnoticed

Severity: Medium

### 5. Dashboard tries to navigate to a route that is not registered

In [Dashboard.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/screens/Dashboard.tsx#L520), `SettingsMenu` gets:

- `onOpenSubscription={() => navigation.navigate('Subscription')}`

But [AppNavigator.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/navigation/AppNavigator.tsx) does not register a `Subscription` screen.

This is not strictly bootstrap logic, but it is part of the post-login settings flow and will fail at runtime if triggered.

Severity: Medium

## Assessment

The auth flow is structurally understandable, but it is still too permissive under failure.

The main issue is not ordinary sign-in. It is **startup correctness under partial failure**:

- listener lifecycle is wrong
- profile/bootstrap failures are not driving a safe fallback route

Those should be fixed before treating the auth/startup layer as stable.

## Recommended next fixes

1. Fix `AuthProvider` effect lifecycle so the auth listener is unsubscribed correctly.
2. Make bootstrap fail closed:
   - if session exists but profile/bootstrap fetch fails, route to a recoverable loading/retry state or explicit error state
   - do not silently default to “setup complete”
3. Harden `handleVerifyCode()` with `try/finally`
4. Replace the hardcoded subscription bypass with an explicit testing flag
5. Either register a subscription/settings route or remove the invalid navigation target
