# Supabase Session Storage Migration Plan

Date: 2026-06-14

Tracker item: LR-20

## Decision

Move the mobile app's Supabase session persistence from plain `AsyncStorage` to Supabase's recommended Expo split-storage pattern:

- Store the encrypted Supabase session payload in `AsyncStorage`.
- Store the encryption key in `expo-secure-store`.
- Do not set `requireAuthentication: true` for the main Supabase session storage.

This improves token-at-rest protection without changing the app's normal auth flow, shift flow, RLS model, or shared database contract.

## Why Not SecureStore Only

Using raw `SecureStore` only is not the best fit for the main Supabase session because Supabase session payloads can exceed comfortable SecureStore value sizes. Supabase's React Native Expo example uses a hybrid approach for this reason:

- `SecureStore` holds the small encryption key.
- `AsyncStorage` holds the larger encrypted session value.

This keeps the larger session payload out of plain storage while avoiding SecureStore size-limit failures.

Reference:

- Supabase React Native Expo SecureStore pattern: https://supabase.com/docs/reference/javascript/initializing
- Expo SecureStore behavior and persistence notes: https://docs.expo.dev/versions/latest/sdk/securestore/

## Why Not Biometric-Gated Session Storage

Do not store the main Supabase session with `SecureStore` `requireAuthentication: true`.

Reason:

- The app needs quiet session restoration on startup and resume.
- Shift start/end, offline queue flushing, background recovery, and profile bootstrap should not require a biometric prompt.
- Expo notes that biometric-protected SecureStore values can become inaccessible if biometric enrollment changes.

Biometric sign-in should remain a separate explicit user action. The current app already stores biometric sign-in tokens separately in `src/lib/biometricAuth.ts`.

## Current Mobile State

Current Supabase client:

- File: `src/lib/supabase.ts`
- Uses `AsyncStorage` directly as Supabase auth storage.
- Uses:
  - `autoRefreshToken: true`
  - `persistSession: true`
  - `detectSessionInUrl: false`

Current biometric storage:

- File: `src/lib/biometricAuth.ts`
- Stores biometric access/refresh tokens in `SecureStore`.
- This can remain separate initially.

Current critical shift resilience:

- Start/end shift writes can queue locally through `offlineQueueService`.
- Failed start shift writes enqueue `start_session`.
- Failed end shift writes enqueue `end_session`.
- Queue storage currently uses `AsyncStorage`, which is acceptable because it contains operational shift payloads rather than Supabase refresh tokens.

## Expected App Behavior After Migration

No intended user-facing change.

Expected unchanged behavior:

- Returning users remain signed in after app restart.
- AuthProvider still calls `supabase.auth.getSession()`.
- `onAuthStateChange` still drives startup bootstrap.
- `useBootState()` and `AppNavigator` routing remain unchanged.
- Shift start/end writes still use authenticated Supabase requests.
- Offline start/end queue still catches temporary DB/auth/network failures.
- Fleet and solo drivers use the same shared DB records as before.

Expected technical change:

- Supabase session reads/writes perform encryption/decryption locally.
- Startup may add a small storage/decryption cost, but this should be negligible compared with existing auth/profile/network bootstrap work.

## Shared DB Impact

No shared database schema change is required.

No RLS policy change is required.

No portal table/query change is required.

The stored client session format is local to the mobile app. The shared DB only sees normal authenticated Supabase requests with the same user JWT claims as before.

## Portal Impact

Expected portal changes: none.

The web portal can continue using its own web auth persistence mechanism. It does not need to adopt the mobile SecureStore split-storage pattern because:

- The portal does not run in Expo/React Native.
- Browser session storage risks and APIs are different.
- The DB auth identity, RLS policies, and fleet-driver records remain unchanged.

Portal validation still recommended:

- Confirm fleet portal still sees mobile-created/updated `work_sessions`.
- Confirm payroll views behave correctly when a mobile shift is queued offline and syncs later.
- Confirm portal handling of temporarily open shifts remains acceptable if the mobile app cannot sync `end_session` immediately.

## Failure Mode Analysis

### SecureStore Key Missing Or Unreadable

Likely cause:

- App reinstall.
- OS storage issue.
- Device migration/restore edge case.
- SecureStore data invalidated or unavailable.

Expected app result:

- Supabase cannot restore the previous session.
- User is treated as signed out.
- User signs in again.
- New session is written using the split-storage adapter.

Shared DB result:

- No data corruption.
- No schema impact.
- Any queued shift writes cannot sync until the user is authenticated again.

### Encrypted AsyncStorage Payload Missing

Expected app result:

- Same as missing session: user signs in again.

Shared DB result:

- No direct impact.

### Encrypted Payload Cannot Be Decrypted

Expected app result:

- Storage adapter should remove the bad payload/key and return `null`.
- User signs in again.

Shared DB result:

- No direct impact.

### User Starts Or Ends Shift While Network/Auth Write Fails

Current intended behavior:

- Start shift can continue locally and queue `start_session`.
- End shift can save locally and queue `end_session`.

Shared DB result:

- Portal may temporarily show stale state.
- Payroll/tachograph data may be delayed.
- Queue flush should sync once authentication and connectivity are restored.

## Implementation Status

Implemented in the mobile repo on 2026-06-14:

- Added `aes-js@3.1.2`.
- Added `react-native-get-random-values@1.11.0`, pinned because `2.0.0` requires React Native 0.81+ and this app is on React Native 0.74.
- Added `src/lib/sessionStorageCrypto.ts` for AES-CTR session encryption/decryption helpers.
- Added `src/lib/supabaseSessionStorage.ts` as the Supabase-compatible split-storage adapter.
- Updated `src/lib/supabase.ts` to use `supabaseSessionStorage`.
- Added one-time migration behavior from the old plain Supabase `AsyncStorage` key when present.
- Added client-side user-match guard for critical start/end shift queue flushing.
- Added tests for encrypted payload behavior and queue user matching.

Verification passed on 2026-06-14:

- `npm run ts:check`
- `npm run test:tacho` with 83 tests passing.

Still required before marking LR-20 complete:

- Real-device solo auth restart test.
- Real-device fleet auth restart test.
- Real-device start/end shift sync test.
- Offline start/end shift queue sync test.
- Portal confirmation that synced mobile `work_sessions` continue to appear correctly for payroll/tachograph workflows.

## Implementation Steps Reference

### 1. Add Dependencies

Supabase's Expo example uses encryption helpers that require:

- `aes-js`
- `react-native-get-random-values`

Installed:

```powershell
npm install aes-js@3.1.2 react-native-get-random-values@1.11.0
```

`aes-js` did not ship local declarations, so a narrow declaration was added to `app.d.ts` for the APIs used by this app.

### 2. Create A Dedicated Storage Adapter

Created:

- `src/lib/supabaseSessionStorage.ts`

Responsibilities:

- Implement Supabase-compatible `getItem`, `setItem`, and `removeItem`.
- Generate a random AES key for each stored session value.
- Store encryption key in `SecureStore`.
- Store encrypted payload in `AsyncStorage`.
- Delete both key and payload on `removeItem`.
- On decrypt failure, remove both key and payload and return `null`.

Important:

- Do not use `requireAuthentication: true`.
- Prefer async SecureStore methods.
- Keep storage keys namespaced, for example `hourwise.supabase.auth`.

### 3. Update Supabase Client

Updated:

- `src/lib/supabase.ts`

Replace:

```ts
storage: AsyncStorage,
```

with:

```ts
storage: supabaseSessionStorage,
```

Keep:

```ts
autoRefreshToken: true,
persistSession: true,
detectSessionInUrl: false,
```

### 4. Add A One-Time Migration From Plain AsyncStorage

Goal:

- Existing signed-in testers should not all be forced out during the migration if avoidable.

Approach:

- The adapter can attempt to read the old Supabase auth key from `AsyncStorage`.
- If found and not encrypted, encrypt it into the new storage format.
- Remove the old plain value.

Risk:

- Supabase's internal storage key may depend on project ref and library behavior.
- If reliable old-key discovery is not practical, accept a one-time sign-in requirement for internal testers.

Recommendation:

- For controlled testing, a one-time sign-in is acceptable if documented.
- For public release, this should be migrated before broad rollout.

### 5. Add Queue User Guard

Before or alongside this change, harden queue flushing:

- Only flush queued critical timer writes when the current authenticated Supabase user matches `write.userId`.
- If no session is present, leave writes queued.
- If session user differs, do not flush; surface a safe diagnostic and require user review.

Why:

- RLS should already protect this.
- Payroll/tachograph data deserves client-side fail-closed behavior too.

Updated files:

- `src/services/offlineQueueService.ts`
- `src/lib/tacho/criticalTimerQueue.ts`

The implementation reads the local Supabase session with `supabase.auth.getSession()` before flushing. It does not call network-backed `getUser()`, so normal offline retry behavior is preserved.

### 6. Add Tests

Added focused tests for the pure storage crypto helper:

- `setItem` stores encrypted payload, not plaintext.
- `getItem` decrypts and returns original value.
- `removeItem` clears key and encrypted payload.
- Missing SecureStore key returns `null`.
- Decrypt failure clears corrupted data.

Added queue tests:

- Queue flush is skipped when no authenticated user exists.
- Queue flush is skipped when current user does not match `write.userId`.
- Queue flush proceeds when current user matches.

### 7. Manual Validation

Run on a real Android test device:

1. Sign in as solo driver.
2. Kill app and reopen.
3. Confirm session restores without login.
4. Start shift.
5. Kill app and reopen.
6. Confirm active shift restores.
7. End shift.
8. Confirm `work_sessions.end_time` and totals sync to shared DB.
9. Repeat for fleet driver account.
10. Confirm portal sees synced mobile shifts.
11. Disable network, start shift, restore network, confirm queued start syncs.
12. Disable network, end shift, restore network, confirm queued end syncs.
13. Sign out normally.
14. Confirm biometric sign-in still works if enabled.
15. Disable biometric sign-in and confirm stored biometric session clears.

### 8. Release Verification

Before marking LR-20 complete:

- `npm run ts:check`
- `npm run test:tacho`
- Real-device solo auth smoke test
- Real-device fleet auth smoke test
- Start/end shift shared DB sync test
- Portal payroll visibility test
- Portal manually confirms no required DB/schema change

## Rollback Plan

If the migration causes startup/auth instability:

1. Revert `src/lib/supabase.ts` to use `AsyncStorage`.
2. Keep the encrypted storage adapter file if desired, but stop wiring it into Supabase.
3. Ask affected testers to sign in again.
4. Do not delete queued shift writes.
5. Verify queued `start_session` and `end_session` writes flush after sign-in.

## Recommendation Summary

Proceed with the split-storage migration.

Do not use biometric-gated SecureStore for the main Supabase session.

No portal code or shared DB schema changes are expected.

The one additional safety improvement worth doing at the same time is user-match guarding for critical shift queue flushing, because start/end shift records feed payroll and tachograph manual-entry data.
