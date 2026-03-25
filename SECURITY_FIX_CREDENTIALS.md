# 🔐 Security Fix: Keystore Credentials Management

## IMMEDIATE ACTION REQUIRED

Your app has a critical security issue: **hardcoded keystore password in `credentials.json`**.

### Quick Fix (5 minutes)

#### Step 1: Rotate Keystore Password
```bash
# Generate a new keystore with strong password
keytool -genkey -v -keystore credentials/android/keystore.jks \
  -keyalg RSA -keysize 2048 -validity 10000 \
  -alias upload -storepass YOUR_STRONG_PASSWORD_HERE \
  -keypass YOUR_STRONG_PASSWORD_HERE
```

#### Step 2: Store Password in EAS Secrets (Recommended)
```bash
# Login to EAS if needed
eas secret:create --scope project --name KEYSTORE_PASSWORD
# Enter your strong password when prompted

# Create alias secret too
eas secret:create --scope project --name KEYSTORE_ALIAS
eas secret:create --scope project --name KEYSTORE_ALIAS_PASSWORD
```

#### Step 3: Update credentials.json
```json
{
  "android": {
    "keystore": {
      "keystorePath": "credentials/android/keystore.jks",
      "keystorePassword": "@env KEYSTORE_PASSWORD",
      "keyAlias": "@env KEYSTORE_ALIAS",
      "keyPassword": "@env KEYSTORE_ALIAS_PASSWORD"
    }
  }
}
```

#### Step 4: Add to .gitignore
```bash
echo "credentials.json" >> .gitignore
echo ".env" >> .gitignore
echo ".env.local" >> .gitignore
git add .gitignore
git commit -m "Add credentials to .gitignore"
```

#### Step 5: Remove from Git History
```bash
# Remove the file from git tracking
git rm --cached credentials.json

# Commit the removal
git commit -m "Remove hardcoded credentials from version control"

# (Optional) Scrub from history if already in remote
# This is more complex - consult git documentation
```

### Why This Matters

**Before (❌ VULNERABLE):**
```
Anyone who clones the repo or sees the commit history can access your keystore password.
This allows them to sign APKs with your certificate and impersonate your app.
```

**After (✅ SECURE):**
```
Passwords stored in EAS platform (encrypted).
Local credentials.json removed from version control.
Only your CI/CD pipeline and local development have access.
```

### Verification

After following these steps, verify:

```bash
# Check that credentials.json is ignored
git status  # Should NOT show credentials.json

# Check git history (it should not appear)
git log --all --full-history -- credentials.json

# Test building with new secrets
eas build --platform android --profile production-aab --dry-run
```

### Password Best Practices

When creating your keystore password, use:
- ✅ At least 20 characters
- ✅ Mix of uppercase, lowercase, numbers, symbols
- ✅ Example: `C0mpl3x!P@ss#2026*Secure`
- ✅ Store in password manager (1Password, Bitwarden, etc.)

---

## Alternative: GitHub Secrets (if using GitHub Actions)

If you're using GitHub Actions for CI/CD:

```yaml
# .github/workflows/build.yml
env:
  KEYSTORE_PASSWORD: ${{ secrets.KEYSTORE_PASSWORD }}
  KEYSTORE_ALIAS: ${{ secrets.KEYSTORE_ALIAS }}
  KEYSTORE_ALIAS_PASSWORD: ${{ secrets.KEYSTORE_ALIAS_PASSWORD }}
```

---

## Testing the Fix

```bash
# Test internal build with new security
eas build --platform android --profile development

# Test Play Store build
eas build --platform android --profile production-aab

# Verify APK signature
jarsigner -verify -verbose -certs build/app-release.apk
```

---

**Status:** 🔴 REQUIRED - Do not submit to Play Store without fixing this!  
**Time to Complete:** ~10 minutes  
**Risk if Ignored:** App hijacking, code tampering, unauthorized updates

