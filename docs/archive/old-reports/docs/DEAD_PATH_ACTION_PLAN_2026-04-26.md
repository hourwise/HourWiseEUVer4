# Dead Path Action Plan

Date: 2026-04-26

## Goal

Reduce repo noise without breaking current app flow.

## Phase 1: Safe removals

Remove these first:

- [src/components/AlertTestPanel.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/AlertTestPanel.tsx)
- [src/hooks/useCreateProfile.ts](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/hooks/useCreateProfile.ts)
- [src/hooks/useDriverStats.ts](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/hooks/useDriverStats.ts)
- [src/screens/CreateProfileScreen.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/screens/CreateProfileScreen.tsx)

Checks after removal:

- `npm run ts:check`
- app boot
- auth flow

## Phase 2: Runtime cleanup

Consolidate the background location task:

- keep one definition only
- remove the duplicate from either [src/App.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/App.tsx) or [index.ts](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/index.ts)

Preferred direction:

- keep task registration in `index.ts`
- keep `App.tsx` focused on providers and UI boot

## Phase 3: Confirm parked UI

Make a keep/remove decision for:

- [src/components/TimezoneSelector.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/TimezoneSelector.tsx)
- [src/components/ErrorBoundary.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/ErrorBoundary.tsx)

Decision rule:

- if not used in the next planned feature pass, remove
- if intended for near-term use, wire properly and test

Keep parked for now:

- [src/screens/SettingsScreen.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/screens/SettingsScreen.tsx)
- [src/components/RegionalRulesModal.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/RegionalRulesModal.tsx)

Remove now:

- [src/components/TimeGapConfirmationModal.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/TimeGapConfirmationModal.tsx)
- [src/components/TimezoneSelector.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/TimezoneSelector.tsx)

Wire now:

- [src/components/ErrorBoundary.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/ErrorBoundary.tsx)

## Phase 4: Separate web leftovers

Decide what to do with:

- [src/main.tsx](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/main.tsx)
- [src/index.css](C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/index.css)

Options:

1. delete if obsolete
2. move into a separate portal/web package
3. archive outside `src/` if kept only for reference

## Phase 5: Re-run health checks

After each phase:

- `npm run ts:check`
- smoke test app launch
- verify login
- verify dashboard opens
- verify start/end shift still works
