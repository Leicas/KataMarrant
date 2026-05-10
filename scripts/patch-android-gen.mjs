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

console.log('[patch-android-gen] done.');
