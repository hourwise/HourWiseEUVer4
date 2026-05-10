# App Health Report

Date: 2026-04-25
Repo: `C:\Users\USER\AndroidStudioProjects\HourWiseEUVer4`

## Executive Summary

This codebase is functional enough to ship internal builds, but it is not in a healthy engineering state.

My assessment:

- Product viability: **good enough to keep iterating**
- Core tachograph/training logic: **improving**
- Codebase maintainability: **fragile**
- Type safety: **poor**
- Architectural consistency: **mixed**
- Overall repo health: **~55/100**

That score is not a judgment on the product. It reflects that the app currently depends on working runtime paths more than on a coherent, enforced code model. That is common after recovery from partial code loss and rebuilds from snapshots.

## What Is Working

1. The app still has a recognizable architecture:
   - `providers` for auth/subscription/permissions
   - `screens` for navigation surfaces
   - `components` for modals and UI tools
   - `hooks` and `lib/tacho` for the core timer logic

2. The tachograph area is in better shape than the wider app:
   - `useWorkTimer` has already been split into smaller pure modules under `src/lib/tacho`
   - local tachograph regression harness passes `22/22`
   - the shift/break/drive notification logic is now more testable than the rest of the app

3. Secret leakage risk appears improved:
   - `.gitignore` excludes `.env`, `google-services.json`, `credentials.json`, `*.jks`, `*.pem`
   - `git ls-files` did not show those sensitive files as currently tracked

## What Is Not Healthy

### 1. TypeScript is not acting as a safety net

Current `npm run ts:check` result:

- **215 TypeScript errors**

Largest error buckets:

- `TS2322`: **166**
- `TS2339`: **11**
- `TS2307`: **8**
- `TS2353`: **6**

This means the project is running with a large amount of unverified surface area. The compiler is currently too noisy to be trusted, which removes one of the main protections against regressions.

### 2. Error concentration is high in key user-facing files

Highest-error files from the current check:

- `src/screens/Dashboard.tsx`: **26**
- `src/components/BusinessProfileModal.tsx`: **15**
- `src/components/Instructions.tsx`: **13**
- `src/components/ComplianceHeatmap.tsx`: **12**
- `src/components/SoloVehicleModal.tsx`: **12**
- `src/components/SettingsMenu.tsx`: **11**
- `src/components/PrivacyInfo.tsx`: **11**
- `src/components/CalendarView.tsx`: **11**

This matters because these are not isolated admin tools. Several are core runtime surfaces.

### 3. The repo shows signs of architectural drift

Examples:

- `src/App.tsx` imports `i18nConfig`, but `src/lib/i18n.ts` does not export it
- `src/lib/i18n.ts` initializes i18next eagerly, while `App.tsx` also tries to initialize it
- `src/main.tsx` imports `react-dom/client`, but the project is not set up as a typed web target
- `src/screens/CreateProfileScreen.tsx` imports `../hooks/useAuth`, but auth now lives in `providers/AuthProvider`
- `src/components/DownloadReportModal.tsx` expects `useAuth()` to return `user`, but the provider exposes `session` and `profile`
- `src/hooks/useWorkTimer.ts` imports `MAX_DAILY_DRIVE_EXTENDED`, but `src/lib/tacho/constants.ts` does not export it

These are not random typos. They indicate the codebase has partial migrations that were never completed.

### 4. UI component typing is inconsistent

The biggest single TypeScript bucket is icon prop usage:

- many `react-native-feather` icons are being used with `size={...}`
- the installed typings expect `SvgProps`, which do not include `size`

This is likely one root cause producing a large percentage of the error count. It is fixable, but right now it pollutes signal across many files.

### 5. Database typing is stale relative to app usage

Errors around `driver_invites`, `payroll_number`, licence expiry fields, and other profile properties strongly suggest one of these is true:

- the Supabase schema changed without regenerating `src/lib/database.types.ts`
- or some screens are written against a schema variant no longer present
- or both

Until that is reconciled, auth, profile setup, and fleet flows remain brittle.

### 6. There are likely dead or semi-dead paths

Examples likely needing review:

- `src/screens/CreateProfileScreen.tsx`
- `src/main.tsx`
- `src/components/Auth.tsx` vs provider-managed auth state
- Deno edge function files under `supabase/functions` included in the main app `tsconfig`

These may still be useful, but they are currently contributing debt and compiler noise.

## Codebase Shape

Current `src` TypeScript/TSX file count:

- **70 files**

Largest files:

- `src/hooks/useWorkTimer.ts` ~48 KB
- `src/components/BusinessProfileModal.tsx` ~40 KB
- `src/screens/Dashboard.tsx` ~36 KB
- `src/components/DownloadReportModal.tsx` ~35 KB
- `src/lib/compliance.ts` ~21 KB

This supports the same conclusion: the app is functioning, but several files are still carrying too much responsibility.

## Operational Risk Assessment

### Low Risk

- local tachograph regression harness
- extracted pure `tacho` modules
- session payload helpers

### Medium Risk

- dashboard and reporting surfaces
- auth/profile setup consistency
- compliance visualizations and calendar components

### High Risk

- TypeScript coverage as a whole
- stale schema/type assumptions
- duplicated initialization logic
- web/edge-function files mixed into the main app compile target

## Specific Findings Worth Fixing Early

1. **i18n startup is inconsistent**
   - current code shape supports the runtime warning you saw earlier

2. **Compiler config is too broad**
   - Deno edge functions and web entrypoints are being type-checked with the mobile app

3. **Auth model is inconsistent across files**
   - some code expects `user`
   - some expects `session`
   - some imports a nonexistent `useAuth` hook path

4. **Database types are out of sync with actual app expectations**
   - this is causing real compile failures in auth/setup/reporting flows

5. **Icon usage is generating mass error noise**
   - until that is normalized, `ts:check` is harder to use as a real signal

## Recommended Direction

This app does not need a rewrite.

It needs:

1. a compiler-noise reduction pass
2. removal or isolation of stale code paths
3. schema/type reconciliation
4. continued extraction of large runtime files into pure modules

The right strategy is to restore trust in the codebase in layers, starting with the parts that give the highest leverage.
