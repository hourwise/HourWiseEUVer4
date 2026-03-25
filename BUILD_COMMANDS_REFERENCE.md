# ⚡ Quick Reference - Build & Deploy Commands

## Pre-Build Checklist

```bash
# 1. Verify environment
node --version  # Should be >= 18.0.0
npm --version

# 2. Install dependencies
npm install

# 3. TypeScript check
npm run ts:check

# 4. Verify git status
git status  # credentials.json should NOT appear
git log --oneline | head -5

# 5. Verify EAS login
eas whoami

# 6. Create/update secrets
eas secret:create --scope project --name KEYSTORE_PASSWORD
eas secret:create --scope project --name KEYSTORE_ALIAS
```

---

## Build Commands

### Development/Internal Testing

```bash
# Build APK for internal testing (fast, large file)
eas build --platform android --profile development

# Or the in-house development client build
eas build --platform android --profile development --wait
```

### Production/Play Store

```bash
# Build AAB for Play Store internal track (smaller, optimized)
eas build --platform android --profile production-aab

# Build with auto-submit to internal track
eas build --platform android --profile production-aab --auto-submit

# With wait flag to monitor build
eas build --platform android --profile production-aab --wait
```

---

## Post-Build Steps

### Download & Verify APK

```bash
# Download the built APK
# (EAS will provide a download link in console)

# Verify APK integrity
aapt dump badging your-app-release.apk | grep package

# Check APK size
ls -lh your-app-release.apk

# Verify signing
jarsigner -verify -verbose your-app-release.apk
```

### Install on Device

```bash
# Install APK on connected Android device
adb install your-app-release.apk

# Or reinstall (replacing existing)
adb install -r your-app-release.apk

# Launch app
adb shell am start -n com.PCGsoft.hourwise.eu/.MainActivity

# View logs
adb logcat | grep "HourWise\|React\|JavaScript"
```

---

## Monitoring & Logs

### Real-time Logs

```bash
# Android Logcat
adb logcat

# Filter React Native logs
adb logcat *:E | grep "React\|Error"

# Save logs to file
adb logcat > device-logs.txt

# Monitor specific tag
adb logcat -s "HourWise"
```

### Console Output

```bash
# If running locally
npm start

# Select Android device when prompted
```

---

## Version Management

### Update Version for Release

```bash
# Update version in app.json
# Change: "version": "8.0.0" → "version": "8.0.1"

# EAS will auto-increment versionCode
# But you can manually set in app.json if needed:
# "versionCode": 27

# Update runtimeVersion to match
# Change: "runtimeVersion": "8.0.0" → "runtimeVersion": "8.0.1"

# Commit changes
git add app.json package.json
git commit -m "Bump version to 8.0.1"
git push
```

---

## Play Store Management

### Submit to Internal Testing Track

```bash
# Requires:
# 1. Built AAB in Play Console
# 2. Google Play Developer account
# 3. App listed in Play Console

# Via Console UI:
# 1. Go to Play Console → HourWise EU
# 2. Release → Testing → Internal testing
# 3. Upload AAB and create release
# 4. Add testers (optional test group)
# 5. Review and publish

# Via EAS auto-submit (requires setup)
eas build --platform android --profile production-aab --auto-submit
```

### Rollout Strategy

```
Internal Testing (100% of testers)
    ↓ [Feedback & Bug Fixes] ↓ 1-2 weeks
Closed Testing (10-20% of users)
    ↓ [Monitor Crashes] ↓ 1-2 weeks
Staged Rollout:
  10% → 25% → 50% → 100%
    ↓ [Each stage 1-2 weeks] ↓
Public Release
```

---

## Troubleshooting

### Build Failed

```bash
# Clean cache and retry
npm cache clean --force
rm -rf node_modules
npm install
eas build --platform android --profile production-aab --wait

# Check build logs in EAS Dashboard
# https://expo.dev/eas/builds
```

### APK Won't Install

```bash
# Uninstall existing version first
adb uninstall com.PCGsoft.hourwise.eu

# Check device storage
adb shell df -h

# Install with verbose output
adb install -r -d your-app-release.apk
```

### Permissions Issues

```bash
# Reset app permissions
adb shell pm reset-permissions com.PCGsoft.hourwise.eu

# Grant specific permission for testing
adb shell pm grant com.PCGsoft.hourwise.eu android.permission.ACCESS_FINE_LOCATION
```

### Debugging

```bash
# Start debugger
npm start

# Then press 'd' to open debugger in Chrome

# Or use expo CLI directly
expo start --dev-client --android

# React Native Debugger
# Open: chrome://inspect
```

---

## Environment Variables

### Required for Build

```bash
# .env (NOT in git)
EXPO_PUBLIC_SUPABASE_URL=your-url
EXPO_PUBLIC_SUPABASE_ANON_KEY=your-key
EXPO_PUBLIC_OCR_SPACE_API_KEY=your-key

# EAS Secrets (stored securely)
KEYSTORE_PASSWORD=your-password
KEYSTORE_ALIAS=upload
```

### Verify Environment

```bash
# Check if env vars are set
env | grep EXPO_PUBLIC

# Check EAS secrets
eas secret:list
```

---

## Release Checklist

Before submitting to Play Store:

- [ ] Version bumped in app.json
- [ ] runtimeVersion updated
- [ ] versionCode incremented
- [ ] credentials.json NOT in git
- [ ] No console errors/warnings
- [ ] TypeScript check passes
- [ ] All tests pass
- [ ] Changelog prepared
- [ ] Screenshots/assets ready
- [ ] Privacy policy updated
- [ ] Terms of service updated

---

## Testing Devices

### Recommended Device Specs

```
For internal testing, use:
- Android 7 or higher (target: 10+)
- Real device with GPS (not emulator)
- Screen sizes: one small (4-5"), one large (6"+)
- One device with Google Play Services

For production release:
- Test on Android 8, 10, 12, 14
- Test on both small and large screens
```

---

## Monitoring Production

### Sentry/Crashlytics Setup (Optional)

```bash
# Install Sentry
npm install @sentry/react-native

# Initialize in app
import * as Sentry from "@sentry/react-native";
Sentry.init({ dsn: process.env.EXPO_PUBLIC_SENTRY_DSN });
```

### Analytics

```bash
# Enable Expo Analytics
eas analytics:enable

# View analytics
eas analytics:show
```

---

## Quick Command Reference

```bash
# Start development
npm start

# Type check
npm run ts:check

# Build for testing
eas build --platform android --profile development

# Build for production
eas build --platform android --profile production-aab

# Check status
eas build:list

# View secrets
eas secret:list

# View credentials
eas credentials:show

# Install on device
adb install app.apk

# View logs
adb logcat

# Verify APK
aapt dump badging app.apk
```

---

**Version:** 8.0.0  
**Last Updated:** 2026-03-25  
**Ready for:** Internal Testing (v1 APK) → Closed Testing (v2 AAB)

