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
npm run android:dev          # android dev (requires Android Studio + JDK)
npm run android:build        # android release apk
```

Rust-only (in `src-tauri/`):

```bash
cargo check                  # fast type-check
cargo clippy --all-targets   # lint
```

There are no automated tests.

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
| `state.rs` | `AppState` (db connection, scheduler state) |
| `error.rs` | `AppError` / `AppResult<T>` (serializes to JSON) |
| `data.rs` | Static `TECHNIQUES: &[Technique]` — 40 Gokyo entries (slug, romaji, kanji, `name_fr`, group, category, judo_how/wiki/image URLs) |
| `db.rs` | SQLite stats: `technique_stats`, `quiz_log`, helpers |
| `scheduler.rs` | tokio loop + `tauri-plugin-schedule-task` handler (mobile) |
| `notification.rs` | Mobile notification channel + show helpers (mobile only) |
| `commands/quiz.rs` | `list_techniques`, `next_question`, `answer_question` |
| `commands/stats.rs` | `get_overall_stats`, `get_all_technique_stats` |
| `commands/scheduler.rs` | `set_quiz_interval`, `get_quiz_interval`, `trigger_quiz_now` |

### Question selection

`commands::quiz::next_question` weights candidates by:

```
weight = 1
       + 6 * smoothed_miss     (Laplace: (wrong+1)/(total+2))
       + recency_bonus         (≤ 2, scales with days since last shown)
       + unseen_bonus          (+1.5 if never answered)
       + mistake_bonus         (+0.4 per cumulative wrong, capped at +3)
       + recent_fail_bonus     (+4 if the last answer for the technique was wrong)
```

so weak / freshly-failed / unseen / stale techniques surface much more. The
`last_correct` flag in `technique_stats` is the trigger for the big "you just
got it wrong" boost — that's the dominant signal for spaced-rep priority.

Distractors come from the same group by default (hardest), or same-category,
or anywhere.

### Scheduler

Mirrors haply-time:

- **Desktop**: tokio loop tick every 30s, emits `show_quiz_prompt` once
  `interval_minutes` of wall-clock has passed.
- **Mobile**: `tauri-plugin-schedule-task` fires `quiz_prompt`, the handler emits
  `show_quiz_prompt`, shows a system notification, and re-arms the next slot.

`interval_minutes = 0` disables both paths.

### Persistence

- **SQLite** (`rusqlite`, bundled): `technique_stats` (correct/wrong counts +
  last-shown), `quiz_log` (every answer with timestamp).
- **tauri-plugin-store** (`settings.json`): `quiz_interval_minutes`.
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
