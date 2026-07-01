# Implementation Plan — HourWise EU UI Refresh

Refresh the mobile app UI to align with the new brand system and UI refresh plan. This involves updating design tokens (Tailwind config), creating core shared components, and refreshing the main Dashboard and common UI elements.

## User Review Required

- **Color Palette Conflict**: `HOURWISE-EU_BRAND_SYSTEM_2026-06-21.md` and `hourwise-react-native-ui-refresh-plan.md` have slightly different color values. I will prioritize the `UI_REFRESH_PLAN` as it is noted as "more recent" in the prompt, while incorporating semantic names from the `BRAND_SYSTEM`.
- **Background Asset**: I will implement a `BrandBackground` component using a `LinearGradient` to match the "Subtle digital route grid + tachograph rings" direction, as I cannot "generate" a complex PNG/SVG background pattern directly.

## Proposed Changes

### Design Tokens & Configuration

Update `tailwind.config.js` with the new color palette, spacing, and radius tokens.

#### [tailwind.config.js](file:///C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/tailwind.config.js)
- Update `theme.extend.colors` with `hw-navy-*`, `hw-blue-*`, etc.
- Map semantic brand colors (primary, accent, status) to these new tokens.
- Add spacing and border radius tokens.

---

### Shared Components

Create and update core UI components for consistency.

#### [NEW] [HWScreen.tsx](file:///C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/HWScreen.tsx)
- A wrapper component providing the `BrandBackground` (gradient) and `SafeAreaView`.

#### [NEW] [HWCard.tsx](file:///C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/HWCard.tsx)
- Standardized card with `rgba(255,255,255,0.06)` background and subtle border.

#### [NEW] [HWButton.tsx](file:///C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/HWButton.tsx)
- Reusable button component following the brand's primary/secondary/danger styles.

#### [NEW] [HWStatusPill.tsx](file:///C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/HWStatusPill.tsx)
- Semantic status pills (Safe, Warning, Breach, etc.).

#### [DigitalClock.tsx](file:///C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/DigitalClock.tsx)
- Update styling to match new typography (Roboto/System).

---

### Dashboard & Navigation Refresh

Refresh the main screens to use the new tokens and components.

#### [Dashboard.tsx](file:///C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/screens/Dashboard.tsx)
- Replace existing `View` containers with `HWScreen` and `HWCard`.
- Refresh the "Main Timer Card" with larger typography and progress indicator styling.
- Update action buttons to use `HWButton`.
- Implement the "Today Summary" tiles.

#### [AppNavigator.tsx](file:///C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/navigation/AppNavigator.tsx)
- Update tab bar/header styling to match the new dark navy theme.

---

### Assets

#### [NEW] [BrandLogo.tsx](file:///C:/Users/USER/AndroidStudioProjects/HourWiseEUVer4/src/components/brand/BrandLogo.tsx)
- SVG-based logo component (placeholder if SVG not available, or simple text-based mark).

## Verification Plan

### Manual Verification
- **Visual Inspection**: Run the app and verify the new color scheme, typography, and card styles on the Dashboard.
- **Theme Consistency**: Ensure status colors (Drive, Work, Break, POA) are consistent across the app.
- **Layout Check**: Verify that the new `HWScreen` and `HWCard` components render correctly on different screen sizes (via `ui_state` and `take_screenshot`).
- **Functionality Regression**: Ensure buttons and toggles still trigger the correct timer logic.

### Automated Tests
- No changes to business logic are proposed, so existing tests should pass.
- I will run `npm test` if available to ensure no regressions in hooks or services.
