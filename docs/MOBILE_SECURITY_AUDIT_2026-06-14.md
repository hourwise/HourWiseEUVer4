# Mobile Security Audit

Date: 2026-06-14

Tracker items: LR-18, LR-19, LR-20, LR-21

## Scope

This pass focused on mobile-repo launch blockers after Supabase LR-15 remediation moved to the shared portal/database repo.

Reviewed:

- Repo-tracked secret and credential surfaces.
- Expo and EAS build configuration.
- Android release signing configuration.
- Android manifest permissions and backup behavior.
- Client-side OCR secret handling.
- Startup/auth debug logging.
- Biometric/session storage posture at code level.

## Changes Applied

| Area | Change | Files |
| --- | --- | --- |
| OCR secret handling | Removed client-side OCR.space API-key dependency and routed OCR through the existing Supabase `ocr-receipt` function | `app.json`, `src/services/ocrService.ts`, `src/components/AddExpenseModal.tsx`, `supabase/functions/ocr-receipt/index.ts` |
| Release signing | Stopped release builds from silently using debug signing in CI/EAS; release signing now requires secure env vars or injected Gradle signing properties | `android/app/build.gradle` |
| EAS env hygiene | Removed literal keystore placeholder env values from committed EAS profiles | `eas.json` |
| Android device security | Removed unused microphone and overlay permissions; disabled Android backup for the checked-in native project and Expo config | `app.json`, `android/app/src/main/AndroidManifest.xml` |
| Production log hygiene | Gated startup/auth route-decision debug logs behind `__DEV__` and removed partial user-id logging from those debug payloads | `src/navigation/AppNavigator.tsx`, `src/providers/AuthProvider.tsx` |

## Findings

| Severity | Finding | Status | Required follow-up |
| --- | --- | --- | --- |
| High | OCR.space API key was committed in public Expo config and would be embedded in app config | Repo-side fixed | Rotate the OCR.space key because the old value was exposed in git history and app bundles |
| High | Android release build was configured to sign with the debug keystore | Repo-side fixed | Configure production signing through EAS credentials or secure CI/EAS secrets and verify an AAB build |
| High | Root keystore/certificate files and local credential files exist in the working directory | Still local/external | Confirm these are not in remote history; rotate any keystore/password that was previously committed or shared |
| Medium | `eas.json` contained literal keystore placeholder values | Fixed | Store actual signing values only in EAS/CI secret storage, not committed JSON |
| Medium | Android manifest requested unused `RECORD_AUDIO` and `SYSTEM_ALERT_WINDOW` permissions | Fixed | Re-run native config/prebuild validation before store submission |
| Medium | Android backup was enabled while the app stores auth/session-adjacent state | Fixed | Confirm generated release manifest still has backup disabled |
| Medium | App has many console warnings/errors and some diagnostics may include operational context | Partially fixed | Continue log review before public release, especially timer/report/account deletion paths |
| Medium | Supabase auth session persists in AsyncStorage, while biometric refresh tokens are stored in SecureStore | Accepted with risk | Consider moving Supabase session storage to SecureStore or documenting why AsyncStorage is acceptable for this launch profile |

## Secret Inventory Result

Current tracked-file check found only these credential-like tracked paths:

- `android/app/debug.keystore`, expected for debug builds.
- `SECURITY_FIX_CREDENTIALS.md`, documentation only.

Local ignored credential-like files are present in the workspace, including `.env`, root keystore files, `credentials.json`, `google-services.json`, and `upload_cert.pem`. They are not currently tracked by `git ls-files`, but this pass did not scrub historical commits or remote repositories.

## Release Signing Contract

Release signing now accepts either:

- `KEYSTORE_FILE`
- `KEYSTORE_PASSWORD`
- `KEYSTORE_ALIAS`
- `KEYSTORE_ALIAS_PASSWORD`

or the Android Gradle injected signing properties:

- `android.injected.signing.store.file`
- `android.injected.signing.store.password`
- `android.injected.signing.key.alias`
- `android.injected.signing.key.password`

CI/EAS release builds fail if neither signing path is configured. Local non-CI release builds retain a debug-signing fallback for developer testing only.

## Verification

Passed on 2026-06-14:

- `npm run ts:check`
- `npm run test:tacho`

## Remaining Launch Blockers

- Rotate the exposed OCR.space key.
- Confirm whether historic keystore/password exposure occurred; rotate signing material if yes.
- Configure and verify EAS/CI production signing.
- Run an EAS production/internal AAB build and inspect the merged release manifest.
- Finish broader log redaction review.
- Decide whether Supabase session persistence should move from AsyncStorage to SecureStore before public release.

## LR Status

LR-18 is ready for review from the mobile repo perspective, with external rotation/history checks still open.

LR-19 remains in progress until signing material is configured and verified through an actual release build.

LR-20 remains in progress because biometric storage is using SecureStore but Supabase session persistence still needs a launch decision.

LR-21 is ready for review from the config/code perspective, pending release-build verification.
