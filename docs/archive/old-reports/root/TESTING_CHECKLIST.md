# 🧪 Internal Testing Checklist - HourWise EU v8.0.0

## Pre-Build Verification

- [ ] i18next deprecation warning resolved (check console for warnings)
- [ ] Credentials rotated and moved to EAS secrets
- [ ] credentials.json added to .gitignore
- [ ] No console.log statements remain in production code
- [ ] All TypeScript errors resolved (`npm run ts:check`)
- [ ] ESLint checks pass (`npm run lint` if available)

---

## Core Features Testing

### 1. Authentication & Onboarding
- [ ] User can create account with email
- [ ] User can login with credentials
- [ ] User can logout
- [ ] Session persists after app restart
- [ ] Permission request dialogs appear
- [ ] First-time setup guide displays

### 2. Shift Management
- [ ] Can start shift
- [ ] Can end shift with confirmation
- [ ] Shift start/end times recorded correctly
- [ ] Cannot end shift while vehicle is moving
- [ ] "Stop vehicle before ending shift" text appears when isDriving
- [ ] Shift history displays all sessions

### 3. Break & POA Tracking ✅ (Recently Updated)
- [ ] Break timer starts and counts correctly
- [ ] Break timer stops when ending break
- [ ] "Last break: Xm" indicator shows for 3 minutes after break ends
- [ ] Break duration fades after 3 minutes
- [ ] POA button functions correctly
- [ ] POA duration tracked

### 4. Driving Detection
- [ ] GPS location tracking starts during shift
- [ ] Driving detection accuracy at various speeds
- [ ] Driving status updates in real-time
- [ ] Background location service doesn't drain battery excessively
- [ ] Speed reconciliation works when app resumes from background

### 5. Compliance Monitoring
- [ ] Work time remaining counter accurate
- [ ] Driving time remaining counter accurate
- [ ] Compliance alerts trigger at correct thresholds:
  - [ ] 30 min left on work time (5h 30m reached)
  - [ ] 15 min left on work time (5h 45m reached)
  - [ ] 5 min left on work time (5h 55m reached)
  - [ ] Work time limit reached (6h)
  - [ ] Driving time limits trigger correctly
  - [ ] Weekly driving limit warnings:
    - [ ] 1h remaining warning (55h reached)
    - [ ] Limit reached warning (56h)
- [ ] Low rest warning at <9 hours
- [ ] Reduced rest warning at 9-11 hours
- [ ] 13-hour spreadover limit warning

### 6. Weekly Driving Limit Display ✅ (Recently Added)
- [ ] ShiftInfoBar shows "Weekly Driving Used: Xh Ym / 56h"
- [ ] Weekly counter updates accurately
- [ ] Counter resets properly each week
- [ ] Color coding if over limit

### 7. UI/UX - Dark Theme
- [ ] Dashboard dark theme intact
- [ ] BusinessProfileModal uses dark theme ✅ (Recently Updated)
  - [ ] Header is amber/brand-accent
  - [ ] Background is brand-dark
  - [ ] Form fields have dark styling
  - [ ] Add client button styled correctly
  - [ ] Client modal header is brand-accent
  - [ ] Cancel/Save buttons properly themed
- [ ] All modals use dark theme
- [ ] DigitalClock displays correctly ✅ (Recently Updated)
- [ ] Text contrast meets accessibility standards (WCAG AA)

### 8. Business Profile Management
- [ ] Can add company details
- [ ] Can upload logo
- [ ] Can save bank details
- [ ] Can add/edit clients
- [ ] Can set billing rates
- [ ] Can add custom line items
- [ ] All fields save correctly

### 9. Vehicle Management
- [ ] Can select/add vehicle
- [ ] Can complete daily safety check
- [ ] Vehicle details saved
- [ ] Check history tracked

### 10. Internationalization ✅ (Recently Fixed)
- [ ] App defaults to device language
- [ ] Can manually switch language
- [ ] All UI text translates correctly
- [ ] DigitalClock time format respects locale
- [ ] Date format respects locale
- [ ] i18next no deprecation warnings in console

### 11. Notifications
- [ ] Permission request appears
- [ ] Compliance alerts trigger as notifications
- [ ] Alert sound plays
- [ ] Notification content is accurate
- [ ] Notifications persist after app closes

### 12. Background Functionality
- [ ] Location tracking continues in background
- [ ] App doesn't crash when backgrounded
- [ ] Session data syncs when app resumes
- [ ] Background activities stop when shift ends

### 13. Data Sync
- [ ] Changes sync to Supabase
- [ ] Offline mode handles gracefully
- [ ] Data refreshes on app resume ✅ (Recently Updated)
- [ ] No data duplication or loss

### 14. Error Handling
- [ ] Error boundary catches crashes
- [ ] Network errors display helpful messages
- [ ] Retry buttons work
- [ ] App recovers from errors gracefully

### 15. Performance
- [ ] App starts in <3 seconds
- [ ] Scrolling is smooth
- [ ] No lag when typing in forms
- [ ] Memory usage stays reasonable (check Android Studio Profiler)
- [ ] Battery drain acceptable

---

## Device-Specific Testing

### Android-Specific
- [ ] App works on Android 7+ (minSdkVersion: 24)
- [ ] Works on latest Android version
- [ ] Permissions system works correctly
- [ ] Background services operational
- [ ] Notifications work with Google Play Services

### Orientation & Sizes
- [ ] Portrait orientation works (default)
- [ ] Landscape orientation if enabled
- [ ] Proper layout on small screens (4-inch)
- [ ] Proper layout on large screens (6+ inch)
- [ ] Notch/safe area respected

---

## Security Verification

- [ ] Credentials.json NOT in git history
- [ ] Keystore password NOT hardcoded
- [ ] API keys use environment variables
- [ ] No sensitive data logged to console
- [ ] Supabase auth tokens handled securely
- [ ] Session persistence encrypted

---

## Crash & Error Reporting

- [ ] Sentry/Crashlytics integrated (if available)
- [ ] First crash reported successfully
- [ ] Error stack traces readable
- [ ] No sensitive data in error logs

---

## Build Verification

```bash
# Pre-Build
npm install  # Clean install
npm run ts:check  # TypeScript check

# Build for Testing
eas build --platform android --profile development

# Or build for Play Store internal track
eas build --platform android --profile production-aab

# Verify APK properties
aapt dump badging build/app-release.apk | grep package
```

---

## Release Notes Template

```
Version: 8.0.0
Build: 26
Date: 2026-03-25

NEW FEATURES:
✅ Real-time weekly driving limit display
✅ Last break confirmation indicator (3-minute fade-out)
✅ Automatic session data refresh on app resume
✅ Improved internationalization configuration

BUG FIXES:
✅ Fixed i18next deprecation warning
✅ Fixed BusinessProfileModal styling for dark theme
✅ Fixed DigitalClock i18n support

IMPROVEMENTS:
✅ Enhanced security with proper credential management
✅ Better error handling for background sync
✅ Smoother dark theme implementation across all modals

KNOWN ISSUES:
(None identified for this release)
```

---

## Sign-Off

**Internal Tester Name:** ___________________  
**Device Model:** ___________________  
**Android Version:** ___________________  
**Date Tested:** ___________________  
**Overall Status:** ☐ PASS ☐ FAIL  
**Issues Found:** (attach bug list)  

**Ready for Closed Testing:** ☐ YES ☐ NO

---

**Generated:** 2026-03-25  
**For Version:** 8.0.0  
**Build Code:** 26

