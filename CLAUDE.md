# CLAUDE.md

Guidance for Claude Code working in this repo.

## Project overview

KataMarrant is a cross-platform Tauri 2 app (Rust backend, vanilla JS frontend, no
build step) for learning the 40 Gokyo no Waza techniques. Built to eventually run on
Android. The flow is multiple-choice quizzing with optional spaced-rep weighting,
rapid-fire bursts, and a periodic notification that reopens the quiz.

## Development

```bash
npm install
npm run dev                  # desktop dev (hot-reload frontend, compiles Rust)
npm run build                # desktop release
npm run android:init         # one-time android scaffolding (init + apply patches)
npm run android:dev          # android dev (requires Android Studio + JDK)
npm run android:build        # android release apk
npm run ios:dev              # ios dev (requires Xcode on macOS, see iOS section)
npm run ios:build            # ios release ipa (requires signing setup)
```

`src-tauri/gen/` is gitignored — `tauri android/ios init` regenerates it
wholesale. Hand-edited Android customisations live in
`src-tauri/android-patches/` and are re-applied by
`scripts/patch-android-gen.mjs` (which `npm run android:init` invokes
automatically; CI runs it after its own `tauri android init` step). If you
manually re-run `tauri android init` afterwards, follow up with
`npm run android:patch-gen` to re-apply the manifest perms +
notification small-icon + accent color.

Rust-only (in `src-tauri/`):

```bash
cargo check                  # fast type-check
cargo clippy --all-targets   # lint
cargo test --lib             # unit tests (scheduler math + quiz weighting + gamification)
cargo llvm-cov --lib --summary-only   # local coverage report (needs `cargo install cargo-llvm-cov` once)
```

The Rust unit tests cover the pure functions: `scheduler::next_fire_after`
(all `ScheduleConfig` variants + quiet-hours), `commands::quiz::compute_weights`
+ the recent-shown cooldown deque, and `commands::gamification` XP curves.
Tauri-runtime, SQLite, and platform-specific scheduler/notification code are
NOT exercised — those need integration harnesses we don't have yet. CI runs
`cargo test` + `cargo llvm-cov` and uploads to Codecov on every push/PR.

## Architecture

### Two-layer

- **Frontend** (`src/`): single-file vanilla JS (`main.js`), `styles.css`, `index.html`.
  No bundler. UI is a tab-based SPA: home, quiz, rapid-fire, browse, settings.
  Communicates with backend via `__TAURI__.core.invoke`. Listens to `show_quiz_prompt`
  events emitted by the scheduler.
- **Backend** (`src-tauri/src/`): Rust modules listed below.

### Backend modules

| Module | Purpose |
|---|---|
| `lib.rs` | Tauri setup, command registration, scheduler loop spawn |
| `state.rs` | `AppState` (db connection, scheduler state, recent-shown cooldown deque) |
| `error.rs` | `AppError` / `AppResult<T>` (serializes to JSON) |
| `data.rs` | Static `TECHNIQUES: &[Technique]` — 40 Gokyo entries (slug, romaji, kanji, `name_fr`, group, category, judo_how/wiki/image URLs) |
| `db.rs` | SQLite stats: `technique_stats`, `quiz_log`, helpers |
| `scheduler.rs` | `ScheduleConfig`, `next_fire_after`, desktop loop, mobile (`schedule_next_mobile`) handler shared by Android + iOS |
| `notification.rs` | Mobile notification channel (Android) + permission request + slot-id helper |
| `commands/quiz.rs` | `list_techniques`, `next_question`, `answer_question` |
| `commands/stats.rs` | `get_overall_stats`, `get_all_technique_stats` |
| `commands/scheduler.rs` | `set_quiz_schedule`, `get_quiz_schedule`, `trigger_quiz_now` |

### Question selection

`commands::quiz::next_question` weights candidates by:

```
weight = 1
       + 6 * smoothed_miss     (Laplace: (wrong+1)/(total+2))
       + recency_bonus         (≤ 2, scales with days since last shown)
       + unseen_bonus          (+1.5 if never answered)
       + mistake_bonus         (+0.4 per cumulative wrong, capped at +3)
       + recent_fail_bonus     (+2 if the last answer for the technique was wrong)
```

so weak / freshly-failed / unseen / stale techniques surface much more. The
`last_correct` flag in `technique_stats` is the trigger for the "you just
got it wrong" boost — a meaningful signal for spaced-rep priority, but
intentionally bounded (was +4, lowered to +2) so the cooldown below can
still rotate the pick.

After weighting, a within-session **no-repeat cooldown** is applied: the
last 6 slugs returned by `next_question` are tracked in
`AppState::recent_shown` (a `VecDeque<String>`, capped at
`state::RECENT_SHOWN_CAP = 6`, reset on app boot). Any candidate whose
slug is in that deque has its weight multiplied by `0.05` (95%
suppression). Edge case: if EVERY candidate is on cooldown (small
`group_filter` on a near-deque-sized pool), the slug shown longest ago
(front of the deque) is exempted so the picker can still make progress.
The cooldown is what guarantees no exact repeats inside a 10-pick run.

Distractors come from the same group by default (hardest), or same-category,
or anywhere.

### Scheduler

The scheduler is driven by a single `ScheduleConfig` (in `scheduler.rs`)
serialized as JSON under `settings.json` → `quiz_schedule`. Five kinds:
`Disabled`, `Daily { time, weekdays }`, `TwiceDaily { time_a, time_b, weekdays }`,
`DailyMinCount { time, min_count, weekdays }` ("smart" — fires unless the user
already answered ≥ N today), and `EveryMinutes { minutes, quiet_hours? }`. The
pure function `next_fire_after(...)` computes the next slot and is shared by
all platforms.

- **Desktop**: tokio loop tick every 30s; compares `next_fire_after` to `Local::now()`
  and emits `show_quiz_prompt` when due. The same loop runs on mobile so the
  in-app event fires while the app is foregrounded — but it deliberately does
  NOT raise OS notifications there (the mobile path below owns them, and
  doing both would double-notify).
- **Mobile (Android + iOS)**: `tauri-plugin-notification` pre-enqueues pending
  local notifications via `scheduler::schedule_next_mobile` (capped at 32
  slots over 30 days, well under iOS's 64-pending-per-app limit). On Android
  this lands as `setExactAndAllowWhileIdle` alarms delivered by the plugin's
  `TimedNotificationPublisher` BroadcastReceiver, so the notification fires
  whether or not our app process is alive. `RunEvent::Resumed` in `lib.rs`
  re-enqueues on each foreground so config edits propagate and the rolling
  horizon never drains. Caveat: `DailyMinCount` always fires the OS-level
  notification at the configured time regardless of today's count — the
  count check would require running app-side code at fire time, which
  neither platform reliably allows when the app is killed; the next
  foreground tick re-evaluates and prunes future slots accordingly.

  > Background: an earlier Android path used `tauri-plugin-schedule-task`
  > (WorkManager → `startActivity(MainActivity)` → Rust handler). It silently
  > failed on Android 10+ because background activity launches are blocked,
  > so the worker could never wake the app to fire the notification. The
  > current notification-plugin path bypasses the app process entirely.

Migration: an old `quiz_interval_minutes` u64 key (≤ 0.2.0) is auto-translated
to `EveryMinutes { minutes, quiet_hours: None }` (or `Disabled` for 0) on
first launch and the legacy key is deleted.

### iOS

- **`bundle.iOS.minimumSystemVersion`** is set to **13.0**.
- **No `developmentTeam` is configured yet** — the user does not have an
  Apple Developer account. Local development on a Mac will use Xcode's
  automatic free signing. Add `developmentTeam` to `tauri.conf.json` once
  signing is set up.
- **No App Store / TestFlight builds** until the cert is in place.
- iOS shares the Android mobile scheduling path via `tauri-plugin-notification`
  (see `scheduler::schedule_next_mobile`).
- **Bootstrapping a Mac**: run `npx tauri ios init` once on a Mac with Xcode
  installed to populate `src-tauri/gen/ios/`. That step is intentionally not
  automated here because it requires macOS + Xcode.
- Capability `capabilities/ios.json` declares `notification:default`.
  `capabilities/mobile.json` is empty (notifications are covered by the
  default capability); kept as a placeholder for future Android/iOS-only
  permissions.

### Sync server (separate, private repo)

The cross-device sync backend lives in a **separate sibling directory**
`D:\dev\katamarrant-sync\` and is intentionally NOT part of this public
repo (private deployment, contains SMTP credentials and JWT secrets). It
is a standalone Rust crate (`katamarrant-sync`, axum + sqlx + sqlite +
lettre) deployed on the user's Proxmox cluster behind a reverse proxy.

The client side (this repo) talks to it via the commands in
`src-tauri/src/commands/sync.rs`. The default server URL lives in
`src-tauri/src/db.rs::sync_state.server_url` and points at
`https://katamarrant.weill-duflos.fr`. Sync is fully optional — the app
works offline if the server is unreachable; all sync calls swallow
network errors and never propagate as fatal.

### Persistence

- **SQLite** (`rusqlite`, bundled): `technique_stats` (correct/wrong counts +
  last-shown), `quiz_log` (every answer with timestamp).
- **tauri-plugin-store** (`settings.json`): `quiz_schedule` (JSON-tagged
  `ScheduleConfig`). Legacy `quiz_interval_minutes` key is auto-migrated on
  first launch (see `lib.rs::migrate_legacy_interval`).
- **localStorage** (frontend): UI-only prefs (UI language, distractor mode, group
  filter, show-kanji toggle).

### i18n

The frontend has an inline `I18N` dictionary with `en` and `fr`. Default language
is detected via `navigator.language` on first launch and persisted in
localStorage. Technique data ships both the romaji canonical name (used as the
quiz answer) and `name_fr` (the literal French translation, shown in the
post-answer reveal and in the browse list). Kanji is always shown alongside.

### Visual / image strategy

Image-first: the quiz card shows an image of the technique (no kanji visible by
default), and the user identifies it from three romaji choices. The post-answer
reveal panel then shows romaji + kanji + French translation together with a soft
animated entrance.

`makeImageEl(tech)` resolves the source via cascade:

1. `assets/illustrations/<slug>.gif` (preferred — animated)
2. `assets/illustrations/<slug>.{webp,png,jpg}`
3. `tech.image_url` (remote, optional in `data.rs`)
4. `assets/silhouettes/<category>.svg` — final stylized fallback (4 hand-drawn
   silhouettes, one per category, in the app's red/gold theme)

The `Hint mode` setting (off by default) overlays the kanji as a small
translucent mark in the corner of the image during the question.

### External links

Each `Technique` carries a `judo_how_url` and `wikipedia_url`. The frontend opens
those via `tauri-plugin-opener` in the system browser. We never embed or scrape the
videos — judo.how stays the source of truth for the visual reference.

## Conventions

- Rust commands return `AppResult<T>` — never panic in handlers.
- Frontend is a single file; UI changes go in `src/main.js` / `src/styles.css`.
- New techniques (kata, etc.) go in `src-tauri/src/data.rs` — keep slugs URL-safe.
