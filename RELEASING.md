# Releasing KataMarrant on Android

End-to-end procedure for cutting a signed Android release and pushing it to
the Google Play Store. The desktop side has no public release flow — its
artifacts are produced by `npm run build` for personal use only.

The package id is **`fr.weill-duflos.katamarrant`** (Tauri identifier). Note
that Android disallows hyphens in package names, so Tauri sanitizes the
applicationId to **`fr.weill_duflos.katamarrant`** — that is the value the
Play Console uses to identify the app and the value that appears in
`AndroidManifest.xml`. Distribution target is **Google Play Store**.

## 1. One-time setup

### 1.1 Generate the release keystore

The keystore lives **outside the repo**. Recommended location on Windows:

```
%USERPROFILE%\keystores\katamarrant-release.jks
```

Generate it with `keytool` (bundled with the JDK):

```powershell
keytool -genkey -v `
    -keystore $HOME\keystores\katamarrant-release.jks `
    -alias katamarrant `
    -keyalg RSA -keysize 2048 -validity 9125
```

Store the alias + the two passwords (store + key) in a password manager. **If
you lose them, you lose the ability to publish updates** — Play Store
identifies an app by signing key.

### 1.2 Create `key.properties` at the repo root

The Android build reads `key.properties` from the project root (the file is
gitignored — see `.gitignore`):

```properties
storeFile=C:/Users/antoi/keystores/katamarrant-release.jks
storePassword=...
keyAlias=katamarrant
keyPassword=...
```

The path can be absolute (Windows-style with forward slashes) or relative to
`src-tauri/gen/android/`. When the file is missing, the release block falls
back to debug signing — handy for unsigned debug builds without breaking the
build.

### 1.3 (If `src-tauri/gen/` was regenerated) Re-apply the signing config

`src-tauri/gen/` is gitignored, so any time you run `tauri android init` (or
`tauri android build` after deleting the `gen` dir), the signing block in
`src-tauri/gen/android/app/build.gradle.kts` is wiped. Re-apply the diff:

1. Add `import java.io.FileInputStream` at the top of the file.
2. Below the existing `tauriProperties` block, add the
   `keystoreProperties` / `hasReleaseKeystore` block (see git history for
   `src-tauri/gen/android/app/build.gradle.kts`).
3. Inside `android { ... }` add the conditional `signingConfigs { ... }`
   block.
4. Inside `buildTypes.release { ... }` add
   `if (hasReleaseKeystore) { signingConfig = signingConfigs.getByName("release") }`.

(A future improvement is to script this patch — for now it's manual since
this rarely happens.)

## 2. Cut a release

### 2.1 Bump the version

Two places need to match:

- `src-tauri/tauri.conf.json` → `"version": "X.Y.Z"`
- `src-tauri/gen/android/app/tauri.properties` → `tauri.android.versionName`
  and `tauri.android.versionCode`. **`versionCode` must increase
  monotonically** for every Play Store upload — bump by 1 for each release
  (or use `MAJOR*10000 + MINOR*100 + PATCH` if you prefer).

`tauri.properties` is regenerated on `tauri android init` from
`tauri.conf.json` — but `versionCode` is set independently and is not in the
JSON. Track the next value in a release note.

### 2.2 Build the signed AAB

Play Store wants `.aab` (Android App Bundle), not `.apk`. From the repo
root:

```bash
ANDROID_HOME=/c/Users/antoi/AppData/Local/Android/Sdk \
ANDROID_SDK_ROOT=/c/Users/antoi/AppData/Local/Android/Sdk \
NDK_HOME=/c/Users/antoi/AppData/Local/Android/Sdk/ndk/30.0.14904198 \
./node_modules/.bin/tauri android build --aab -t aarch64,armv7,x86_64,i686
```

Output: `src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab`.

**The AAB that gradle emits is unsigned.** Tauri 2.10/2.11's stock
`build.gradle.kts` does not wire `signingConfig` into the bundle task,
so the AAB falls out of the build with no MANIFEST.MF / .RSA in
`META-INF/`. Sign it explicitly with `jarsigner` (AABs use JAR signing
v1 — APK Signing Scheme v2/v3 does not apply to bundles, and Play
re-signs with its own deployment cert when distributing):

```bash
AAB=src-tauri/gen/android/app/build/outputs/bundle/universalRelease/app-universal-release.aab
jarsigner \
  -sigalg SHA256withRSA -digestalg SHA-256 \
  -keystore "$HOME/keystores/katamarrant-release.jks" \
  "$AAB" katamarrant
jarsigner -verify "$AAB"           # must print "jar verified."
```

The `apksigner verify` command does **not** work on AABs (it's
APK-specific) — use `jarsigner -verify` for AABs and `apksigner verify`
for APKs.

For local sideload verification, generate a universal APK from the AAB via
`bundletool`:

```bash
bundletool build-apks --bundle=<path>.aab --output=app.apks --mode=universal
unzip -p app.apks universal.apk > universal.apk
adb -s <DEVICE_ID> install -r universal.apk
```

### 2.3 Smoke-test on device

Before uploading, install the universal APK on the Pixel
(`28111FDH200FHZ`) and verify:

- Quiz mode (single)
- Rapid-fire (10 questions)
- Drill mode (timer, auto-reveal on timeout)
- Browse tab (badges + accuracy)
- Settings persistence (toggle Japanese prompt, restart app, confirm it
  stuck)
- Scheduled notification (set 5 min interval, lock screen, wait — should
  fire and reopen the app)

## 3. Play Store listing

### 3.1 Console setup

1. Create the app in [Play Console](https://play.google.com/console) under
   `fr.weill_duflos.katamarrant` (the underscore form — see the note at the
   top of this file).
2. Default language: English (US). Add French (France) as a translation.
3. Category: **Education**. Content rating: complete the questionnaire
   (likely **Everyone**).

### 3.2 Required assets

Build all of these once and store them under `assets/store/` (gitignored if
they include personal screenshots, otherwise tracked):

- **App icon**: 512×512 PNG, **no alpha channel** (Play rejects RGBA here,
  contra Tauri's `generate_context!`). Build by extending
  `generate_icons.py` with a flattened-white-bg variant at
  `assets/store/play-icon-512.png`.
- **Feature graphic**: 1024×500 PNG (catmarrant on the brand red bg).
- **Screenshots**: 4–8 images per supported language, captured on the Pixel
  via `adb exec-out screencap -p > screen.png`. Cover home / quiz / rapid /
  drill / browse.
- **Short description**: ≤ 80 chars (FR + EN).
- **Long description**: ≤ 4000 chars (FR + EN).
- **Privacy policy URL**: required even for offline apps. Host a static
  page (e.g. on GitHub Pages or `weill-duflos.fr`) stating: "the app
  stores all data locally in SQLite and transmits nothing".

### 3.3 Compliance audit before upload

Open `src-tauri/gen/android/app/src/main/AndroidManifest.xml` and confirm
only the strictly required permissions are declared:

- `POST_NOTIFICATIONS` (for the scheduled quiz prompt)
- `RECEIVE_BOOT_COMPLETED` (for `tauri-plugin-schedule-task` to re-arm
  after reboot)

Strip anything else Tauri auto-added that the app doesn't actually use.

### 3.4 Upload + rollout

Upload to tracks in this order:

1. **Internal testing** — invite `antoine@haply.co`. Smoke-test once Play
   delivers the build (typically a few minutes after upload).
2. **Closed alpha** — promote the same build, optionally invite a few
   testers.
3. **Production** — promote when alpha is happy.

### 3.5 Post-release

- Tag the commit: `git tag vX.Y.Z && git push --tags`.
- Document the next `versionCode` to use (so the next release starts at
  the right number even if local state is wiped).

## 4. Troubleshooting

- `proc macro panicked: icon ... is not RGBA` — Tauri's
  `generate_context!` requires the app icon (`src-tauri/icons/icon.png`)
  to be RGBA, but the **Play Store** icon must be RGB. Keep them as two
  separate files; never overwrite one with the other.
- `signing config 'release' not found` after a regen — the conditional
  signing block was wiped, see §1.3.
- Notification doesn't fire on Pixel after lock — Doze / battery-saver
  kicked in. This is a known Android OS behavior to validate (see roadmap
  Tier 5); not a release blocker for the first upload.
