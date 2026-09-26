#!/usr/bin/env node
// Patches the just-generated `src-tauri/gen/android/` tree with
// KataMarrant's hand-edited additions. Runs after `npx tauri android init`
// (CI step + locally after a fresh init) because Tauri regenerates
// gen/android/ wholesale and would otherwise overwrite our manifest +
// drawable + colors.
//
// Idempotent: re-running on an already-patched tree is a no-op (each
// patch checks for a marker before inserting).
//
// What this does:
//   1. Inject 2 <meta-data> tags (default_notification_icon,
//      default_notification_color) into the <application> element so
//      notifications use a branded monochrome icon + #D4A24C accent
//      instead of a generic white square.
//   2. Copy android-patches/ic_stat_quiz.xml into res/drawable/.
//   3. Add a `<color name="notification_color">#D4A24C</color>` entry to
//      res/values/colors.xml (or create the file if Tauri's init didn't).
//   4. Change MainActivity's launchMode from the Tauri template default
//      `singleTask` to `singleTop`. This helps the WARM notification-tap path
//      (deliver via onNewIntent without a destroy/recreate). The COLD path
//      root cause (a dead-process tap landing on the Android home screen)
//      was the plugin's ACTION_MAIN/CATEGORY_LAUNCHER content intent and is
//      fixed in the vendored plugin fork (src-tauri/vendor/
//      tauri-plugin-notification, wired via Cargo [patch.crates-io]) — see
//      that dir's KATAMARRANT_FORK.md. singleTop stays as the complementary
//      warm-path fix; do NOT revert it to singleTask.
//
// NOTE on exact-alarm permissions: we deliberately do NOT declare
// USE_EXACT_ALARM (Google Play restricts it to alarm/calendar apps —
// KataMarrant doesn't qualify) or SCHEDULE_EXACT_ALARM (would be unused
// without runtime grant UX). tauri-plugin-notification 2.3.3 already
// detects `canScheduleExactAlarms() == false` and falls back to
// AlarmManager.setAndAllowWhileIdle (inexact). Reminders may drift
// ±5-15min in Doze mode — acceptable for a daily learning prompt and
// keeps the manifest Play-Console-clean.

import { readFileSync, writeFileSync, copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..');
const genAndroid = join(repoRoot, 'src-tauri', 'gen', 'android');
const patchesDir = join(repoRoot, 'src-tauri', 'android-patches');

if (!existsSync(genAndroid)) {
  console.error(`[patch-android-gen] gen/android/ not found at ${genAndroid} — run \`npx tauri android init\` first.`);
  process.exit(1);
}

// 1: AndroidManifest.xml — inject notification meta-data
const manifestPath = join(genAndroid, 'app', 'src', 'main', 'AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');

if (!manifest.includes('com.tauri.notification.default_notification_icon')) {
  // Insert our 2 meta-data tags right after the <application ...> opening tag.
  manifest = manifest.replace(
    /(<application[^>]*>\s*)/,
    `$1
        <!-- KataMarrant: default small-icon + accent color for
             tauri-plugin-notification. Status-bar icons must be monochrome
             white-on-transparent (Android strips color from the small icon
             since API 21) — the accent color is reapplied as a tint via
             the color resource below. -->
        <meta-data android:name="com.tauri.notification.default_notification_icon" android:resource="@drawable/ic_stat_quiz"/>
        <meta-data android:name="com.tauri.notification.default_notification_color" android:resource="@color/notification_color"/>
`,
  );
  console.log('[patch-android-gen] manifest: added notification icon + color meta-data');
} else {
  console.log('[patch-android-gen] manifest: notification meta-data already present (skipped)');
}

// 1b: MainActivity launchMode — fix notification-tap not reopening the app.
//
// The Tauri CLI template declares the activity with
// `android:launchMode="singleTask"`. tauri-plugin-notification builds the
// notification's *content* (body-tap) PendingIntent via
// `PendingIntent.getActivity(...)` with the intent flags
// `FLAG_ACTIVITY_SINGLE_TOP | FLAG_ACTIVITY_CLEAR_TOP` and an
// ACTION_MAIN / CATEGORY_LAUNCHER intent (see
// TauriNotificationManager.kt::buildIntent + createActionIntents in the
// 2.3.3 plugin). On a `singleTask` root activity, FLAG_ACTIVITY_CLEAR_TOP
// applied by an ACTION_MAIN/LAUNCHER intent finishes-and-recreates the
// activity rather than routing cleanly through `onNewIntent`. For a Tauri
// WebView app that means the WebView is torn down and reloaded on every
// tap; the plugin fires its `actionPerformed` event (actionId "tap") into
// the *old* webview/page that is being destroyed, so the in-app deep-link
// is dropped and the body tap appears to do nothing — while the action
// BUTTONS keep working because they are normally exercised with the app
// already in the foreground (warm), where no clear/recreate happens.
//
// Switching to `singleTop` keeps a single top-of-task instance and
// delivers the tap intent through `onNewIntent` WITHOUT the destroy/
// recreate, so the WebView is preserved and the `actionPerformed` /
// onNewIntent path reliably reaches the live frontend. Cold starts
// (process dead) still launch normally. We deliberately do NOT use
// `singleInstance` (it isolates MainActivity in its own task and breaks
// startActivityForResult flows used by file pickers / tauri-plugin-opener).
if (/android:name=".MainActivity"/.test(manifest)) {
  if (/android:launchMode="singleTask"/.test(manifest)) {
    manifest = manifest.replace(
      /android:launchMode="singleTask"/,
      'android:launchMode="singleTop"',
    );
    console.log('[patch-android-gen] manifest: MainActivity launchMode singleTask -> singleTop (notification-tap fix)');
  } else if (/android:launchMode="singleTop"/.test(manifest)) {
    console.log('[patch-android-gen] manifest: MainActivity launchMode already singleTop (skipped)');
  } else {
    console.warn('[patch-android-gen] manifest: MainActivity launchMode not "singleTask" — template may have changed; left as-is. Verify notification-tap still works.');
  }
} else {
  console.warn('[patch-android-gen] manifest: MainActivity element not found — skipping launchMode patch.');
}

writeFileSync(manifestPath, manifest);

// 2: copy the small-icon drawable
const drawableDir = join(genAndroid, 'app', 'src', 'main', 'res', 'drawable');
mkdirSync(drawableDir, { recursive: true });
copyFileSync(
  join(patchesDir, 'ic_stat_quiz.xml'),
  join(drawableDir, 'ic_stat_quiz.xml'),
);
console.log('[patch-android-gen] copied ic_stat_quiz.xml into res/drawable/');

// 3: colors.xml — add our notification_color entry. Tauri's init may or may
//    not have created colors.xml; handle both cases.
const valuesDir = join(genAndroid, 'app', 'src', 'main', 'res', 'values');
mkdirSync(valuesDir, { recursive: true });
const colorsPath = join(valuesDir, 'colors.xml');
let colors;
if (existsSync(colorsPath)) {
  colors = readFileSync(colorsPath, 'utf8');
  if (colors.includes('name="notification_color"')) {
    console.log('[patch-android-gen] colors.xml: notification_color already present (skipped)');
  } else {
    colors = colors.replace(
      /<\/resources>/,
      `    <!-- KataMarrant: accent color for the monochrome notification small icon. -->
    <color name="notification_color">#D4A24C</color>
</resources>`,
    );
    writeFileSync(colorsPath, colors);
    console.log('[patch-android-gen] colors.xml: added notification_color');
  }
} else {
  colors = `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- KataMarrant: accent color for the monochrome notification small icon. -->
    <color name="notification_color">#D4A24C</color>
</resources>
`;
  writeFileSync(colorsPath, colors);
  console.log('[patch-android-gen] colors.xml: created with notification_color');
}

// 5: app/build.gradle.kts — derive a UNIQUE versionCode from the full
//    versionName (including any `-beta.N`). Tauri's generated versionCode is
//    `major*1000000 + minor*1000 + patch` and DROPS the prerelease suffix, so
//    every 1.9.0-beta.* collides at 1009000 and the Play Store upload rejects
//    the re-used code ("Version code 1009000 has already been used"). We
//    recompute in gradle from versionName (which Tauri sets to the full
//    string) using a wider, monotonic scheme:
//        major*10_000_000 + minor*100_000 + patch*1_000 + pre
//    where `pre` is the prerelease number (beta.N -> N) and a STABLE release
//    uses 999 so a final release always outranks its own prereleases.
const gradlePath = join(genAndroid, 'app', 'build.gradle.kts');
const legacyVersionCodeLine =
  'versionCode = tauriProperties.getProperty("tauri.android.versionCode", "1").toInt()';
if (!existsSync(gradlePath)) {
  console.warn('[patch-android-gen] build.gradle.kts not found — skipping versionCode patch.');
} else {
  let gradle = readFileSync(gradlePath, 'utf8');
  if (gradle.includes('KataMarrant: prerelease-aware versionCode')) {
    console.log('[patch-android-gen] build.gradle.kts: versionCode already prerelease-aware (skipped)');
  } else if (gradle.includes(legacyVersionCodeLine)) {
    const replacement = [
      'versionCode = run {',
      '            // KataMarrant: prerelease-aware versionCode. Tauri drops the',
      '            // -beta.N suffix so every 1.9.0-beta.* collides at 1009000 and',
      '            // Play rejects the reused code. Derive a monotonic code from',
      '            // the full versionName; stable releases use pre=999 so a final',
      '            // release outranks its prereleases.',
      '            val vn = tauriProperties.getProperty("tauri.android.versionName", "1.0")',
      "            val dash = vn.indexOf('-')",
      '            val core = if (dash >= 0) vn.substring(0, dash) else vn',
      '            val pre = if (dash >= 0)',
      "                vn.substring(dash + 1).split('.')",
      '                    .lastOrNull { it.isNotEmpty() && it.all(Char::isDigit) }',
      '                    ?.toIntOrNull() ?: 998',
      '            else 999',
      "            val parts = core.split('.')",
      '            val maj = parts.getOrNull(0)?.toIntOrNull() ?: 0',
      '            val min = parts.getOrNull(1)?.toIntOrNull() ?: 0',
      '            val pat = parts.getOrNull(2)?.toIntOrNull() ?: 0',
      '            maj * 10000000 + min * 100000 + pat * 1000 + pre',
      '        }',
    ].join('\n');
    gradle = gradle.replace(legacyVersionCodeLine, replacement);
    writeFileSync(gradlePath, gradle);
    console.log('[patch-android-gen] build.gradle.kts: versionCode now derived from full versionName (prerelease-aware)');
  } else {
    console.warn('[patch-android-gen] build.gradle.kts: versionCode line not found — Tauri template may have changed; left as-is. Verify Play version codes stay unique.');
  }
}

console.log('[patch-android-gen] done.');
