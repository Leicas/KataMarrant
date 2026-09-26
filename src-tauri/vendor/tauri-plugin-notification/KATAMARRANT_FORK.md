# KataMarrant fork of tauri-plugin-notification 2.3.3

This is a verbatim copy of `tauri-plugin-notification` **2.3.3** from crates.io
with two Android-only Kotlin patches. It is wired in via `[patch.crates-io]` in
`src-tauri/Cargo.toml`. We fork (rather than patch `gen/android/`) because
`src-tauri/gen/` is regenerated wholesale by `tauri android init`, whereas a
Cargo path dependency survives regeneration and is rebuilt from source on every
`tauri android build`.

## Why fork — two genuine upstream bugs

### 1. Action buttons never render (no snooze / skip)
`android/.../NotificationStorage.kt` `writeActionGroup` wrote every action under
the **same** SharedPreferences key `"id${type.id}"` (e.g. `idquiz_prompt`), so
only the last action survived — while `getActionGroup` reads back
`"id0".."id{count-1}"`. The read keys were **never written**, so every action
came back with an empty `id`/`title`: buttons rendered blank (or not at all) and
routed to an empty action id. Fixed by indexing the write keys by position
(`id0`, `id1`, …), matching the reader.

### 2. Cold notification tap lands on the Android home screen
`android/.../TauriNotificationManager.kt` `buildIntent` built the content/action
PendingIntents with `action = ACTION_MAIN` + `addCategory(CATEGORY_LAUNCHER)` and
flags `SINGLE_TOP | CLEAR_TOP` (no `NEW_TASK`). That is byte-identical to the
home-launcher intent, so a **cold** tap (app process dead — the normal case for a
scheduled reminder, re-`notify()`ed by the headless `TimedNotificationPublisher`)
resolves as a launcher/Recents task-switch and drops the user on home.

Fix:
- `buildIntent` now sets a dedicated `action = NOTIFICATION_OPEN_ACTION`
  (`"app.tauri.notification.OPEN"`), removes `CATEGORY_LAUNCHER`, and uses
  `FLAG_ACTIVITY_NEW_TASK | FLAG_ACTIVITY_SINGLE_TOP` (NEW_TASK is required when
  the PendingIntent fires from the BroadcastReceiver context on a cold start;
  SINGLE_TOP keeps warm taps flowing through `onNewIntent`; CLEAR_TOP dropped —
  nothing to clear in our single-activity app, and it risked a cold-task bounce).
- `NotificationPlugin.kt` `onIntent` now gates on `NOTIFICATION_OPEN_ACTION`
  instead of `ACTION_MAIN` (otherwise it would early-return and the
  `actionPerformed` deep-link event would never fire).

The app manifest's launcher `intent-filter` (ACTION_MAIN/LAUNCHER) is untouched,
so launching from the app icon is unaffected.

## Exact diff surface (3 files)
- `android/src/main/java/NotificationStorage.kt` — `writeActionGroup` key indexing.
- `android/src/main/java/TauriNotificationManager.kt` — `NOTIFICATION_OPEN_ACTION`
  const + `buildIntent` intent shape.
- `android/src/main/java/NotificationPlugin.kt` — `onIntent` action guard.

Every edit is tagged with a `// KataMarrant fork:` comment. iOS/desktop/Rust are
untouched.

## Maintenance
On a plugin version bump: re-copy the crate, re-apply the three `// KataMarrant
fork:` edits, bump the copied version, and confirm `[patch.crates-io]` still
matches. Ideally upstream bug #1 (the key mismatch is a clear defect) so the fork
can eventually be dropped.
