# Background Reliability Native Options

Date: 2026-06-13

## Current Decision

Keep the hardened Expo TaskManager + Expo Location implementation as the primary path for the next live test.

Reasons:

- `expo-location` already supports background location tasks registered through `TaskManager.defineTask` and foreground-service options for Android.
- Android requires visible foreground-service notifications for long-running user-visible work, and location foreground services must use the `location` foreground service type with location runtime permission.
- The app now persists timer state locally before DB checkpoints and processes background batches by GPS sample time, so the remaining question is OS wake reliability rather than timer-state correctness.

## Implemented Now

- Android background/foreground-service config is explicit in `app.json` through the `expo-location` config plugin.
- Runtime background location registration is self-healing: if a previously registered task does not match the durable options, the app stops and re-registers it.
- The foreground service is registered with `killServiceOnDestroy: false` so Android should not automatically destroy the location service just because the activity is destroyed.
- The native/background layer still only emits samples. Business rules remain in the TypeScript reducer.

## Candidate Paths

### 1. Hardened Expo TaskManager

Status: selected for next live test.

Use this while diagnostics show background task runs often enough. This keeps the app inside the existing Expo/EAS setup and avoids new native dependency risk.

### 2. Minimal Owned Android Foreground Service

Status: fallback if Expo diagnostics show unacceptable wake gaps.

Design constraints:

- Kotlin service in `android/`.
- Android foreground service type: `location`.
- Use Android fused location APIs or platform `LocationManager`.
- Write raw event records to app-private durable storage.
- JS reads those records and feeds the existing TypeScript reducer.
- The service must not calculate work, break, POA, driving totals, compliance warnings, or shift boundaries.

### 3. Third-Party Libraries

Status: not selected now.

- `react-native-background-actions` is MIT and can run Android HeadlessJS work with a notification, but it is a generic background-service wrapper, not a location source. It would add lifecycle complexity without replacing the location provider.
- `react-native-background-geolocation` from Transistorsoft is technically strong, but Android release builds require a paid license, so it violates this plan's non-goal.
- Older open-source background-geolocation libraries should only be considered after checking current maintenance, SDK compatibility, Android 14/15 foreground-service support, and Expo config-plugin compatibility.

## Live-Test Criteria Before Native Fallback

Do not build the custom service until diagnostics prove at least one of these:

- Background location task gaps exceed the tolerable timer correction window while the shift foreground notification is visible.
- Android kills or fails to restart Expo location tracking on common test devices despite battery-optimization guidance.
- Background task diagnostics show no location samples during real movement while foreground location works.

## Sources Checked

- Expo Location docs: https://docs.expo.dev/versions/latest/sdk/location/
- Expo TaskManager docs: https://docs.expo.dev/versions/latest/sdk/task-manager/
- Android foreground services docs: https://developer.android.com/develop/background-work/services/fgs
- Android foreground service types docs: https://developer.android.com/develop/background-work/services/fgs/service-types
- Android background location permission docs: https://developer.android.com/develop/sensors-and-location/location/permissions/background
