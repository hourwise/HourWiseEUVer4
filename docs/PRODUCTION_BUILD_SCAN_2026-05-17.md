# Production Build Scan - 2026-05-17

## Scope

This scan was performed while the EAS production build was already running. No existing source files were modified.

Checks run:

- `npm run ts:check`
- `npm run test:tacho`
- `npx eslint src index.ts --ext .ts,.tsx`

## Executive Summary

- TypeScript compile status: pass
- Tachograph test suite status: pass
  - `35/35` tests passed
- Lint status: fail
  - `10` errors
  - `496` warnings

This means the current codebase looks buildable from a TypeScript perspective, and the refactored tachograph/timer stack has automated coverage that is currently green. The remaining issues are mostly lint and maintainability, plus a small number of runtime risks worth addressing after the build.

## Build Readiness Notes

- No TypeScript compile errors were found.
- The refactored tachograph flow passed its dedicated tests.
- The main risk for the Play internal test build is not TypeScript breakage, but:
  - lint debt in key files
  - a few places where failures can degrade UX without crashing
  - some unfinished workflow edges around reports and end-of-shift data capture

## Concrete Errors To Rectify Later

These are the highest-signal items from the scan. They are grouped by impact, not by count.

### 1. Lint errors in files close to app startup and background execution

- `index.ts:39`
  - `as any` in notification payload
- `index.ts:44`
  - background task signature uses `: any`

These are not TypeScript failures today, but this is app-entry and background-task code, so the typing should be tightened first.

### 2. Auth screen lint failures in a core user path

- `src/components/Auth.tsx:3`
  - `supabase` import is unused
- `src/components/Auth.tsx:149`
  - `require('../../assets/splash-icon.png')` is flagged by `@typescript-eslint/no-require-imports`

This will not block a production build by itself, but the auth screen is a core path and should be cleaned up.

### 3. Report generation modal contains a real code-shape error

- `src/components/DownloadReportModal.tsx:53`
  - `useEffect` missing dependencies: `loadInitialData`, `user`
- `src/components/DownloadReportModal.tsx:73`
  - `no-case-declarations`

This is the strongest candidate in the report/export surface for future runtime edge cases.

### 4. OCR service has multiple regex lint errors

- `src/services/ocrService.ts:49`
- `src/services/ocrService.ts:54`
- `src/services/ocrService.ts:100`
- `src/services/ocrService.ts:103`

All are `no-useless-escape` issues. These are not compile failures, but OCR parsing is a user-facing feature and regex cleanup should be done before expanding document handling.

## Notable Runtime Risks From Manual Scan

These are not TypeScript failures, but they are the main behavior risks I found while reading the app flow.

### 1. App startup can get stuck on the loading spinner if initialization fails

Reference:

- `src/App.tsx:28-35`
- `src/App.tsx:44-57`

If `ensureI18nInitialized()` or `ensureNotificationChannelsInitialized()` throws, the error is logged but `i18nReady` never becomes `true`. That leaves the app on the loading spinner indefinitely.

### 2. Navigator logs state on every render

Reference:

- `src/navigation/AppNavigator.tsx:71-79`

This is useful during refactors, but it is noisy for production diagnostics and can clutter device logs during internal testing.

### 3. Background task path has no top-level recovery wrapper

Reference:

- `index.ts:44-105`

The background location task performs storage reads/writes, reducer execution, and notification scheduling. If one of those throws, there is no outer `try/catch` around the task body. That can make background issues harder to diagnose in real-world testing.

### 4. Permissions flow is intentionally fail-closed, which can block users on slow devices

Reference:

- `src/providers/PermissionsProvider.tsx:90-118`

If permission reads time out, the app falls back to a state where critical permissions are treated as not granted. This is safe, but it may create false-negative onboarding blocks on slower devices or under OS churn.

### 5. End-of-shift job capture is still incomplete

Reference:

- `src/screens/Dashboard.tsx:663`

There is an explicit TODO to insert a `ShiftJobsScreen` before end-shift confirmation so mileage, waiting time, and night-out data can feed invoice generation. That means part of the reporting/commercial workflow is still unfinished by design.

### 6. Legacy duplicate files remain in the tachograph area

Examples:

- `src/lib/tacho/display.FIXED.ts`
- `src/lib/tacho/runtimeStorage.FIXED.ts`

They are not currently referenced, but they increase maintenance ambiguity after a large refactor.

## Current Feature Inventory

Based on the code scan, the app currently provides these main capabilities.

### Core driver workflow

- Email/password authentication
- Biometric sign-in on device
- Solo driver account creation
- Fleet driver onboarding via invite code
- First-time setup and guided onboarding
- Permissions onboarding for notifications, location, background location, camera, and media library

### Tachograph and compliance

- Work session start/end flow
- Automatic live timer state for:
  - work
  - driving
  - break
  - POA
- Background location task integration
- Motion detection using GPS and accelerometer
- Daily driving, shift-length, and weekly driving tracking
- Legal break tracking and warnings
- Daily rest and reduced-rest logic
- Spoken, vibration, and push-style compliance alerts
- End-shift confirmation summary

### Historical records and compliance review

- Calendar-based shift history
- Session editing
- Compliance heatmap
- Compliance heatmap summary
- Daily compliance report modal
- Shift information and rest calculations

### Fleet and communication

- Fleet invite verification
- Fleet member profile provisioning from invite snapshot
- Driver/company account management surfaces
- Messages screen
- Company broadcasts and system messages retrieval
- Schedule screen

### Earnings, records, and admin tools

- Pay setup and pay configuration
- Expense capture
- OCR service for document/receipt extraction
- Download/report generation flow
- Business profile/invoice-related inputs
- Vehicle checklist modal
- Solo vehicle modal
- Solo qualifications modal
- Fleet qualifications modal

### App platform features

- Multi-language/i18n initialization
- Notification channel setup
- Subscription/paywall flow for solo users
- Fleet subscription bypass logic
- Error boundary wrapper
- Offline queue service presence for deferred sync patterns

## Recommended Next Features

These are the most natural additions based on the app's current direction and the gaps visible in the code.

### Near-term

- Shift jobs workflow before end shift
  - capture per-job mileage
  - waiting time
  - night-out / allowances
  - invoice linkage
- Driver document expiry reminders
  - licence
  - CPC/DQC
  - vehicle documents
- Better offline/retry visibility
  - pending sync badge
  - failed sync history
  - manual retry UI

### Mid-term

- Fleet schedule ingestion and acknowledgement
  - assigned shifts
  - accepted/rejected states
  - change notifications
- Compliance trend analytics
  - weekly/monthly driver score trend
  - recurring violation categories
  - coaching recommendations
- Geo-tagged work events
  - depot start/end
  - customer stop detection
  - place-based session notes

### Longer-term

- Driver and fleet reporting pack
  - payroll export
  - invoice export
  - fleet compliance export
- Evidence and audit mode
  - attach photos/files to shifts
  - signed checklists
  - incident / defect history
- Smarter tachograph assistant
  - shift planning before starting work
  - predicted break deadlines
  - "can I extend today?" style decision support

## Suggested Roadmap

### Phase 1 - Stabilize after refactor

- Remove the `10` lint errors first
- Reduce the highest-risk warnings in:
  - `index.ts`
  - `src/components/Auth.tsx`
  - `src/components/DownloadReportModal.tsx`
  - `src/services/ocrService.ts`
  - `src/hooks/useWorkTimer.ts`
- Add a startup fallback path in `src/App.tsx` so init failure does not deadlock the app
- Wrap the background task body in a top-level `try/catch`

### Phase 2 - Harden real-world operations

- Add telemetry/log shaping for:
  - auth bootstrap
  - background task failures
  - permissions timeouts
  - shift start/end failures
- Add internal-test scenarios for:
  - no network while ending shift
  - stale background location updates
  - cold launch after force stop
  - denied background permissions

### Phase 3 - Complete the commercial workflow

- Implement the missing shift-jobs flow before end shift
- Finish invoice/report data capture
- Add explicit sync and export states so drivers know when reports are complete and trustworthy

## Recommended Order Of Fixes After The Build

1. `src/App.tsx` startup deadlock risk
2. `index.ts` background-task guard rails and typing
3. `src/components/DownloadReportModal.tsx` effect dependencies and switch-case cleanup
4. `src/services/ocrService.ts` regex cleanup
5. `src/navigation/AppNavigator.tsx` production log cleanup
6. Triage the broader `no-explicit-any` warnings in auth, dashboard, providers, and services

## Bottom Line

For the build currently running:

- TypeScript is clean
- Tachograph tests are green
- The app looks suitable for Play internal testing

For the next cleanup pass:

- focus on startup resilience
- background-task error handling
- reporting/export edge cases
- then reduce the lint debt around auth, OCR, and timer-related surfaces
