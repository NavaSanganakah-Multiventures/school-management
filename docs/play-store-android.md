# Android Play Store — Release Signing & Deployment

Release ke liye dono Flutter apps signed AAB banate hain aur (opt-in) Google Play par upload karte hain:

| App | Package (applicationId) | Keystore alias | Upload track (default) |
|---|---|---|---|
| School Management | `com.nasven.pragnya` | `pragnya` | `internal` |
| Super Admin | `com.nasven.pragnya.admin` | `pragnya-admin` | `internal` |

## Architecture / Secrets flow

- **Keystore (upload keys)** — `android/app/upload-keystore.jks` per app. **Gitignored.** Never commit.
- **Local signing** — `android/key.properties` per app (gitignored). Generated automatically by
  `scripts/generate-android-keystores.ps1`. `flutter build appbundle --release` reads it.
- **CI signing** — GitHub Secrets, restored by `.github/workflows/release-android.yml`:
  - `SCHOOL_ANDROID_KEYSTORE_BASE64`, `SCHOOL_ANDROID_KEYSTORE_PASSWORD`, `SCHOOL_ANDROID_KEY_ALIAS`, `SCHOOL_ANDROID_KEY_PASSWORD`
  - `ADMIN_ANDROID_KEYSTORE_BASE64`, `ADMIN_ANDROID_KEYSTORE_PASSWORD`, `ADMIN_ANDROID_KEY_ALIAS`, `ADMIN_ANDROID_KEY_PASSWORD`
  - `PLAY_SERVICE_ACCOUNT_JSON` — Google Play Developer API service account (only needed for CI auto-upload)
- **NOT in Cloudflare KV** — signing secrets are CI/build-machine secrets, not server secrets.
  KV (`CONFIG_KV`) is for Worker runtime secrets (AUTH_SECRET, FCM, Razorpay, etc.).

> ⚠️ PKCS12 keystores me key password == keystore password hota hai (keytool `-keypass` ignore karta hai).
> Isliye `ANDROID_KEY_PASSWORD` = `ANDROID_KEYSTORE_PASSWORD` dono apps me.

## Local setup (already done)

1. `powershell -File scripts/generate-android-keystores.ps1`
   - generates both `upload-keystore.jks` + `android/key.properties` + `.keystore-backup/keystore-secrets.txt`
2. **Backup `.keystore-backup/keystore-secrets.txt` OFFLINE** (password manager / printed copy).
   Khona mat — Play App Signing enroll ke baad agar upload key khone se app update nahi kar paoge
   (Play Console support + upload key reset ke bina).
3. Verify locally:
   ```
   cd flutter_apps/super_admin_app && flutter build appbundle --release
   cd flutter_apps/school_management_app && flutter build appbundle --release
   ```

## Play Console — one-time setup

1. **App create karo** (per package):
   - Play Console → "Create app" → select org → **App name + package name** = applicationId
     (`com.nasven.pragnya`, `com.nasven.pragnya.admin`) → create draft.
2. **Play App Signing (recommended):** Setup → App signing (exact path: Play Console → Your app →
   Setup → **App signing** OR "Testing"). Ye Google ko app signing key generate karne deta hai;
   humara keystore sirf **upload key** hota hai. Upload key ka certificate bhi yahan dikhega —
   keystore me hai (SHA1/SHA256 print karne ke liye neeche command hai).
3. **API access / service account (auto-upload ke liye):**
   - Play Console → Setup → API access → "Create new service account" (ya link existing GCP project)
   - GCP → service account banake **JSON key download** karo
   - Play Console me service account ko **permissions** do (Play Console App access → grant).
     Minimal: "Release apps to testing tracks" / "Manage testing tracks" etc. (best: "Repository admin"
     ya granular "App access" → apna app → role "Release manager"-like).
   - Upload JSON ko GitHub secret me:
     ```
     gh secret set PLAY_SERVICE_ACCOUNT_JSON < service-account.json
     ```

## Build + upload (CI)

- **Push on main** touching flutter apps → signed AABs build hote hain + artifacts attach hote hain (no upload).
- **Manual upload:** GitHub → Actions → "Android Release" → Run workflow →
  `track: internal|alpha|beta|production`, `publish: true`.

Ya local manual upload — AAB ko Play Console → your app → Testing → Internal testing → Create release → Upload.

## Version bumps (har release me zaroori)

Play Store har upload ke liye unique `versionCode` maangta hai. Dono apps ke `pubspec.yaml` me:

```yaml
version: 1.0.0+1   # +1 = versionCode (int), 1.0.0 = versionName
```

Har naya release bhejne se pehle `+N` badhao. Gradle `flutter.versionCode` isi se aata hai.

## Print keystore fingerprints (optional)

```
keytool -list -v -keystore flutter_apps/super_admin_app/android/app/upload-keystore.jks -storepass <PASS> -alias pragnya-admin
```

## Useful commands

```bash
# Signed AAB locally
flutter build appbundle --release

# Play upload locally (agar service-account.json android/ me rakho)
PLAY_SERVICE_ACCOUNT_FILE=service-account.json ./gradlew publishBundle -PplayTrack=internal

# GitHub secrets list check
gh secret list
```