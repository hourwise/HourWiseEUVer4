# Dead Path Audit

Date: 2026-04-26
Repo: `HourWiseEUVer4`

## Scope

This pass reviewed:

- navigation reachability
- top-level app entrypoints
- screens/components/hooks with no inbound references
- obvious duplicate runtime wiring

This is a **reachability audit**, not a full deletion pass. Some files below may still be intentionally parked for future use, but they are not part of the current mobile app flow.

## Active app flow

Current reachable flow from [src/navigation/AppNavigator.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/navigation/AppNavigator.tsx):

- `Auth`
- `FirstTimeSetupGuide`
- `DriverSetup`
- onboarding `CalendarView`
- `PermissionsScreen`
- `PaywallScreen`
- `Dashboard`
- `AccountManagementScreen`
- `MessagesScreen`

Core providers and app boot:

- [src/App.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/App.tsx)
- [index.ts](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/index.ts)
- [src/providers/AuthProvider.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/providers/AuthProvider.tsx)
- [src/providers/SubscriptionProvider.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/providers/SubscriptionProvider.tsx)
- [src/providers/PermissionsProvider.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/providers/PermissionsProvider.tsx)

## Likely dead or parked files

These currently have **no inbound references** in `src/**` and are not reachable from navigation:

- [src/components/AlertTestPanel.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/AlertTestPanel.tsx)
- [src/components/ErrorBoundary.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/ErrorBoundary.tsx)
- [src/components/TimeGapConfirmationModal.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/TimeGapConfirmationModal.tsx)
- [src/components/TimezoneSelector.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/TimezoneSelector.tsx)
- [src/hooks/useCreateProfile.ts](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/hooks/useCreateProfile.ts)
- [src/hooks/useDriverStats.ts](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/hooks/useDriverStats.ts)
- [src/screens/CreateProfileScreen.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/screens/CreateProfileScreen.tsx)

Assessment:

- `AlertTestPanel.tsx` looks like development-only tooling.
- `ErrorBoundary.tsx` may be useful, but it is currently not mounted anywhere.
- `TimeGapConfirmationModal.tsx` is an empty file and has no live role.
- `TimezoneSelector.tsx` appears obsolete; timezone is currently taken from device settings and displayed read-only in `SettingsMenu`.
- `useCreateProfile.ts` and `CreateProfileScreen.tsx` appear to be superseded by the current auth/setup flow.
- `useDriverStats.ts` appears orphaned.

## Non-mobile or stale entrypoints

- [src/main.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/main.tsx)
- [src/index.css](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/index.css)

These are web/Vite-style artifacts and are currently excluded from mobile typecheck. They should be treated as a separate app surface or removed from this repo if they are obsolete.

## Duplicate runtime wiring

### Background task defined twice

The background location task name `background-location-task` is defined in both:

- [src/App.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/App.tsx)
- [index.ts](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/index.ts)

This is not just untidy. It is a real runtime risk:

- duplicate registration logic
- unclear source of truth for the task body
- future edits can diverge silently

This should be consolidated into one definition only, ideally in `index.ts` or one dedicated bootstrap module.

## Reachable but worth review

These are referenced, so not dead, but they deserve a deliberate keep/rework decision:

- [src/components/DriverSetup.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/DriverSetup.tsx)
  - used in setup flow and also referenced from `Dashboard`
- [src/components/SettingsMenu.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/SettingsMenu.tsx)
  - active, but there is also an orphaned `SettingsScreen`
- [src/components/DownloadReportModal.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/DownloadReportModal.tsx)
  - used from both `Dashboard` and `AccountManagementScreen`
- [src/components/CalendarView.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/CalendarView.tsx)
  - used both for onboarding and reporting/history

These are not removal candidates without a product decision.

## Confidence bands

### Safe to remove after one confirmation pass

- `AlertTestPanel.tsx`
- `useCreateProfile.ts`
- `useDriverStats.ts`
- `CreateProfileScreen.tsx`

### Probably stale, but confirm intent first

- `src/main.tsx`
- `src/index.css`

### Parked but intentional

- [src/screens/SettingsScreen.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/screens/SettingsScreen.tsx)
  - keep as a placeholder for future subscription/settings flow
- [src/components/RegionalRulesModal.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/RegionalRulesModal.tsx)
  - keep and wire into the menu later once the data/update strategy is defined

### Safe to remove now

- [src/components/TimeGapConfirmationModal.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/TimeGapConfirmationModal.tsx)
  - empty file
- [src/components/TimezoneSelector.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/TimezoneSelector.tsx)
  - current app behavior uses device-derived timezone directly

### Keep, but fix or rationalize

- `ErrorBoundary.tsx`:
  wire it into app bootstrap
- duplicate background task in `App.tsx` and `index.ts`

## Recommended next cleanup order

1. Remove or archive the clearly dead files.
2. Consolidate background task registration into one source.
3. Decide whether `SettingsScreen` is meant to replace `SettingsMenu` or should be removed.
4. Decide whether `RegionalRulesModal`, `TimezoneSelector`, and `TimeGapConfirmationModal` are product backlog items or obsolete leftovers.
5. Separate or remove `src/main.tsx` and `src/index.css` from the mobile repo surface.
