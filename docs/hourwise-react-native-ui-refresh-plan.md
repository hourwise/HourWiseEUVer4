# HourWise EU React Native App UI Refresh Plan

## Purpose

Refresh the HourWise EU mobile app so it feels more professional, consistent with the Fleet Portal, and easier for both solo drivers and fleet-connected drivers to understand at a glance.

The app should remain practical, fast, high-contrast, and driver-friendly. The UI should feel like a serious transport compliance tool, not a generic timer app.

---

## Brand Direction

### Brand Positioning

HourWise EU is a professional driver time, working time, tachograph support, and fleet compliance system for UK/EU commercial drivers and operators.

The mobile app should communicate:

- Trust
- Accuracy
- Calmness
- Compliance
- Transport professionalism
- Clear warning hierarchy
- Driver-first simplicity

### Visual Theme

Recommended theme:

**Subtle digital route grid + tachograph rings**

Use faint background elements:

- Route/grid lines
- Circular timer rings
- GPS dots
- Route curves
- Tachograph disc/ring motifs
- Very subtle map lines

Avoid:

- Stock truck photos
- Overly busy backgrounds
- Harsh neon colours
- Cheap dashboard visuals
- Excessive gradients behind important timer text

---

## Colour System

### Primary Palette

```css
--hw-navy-950: #07111F;
--hw-navy-900: #0B1628;
--hw-navy-800: #10233A;
--hw-blue-700: #1D4ED8;
--hw-blue-600: #2563EB;
--hw-cyan-500: #06B6D4;
--hw-teal-500: #14B8A6;
--hw-green-500: #22C55E;
--hw-amber-500: #F59E0B;
--hw-red-500: #EF4444;
--hw-slate-100: #F1F5F9;
--hw-slate-300: #CBD5E1;
--hw-slate-500: #64748B;
--hw-white: #FFFFFF;
```

### Backgrounds

Main app background:

```css
background: linear-gradient(180deg, #07111F 0%, #0B1628 55%, #10233A 100%);
```

Card background:

```css
backgroundColor: 'rgba(255,255,255,0.06)'
borderColor: 'rgba(255,255,255,0.10)'
```

Light surface option:

```css
backgroundColor: '#F8FAFC'
```

### Status Colours

| State | Colour | Usage |
|---|---:|---|
| Safe / compliant | `#22C55E` | Good status, completed checks |
| Active driving | `#2563EB` | Drive timer active |
| POA | `#06B6D4` | Period of availability |
| Break | `#14B8A6` | Rest/break state |
| Warning | `#F59E0B` | Approaching limit |
| Breach / urgent | `#EF4444` | Limit exceeded |
| Neutral | `#64748B` | Secondary text |

---

## Typography

Use one clean system font approach for reliability across React Native:

```ts
fontFamily: Platform.select({
  ios: 'SF Pro Display',
  android: 'Roboto',
  default: 'System',
})
```

Suggested hierarchy:

| Element | Size | Weight |
|---|---:|---:|
| Main timer value | 42–52 | 700/800 |
| Secondary timer value | 28–34 | 700 |
| Card title | 16–18 | 700 |
| Body | 14–16 | 400/500 |
| Small label | 12–13 | 600 |
| Warning text | 14–16 | 700 |

Keep timer digits tabular where possible.

---

## Logo and Icon Direction

### Main App Icon

Recommended concept:

**Dark navy square + circular tachograph/timer ring + curved road line + compliance tick**

Elements:

- Rounded square background
- Deep navy gradient
- Circular ring suggesting timer/tachograph disc
- Curved route line through ring
- Small tick/check mark or alert notch
- Optional GPS dot

### Splash Icon

Use the same icon mark, enlarged, centred on deep navy.

### Favicon / Site Icon Compatibility

Use a simplified version with:

- No small text
- Single tachograph ring
- Road curve
- Tick/notch

Make sure it remains legible at:

- 16px
- 32px
- 48px
- 180px
- 512px

### In-App Icons

The mobile app currently uses `react-native-feather`. Continue using Feather for the app to minimise churn.

Suggested mappings:

| Feature | Feather Icon |
|---|---|
| Driving | `Truck` or `Navigation` |
| Work | `Clock` |
| Break | `Coffee` |
| POA | `PauseCircle` |
| Calendar | `Calendar` |
| Reports | `FileText` |
| Expenses | `CreditCard` |
| Warnings | `AlertTriangle` |
| Settings | `Settings` |
| Fleet sync | `Cloud` |
| Messages | `MessageSquare` |

Portal can use Lucide separately. The shared design language matters more than forcing both projects onto one icon library.

---

## Background Asset Specification

Create a reusable app background image or SVG pattern:

- Size: 2048 × 2048 or SVG
- Base: deep navy gradient
- Pattern opacity: 3–7%
- Elements:
  - route curves
  - faint grid lines
  - tachograph timer circles
  - GPS dots
  - subtle ring marks
- No photographic trucks
- No busy road imagery

Use this background lightly on:

- Login
- Dashboard
- Subscription page
- Empty states
- About screen

Avoid using busy backgrounds behind:

- active timers
- warning modals
- legal totals

---

## App Information Architecture

### Main App Sections

Recommended bottom/tab or dashboard sections:

1. Dashboard
2. Calendar / History
3. Reports
4. Fleet / Messages
5. Settings

For solo drivers, hide or simplify fleet-only screens.

For fleet drivers, show connected fleet features more prominently.

---

## Dashboard Refresh

### Dashboard Goals

The dashboard must answer instantly:

- Am I working, driving, on break, on POA, or idle?
- How long until my next important limit?
- Is anything close to breach?
- Is auto-detection active?
- Is the shift safely recording?

### Suggested Dashboard Layout

```txt
[Top status bar]
HourWise EU     Sync OK / Offline / Fleet Connected

[Main active state card]
Current State: Driving / Working / Break / POA
Large timer
Remaining time
Progress ring

[Action buttons]
Start Shift / End Shift
Start Break / End Break
POA toggle
Manual Drive Start / Stop

[Detection status]
Auto Drive Detection: On
Low-Speed Yard Detection: On/Off
GPS Accuracy: Good/Fair/Poor

[Today summary]
Work | Drive | Break | POA

[Compliance warnings]
Next alert / current risk

[Mini timeline]
Today’s segments
```

### Main Timer Card

Use a large rounded card with:

- Current status label
- Large timer
- Remaining limit
- Ring progress indicator
- Warning colour state
- Small explanatory text

Example:

```txt
DRIVING
03:42:15
48 min until 4h30 break required
```

### Detection Status Card

Add clear visibility for automatic detection:

```txt
Auto driving detection active
Normal detection: 8 km/h+
Low-speed yard detection: enabled
Last movement: 2.3 km/h · GPS good
```

This helps debug complaints from drivers.

---

## App Features for Solo Drivers

Make these clear inside app onboarding and marketing copy.

### Solo Driver Features

- Shift timer
- Work timer
- Driving timer
- Break timer
- POA tracking
- Auto driving detection
- Optional low-speed yard detection
- Spoken warnings
- Push notifications
- 4h30 driving break warnings
- 6h/9h working time break warnings
- Daily work summaries
- Calendar history
- Manual shift editing
- Expense logging
- Pay estimates
- Allowance tracking
- Downloadable reports
- Multi-language support
- Fatigue reminders
- Compliance heatmap
- Driver profile and pay settings

### Solo Driver Messaging

Use wording like:

> Built for drivers who want a simple way to track work, drive, break and POA time without spreadsheets or guesswork.

---

## App Features for Fleet Drivers

Fleet-connected drivers should see additional features when linked to a portal account.

### Fleet Driver Features

- Clock in/out linked to fleet portal
- Fleet-visible shift records
- Driver messages from transport office
- Vehicle check submission
- Defect reporting
- Incident reporting
- Expense submission
- Fuel/toll/mileage reporting
- Uploaded receipts/photos
- Fleet compliance reminders
- Driver card download reminders
- Licence/document expiry reminders
- Assigned vehicle visibility
- Fleet announcements
- Optional fleet rules and policies

### Fleet Driver Messaging

Use wording like:

> Connect to your operator and send shift, check, expense and incident data directly to the transport office.

---

## App ↔ Portal Interaction

### Data Flow

```txt
Driver App
  ↓
Shift records
Break / drive / POA totals
Vehicle checks
Expenses
Incidents
Messages
Documents
  ↓
Fleet Portal
  ↓
Manager dashboard
Compliance view
Payroll / reports
Fleet records
```

### Driver App Sends to Portal

- Shift start/end
- Work, driving, break, POA totals
- Manual corrections
- Daily reports
- Expenses and receipts
- Vehicle checks
- Defects
- Incidents
- Messages/read receipts

### Portal Sends to Driver App

- Messages
- Announcements
- Assigned vehicle
- Compliance reminders
- Document reminders
- Policy updates
- Driver-specific actions

---

## UI Components to Standardise

Create shared mobile components:

- `HWScreen`
- `HWCard`
- `HWButton`
- `HWTimerCard`
- `HWStatusPill`
- `HWProgressRing`
- `HWMetricTile`
- `HWWarningBanner`
- `HWTimelineSegment`
- `HWEmptyState`
- `HWSectionHeader`
- `HWDetectionStatusCard`

---

## Timer-Specific UI Rules

1. Driving, work, break and POA must use consistent colours across all screens.
2. Warning colours must override decorative colours.
3. Active timer must always be visually dominant.
4. The app must clearly show whether time is actively being recorded.
5. Manual drive state and automatic drive state must be distinguishable in debug/status text.
6. Low-speed detection should have its own visible state.
7. GPS poor/stale should be visible where it affects detection.

---

## Accessibility

The app is used in vehicle environments, so prioritise:

- Large tap targets, minimum 44px
- High contrast
- Short labels
- Clear warning hierarchy
- No tiny legal text on timer screens
- No colour-only warnings
- Haptic feedback on state changes where appropriate
- Voice alerts for critical warnings
- Dark mode first

---

## Suggested App Onboarding

Screens:

1. Welcome to HourWise EU
2. Choose driver type: Solo / Fleet Connected
3. Set pay and allowance preferences
4. Enable location and motion detection
5. Explain auto drive detection
6. Explain low-speed yard detection
7. Enable notifications and spoken alerts
8. Start first shift

---

## Implementation Checklist

### Phase 1 — Design Tokens

- [ ] Add shared colour constants
- [ ] Add spacing constants
- [ ] Add typography constants
- [ ] Add status colour map
- [ ] Add reusable card/button styles

### Phase 2 — App Shell

- [ ] Refresh login screen
- [ ] Refresh dashboard background
- [ ] Refresh settings screen
- [ ] Refresh modal styling
- [ ] Add consistent status pills

### Phase 3 — Dashboard

- [ ] Rebuild main timer card
- [ ] Add progress ring
- [ ] Add today summary tiles
- [ ] Add detection status card
- [ ] Add warning banner
- [ ] Add today timeline preview

### Phase 4 — Fleet-Aware UI

- [ ] Show solo driver features by default
- [ ] Show fleet features only when fleet-linked
- [ ] Add fleet connection badge
- [ ] Add transport office messages entry point

### Phase 5 — Polish

- [ ] Add empty states
- [ ] Add loading states
- [ ] Add offline/sync status
- [ ] Improve accessibility labels
- [ ] Check all screens on small Android devices
- [ ] Check all screens in dark mode

---

## Codex Guardrails

When implementing this refresh:

1. Do not change timer logic unless explicitly requested.
2. Do not change Supabase schema unless required.
3. Keep the existing `react-native-feather` icon system unless a separate migration is requested.
4. Do not remove existing translations.
5. Preserve current navigation flow.
6. Keep dashboard performance high.
7. Avoid heavy animated backgrounds on timer-critical screens.
8. Use theme constants rather than hard-coded colours.
