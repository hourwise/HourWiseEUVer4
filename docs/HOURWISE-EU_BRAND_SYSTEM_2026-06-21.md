HourWise EU — Brand System (Planning & Tokens)
Date: 2026-06-21
Purpose
Provide a shared, implementation-ready brand system (tokens, assets, usage rules) that can be consumed by both the Vite portal (web) and the mobile app (React Native) without sharing UI components.
Keep timer/business logic unchanged.
Provide portal-specific examples (CSS variables, Tailwind tokens, small React web components) and a parallel token spec for mobile.
Important constraints
Do NOT import React Native components into the portal or portal components into the mobile app.
Shared assets: colors, logos, background imagery, icon style, status color meanings.
Not shared directly: CSS files and React components — these live per-platform and must be implemented separately.
Summary of deliverables in this doc
Colors (full palette)
Spacing scale
Border radius tokens
Shadow tokens
Icon style guidelines
Background assets & pattern usage (tachograph ring/grid)
Logo and manifest asset specs
Naming conventions & folder layout
Status color meanings & usage guidance
Example portal CSS variables
Example Tailwind config tokens to extend
Small example portal React components (web-only examples)
Implementation notes for Android/iOS splash and portal /public/brand placement

1) Brand colours (tokens)
Use semantic tokens, not raw hex values in components. Prefer referencing tokens such as var(--hw-primary-900) (web) or tokens.colors.primary900 (mobile) rather than raw hex.
Core brand tokens:
--hw-primary-900 (midnight / dark blue): #051028 — primary dark page background
--hw-primary-700 (deep blue): #072F4A
--hw-primary-500 (brand blue): #0B6A9B
--hw-accent-orange: #FF7A1A — orange header and primary CTA
--hw-accent-amber: #FFA84C — secondary bright
--hw-neutral-900 (dark grey / text on light): #111214
--hw-neutral-800: #26292B
--hw-neutral-600: #5B6165
--hw-surface-0 (white): #FFFFFF
--hw-surface-10 (off-white): #F7F8FA
Accessible contrast helpers:
--hw-primary-contrast: #FFFFFF
--hw-on-accent-contrast: #0B0B0B
Status tokens:
--hw-status-success: #28C76F
--hw-status-warning: #FFB020
--hw-status-critical: #FF4D4F
--hw-status-info: #2F80ED
--hw-status-neutral: #98A0A6
Usage guidance
Page background (dark mode): --hw-primary-900 or a gradient between --hw-primary-900 and --hw-primary-700.
Header (brand bar): --hw-accent-orange.
Primary CTA buttons: --hw-accent-orange with text --hw-primary-contrast.
Secondary CTAs: --hw-primary-500 with #FFFFFF.
Text on dark background: --hw-primary-contrast or --hw-surface-10.
Use status tokens consistently for UI states and notifications.
Accessibility
Aim for at least 4.5:1 contrast for body text. If the orange on background does not pass, provide accessible variants (e.g., darker orange, bolder text) for critical CTA text.

2) Spacing scale (4 px base)
Semantic tokens (4 px grid):
--space-0: 0
--space-1: 4px
--space-2: 8px
--space-3: 12px
--space-4: 16px
--space-5: 20px
--space-6: 24px
--space-8: 32px
--space-10: 40px
--space-12: 48px
--space-16: 64px
Guidance
Use semantic spacing names (small / normal / large) mapped to these tokens.
Maintain vertical rhythm by using multiples of 4.

3) Radius (tokens)
--radius-0: 0px
--radius-sm: 6px
--radius-md: 10px
--radius-lg: 16px
--radius-round: 9999px
Usage
Buttons: --radius-md or --radius-round for pill CTA.
Cards: --radius-sm or --radius-md.
Modals: --radius-lg for visual separation.

4) Shadows (tokens)
Subtle layered shadows that work on dark backgrounds. Expressed as CSS shadow strings:
--shadow-xs: 0 1px 2px rgba(2,6,23,0.25)
--shadow-sm: 0 4px 8px rgba(2,6,23,0.28)
--shadow-md: 0 8px 20px rgba(2,6,23,0.36)
--shadow-lg: 0 16px 40px rgba(2,6,23,0.45)
Usage
Cards: --shadow-sm or --shadow-md.
Floating elements / modals: --shadow-lg.
Avoid text shadows for legibility.

5) Icon style (outline)
Standardize on an outline icon style across platforms.
Rules
Style: Outline / stroke-only. Avoid filled icons for primary UI icons. Exceptions: status/alert icons may be filled when that improves legibility.
Default sizes: 20 px (small), 24 px (default), 32 px (large). Recommend default = 24 px for nav and primary controls.
Stroke widths: 1.25 px @ 20 px, 1.5 px @ 24 px, 2 px @ 32 px.
Stroke color: use semantic tokens (e.g., var(--hw-primary-contrast) on dark backgrounds).
Provide emphasis (active) and muted (disabled) icon color tokens.
Accessibility: add aria-hidden, role, and/or title attributes as appropriate; always provide accessible label text for interactive icons.
Platform libraries
Mobile: keep using react-native-feather (outline).
Portal: use Lucide (outline) if available. Do not migrate mobile to Lucide or portal to react-native-feather now.
Create per-platform mapping files to map canonical icon names to library-specific imports: icons/web.ts and icons/mobile.tsx.
Naming & behavior
Use semantic icon names (e.g., icon-timer, icon-tachograph, icon-download), and map to the same meaning across platforms.

6) Background assets & pattern
Primary brand background: dark/midnight blue gradient with a subtle tachograph ring and a route/grid overlay.
Provided asset
assets/ChatGPT Image Jun 21, 2026, 02_28_03 PM.png (landscape). Use this as master for exports or re-vectorize if possible.
Required export variants
Desktop hero: 2560×1600 px — background-desktop.png
Mobile/portrait: 1600×2560 px (flipped or re-cropped) — background-mobile.png
Tile / pattern: 1024×1024 (repeating variant)
SVG pattern: tachograph-pattern.svg (vectorized rings + grid); preferred for low weight and scaling.
Pattern application
Overlay opacity: rings/lines at 6–12% opacity.
Focal point: place tachograph ring slightly top-left or center-left behind primary content on auth screens.
CSS usage: background-image: linear-gradient(...), url('/brand/background-desktop.png').
Storage
Portal: /public/brand/background-desktop.png, /public/brand/background-mobile.png.
Mobile: src/assets/brand/background-mobile.png and native asset catalogs.

7) Logo & icon assets (export checklist)
Source file: assets/ChatGPT Image Jun 21, 2026, 02_10_08 PM.png (main logo PNG). Ideally provide the original vector (SVG/AI). If not available, export high-resolution PNGs and produce simplified marks.
Please provide:
Master SVG logo: brand-logo.svg (outline + full-color)
White-on-transparent: brand-logo-white.svg / brand-logo-white.png
Dark-on-transparent: brand-logo-dark.svg / brand-logo-dark.png
Simplified mark (square/monogram): brand-mark.svg (for small icons)
Favicon set:
favicon-16x16.png
favicon-32x32.png
favicon.ico
Web manifest icons:
site-icon-192.png
site-icon-512.png
Large portal app icon: 1024×1024 PNG
Mobile splash and icon variants (see next section)
Naming & locations
Portal public path: /public/brand/{brand-logo.svg, brand-logo-white.svg, brand-mark.svg, background-*.png, favicon-*.png}
Mobile source path: src/assets/brand/{...} and native catalogs for Android/iOS.
What I need from you
Confirm whether the provided PNG is the master art or if an SVG/AI exists. If only PNG, please export and upload highest resolution PNGs (≥2048px square).

8) Naming conventions & folder layout
Portal (Vite)
public/brand/
brand-logo.svg
brand-logo-white.svg
brand-mark.svg
background-desktop.png
background-mobile.png
favicon-16x16.png
favicon-32x32.png
site-icon-192.png
site-icon-512.png
Portal example components (web-only examples go in src/components/brand/):
BrandBackground.tsx
BrandLogo.tsx
Mobile (React Native)
src/assets/brand/
brand-logo.svg (or PNGs)
brand-mark.png
background-mobile.png
Android/iOS native icon resources updated separately in android/app/src/main/res/ and Xcode Assets.

9) Status colour meanings
Success: --hw-status-success — positive/complete.
Warning: --hw-status-warning — approaching limits or caution.
Critical: --hw-status-critical — urgent/overdue alerts.
Info: --hw-status-info — informational states.
Neutral: --hw-status-neutral — disabled/unknown.
Suggested UI mapping for timers
Normal: neutral (no highlight)
< 30 min: warning
< 5 min or critical state: critical
Completed/confirmed: success

10) Portal CSS variables (example)
Add to portal global CSS (example only — do not add automatically):
:root{
  --hw-primary-900: #051028;
  --hw-primary-700: #072F4A;
  --hw-primary-500: #0B6A9B;
  --hw-accent-orange: #FF7A1A;
  --hw-accent-amber: #FFA84C;
  --hw-neutral-900: #111214;
  --hw-neutral-800: #26292B;
  --hw-neutral-600: #5B6165;
  --hw-surface-0: #FFFFFF;
  --hw-surface-10: #F7F8FA;

  --hw-primary-contrast: #FFFFFF;
  --hw-on-accent-contrast: #0B0B0B;

  --hw-status-success: #28C76F;
  --hw-status-warning: #FFB020;
  --hw-status-critical: #FF4D4F;
  --hw-status-info: #2F80ED;
  --hw-status-neutral: #98A0A6;

  /* spacing */
  --space-0: 0px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-10: 40px;
  --space-12: 48px;
  --space-16: 64px;

  /* radius */
  --radius-sm: 6px;
  --radius-md: 10px;
  --radius-lg: 16px;

  /* shadows */
  --shadow-sm: 0 4px 8px rgba(2,6,23,0.28);
  --shadow-md: 0 8px 20px rgba(2,6,23,0.36);
  --shadow-lg: 0 16px 40px rgba(2,6,23,0.45);
}

11) Tailwind theme tokens (example)
If the portal uses Tailwind (there is a tailwind.config.js in this repo), extend theme.extend with these tokens.
Example snippet to paste into theme.extend:
colors: {
  'hw-primary-900': '#051028',
  'hw-primary-700': '#072F4A',
  'hw-primary-500': '#0B6A9B',
  'hw-accent-orange': '#FF7A1A',
  'hw-accent-amber': '#FFA84C',
  'hw-neutral-900': '#111214',
  'hw-neutral-800': '#26292B',
  'hw-status-success': '#28C76F',
  'hw-status-warning': '#FFB020',
  'hw-status-critical': '#FF4D4F',
  'hw-status-info': '#2F80ED',
},
spacing: {
  '1': '4px',
  '2': '8px',
  '3': '12px',
  '4': '16px',
  '6': '24px',
  '8': '32px',
  '10': '40px',
},
borderRadius: {
  sm: '6px',
  md: '10px',
  lg: '16px',
},
boxShadow: {
  'hw-sm': '0 4px 8px rgba(2,6,23,0.28)',
  'hw-md': '0 8px 20px rgba(2,6,23,0.36)',
},

12) Portal React component examples (web-only, examples only)
These are example components to help implementers. Do NOT import these into React Native or attempt to reuse RN components in the portal.
BrandBackground.tsx (web-only example)
import React from 'react';

type Props = {
  children?: React.ReactNode;
  className?: string;
};

export default function BrandBackground({ children, className = '' }: Props) {
  return (
    <div
      className={`brand-bg ${className}`}
      style={{
        minHeight: '100vh',
        backgroundImage:
          'linear-gradient(180deg, rgba(5,16,40,1) 0%, rgba(7,47,74,0.95) 60%), url(/brand/background-desktop.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center left',
        color: 'var(--hw-primary-contrast)',
      }}
    >
      {children}
    </div>
  );
}
BrandLogo.tsx (web-only example)
import React from 'react';

export default function BrandLogo({ size = 40 }: { size?: number }) {
  return (
    <img
      src="/brand/brand-logo-white.svg"
      alt="HourWise EU"
      width={size}
      height={size}
      style={{ display: 'block' }}
    />
  );
}
Auth page example (web-only)
import React from 'react';
import BrandBackground from './BrandBackground';
import BrandLogo from './BrandLogo';

export default function AuthExample() {
  return (
    <BrandBackground>
      <main style={{ maxWidth: 420, margin: '0 auto', padding: '48px 16px' }}>
        <div style={{ display: 'flex', justifyContent: 'center', marginBottom: 24 }}>
          <BrandLogo size={64} />
        </div>
        <div style={{
          background: 'rgba(255,255,255,0.03)',
          padding: 24,
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-sm)'
        }}>
          <h1 style={{ color: 'var(--hw-primary-contrast)' }}>Sign in</h1>
          {/* Form placeholder — implement form in portal */}
        </div>
      </main>
    </BrandBackground>
  );
}

13) Splash / Icon implementation notes
Portal (web)
Place favicons and manifest icons under /public/brand/ and update index.html:
<link rel="icon" href="/brand/favicon-32x32.png">
<link rel="apple-touch-icon" href="/brand/site-icon-192.png">
Ensure manifest.json references site-icon-192.png and site-icon-512.png.
Mobile
Android:
Use the simplified brand-mark.png for mipmap icons. Generate mipmap densities (mdpi, hdpi, xhdpi, xxhdpi, xxxhdpi) using Android Asset Studio or tooling.
iOS:
Add icons to the Asset Catalog and supply all required sizes, including the 1024×1024 App Store icon.
Expo/EAS:
If used, set icon and splash in app.json/app.config.js to the brand images.

14) Icon mapping & code migration notes
Create per-platform mapping files:
Portal: src/icons/index.ts
Mobile: src/icons/index.tsx
Each mapping exports semantic components (e.g., IconTimer, IconTachograph) that wrap the platform's icon library with consistent size and strokeWidth.
Standardize default props at the wrapper layer (size 24, strokeWidth 1.5 for 24px).
Replace icon imports incrementally by updating mapping only.

15) Implementation checklist (detailed)
Assets: request vector/source; produce PNG/SVG variants.
Portal:
Add brand images to public/brand/.
Add CSS tokens to global CSS or to a dedicated brand CSS file.
Extend tailwind.config.js.
Add example src/components/brand/ components (optional).
Update index.html to reference favicons.
Mobile:
Add assets to src/assets/brand/.
Add theme token file (e.g., src/theme/brand.ts) mirroring token values.
Replace native icons per platform with brand-mark variants.
Icons:
Create mapping wrappers and update imports gradually.
QA:
Contrast checks, visual QA on auth screen, and icon consistency review.

16) No changes to business logic
This is a design/tokenization exercise only. No timer or domain logic changes are proposed.

Appendix: Suggested filenames (portal)
public/brand/brand-logo.svg (master)
public/brand/brand-logo-white.svg
public/brand/brand-mark.svg
public/brand/background-desktop.png
public/brand/background-mobile.png
public/brand/favicon-16x16.png
public/brand/favicon-32x32.png
public/brand/site-icon-192.png
public/brand/site-icon-512.png
