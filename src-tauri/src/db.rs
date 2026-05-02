//! SQLite stats: per-technique correct/wrong counts + last-shown timestamp.
//!
//! Used by the quiz to weight technique selection (spaced repetition).

use rusqlite::{params, Connection};
use serde::Serialize;
use std::path::Path;

use crate::error::AppResult;

pub fn initialize(app_data_dir: &Path) -> AppResult<Connection> {
    std::fs::create_dir_all(app_data_dir)?;
    let conn = Connection::open(app_data_dir.join("kata-marrant.db"))?;
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS technique_stats (
            slug          TEXT PRIMARY KEY,
            correct_count INTEGER NOT NULL DEFAULT 0,
            wrong_count   INTEGER NOT NULL DEFAULT 0,
            last_shown_at INTEGER NOT NULL DEFAULT 0,
            last_correct  INTEGER
        );

        CREATE TABLE IF NOT EXISTS quiz_log (
            id           INTEGER PRIMARY KEY AUTOINCREMENT,
            slug         TEXT NOT NULL,
            correct      INTEGER NOT NULL,
            mode         TEXT NOT NULL,
            answered_at  INTEGER NOT NULL,
            response_ms  INTEGER
        );

        CREATE TABLE IF NOT EXISTS gamification_state (
            id                INTEGER PRIMARY KEY CHECK (id = 1),
            xp_total          INTEGER NOT NULL DEFAULT 0,
            level             INTEGER NOT NULL DEFAULT 1,
            current_streak    INTEGER NOT NULL DEFAULT 0,
            longest_streak    INTEGER NOT NULL DEFAULT 0,
            last_active_day   TEXT,
            daily_goal        INTEGER NOT NULL DEFAULT 10,
            current_combo     INTEGER NOT NULL DEFAULT 0,
            best_combo        INTEGER NOT NULL DEFAULT 0,
            updated_at        INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO gamification_state (id) VALUES (1);

        CREATE TABLE IF NOT EXISTS achievements_unlocked (
            code         TEXT PRIMARY KEY,
            unlocked_at  INTEGER NOT NULL,
            meta         TEXT
        );

        CREATE TABLE IF NOT EXISTS daily_progress (
            day            TEXT PRIMARY KEY,
            questions      INTEGER NOT NULL DEFAULT 0,
            correct        INTEGER NOT NULL DEFAULT 0,
            goal_met       INTEGER NOT NULL DEFAULT 0,
            xp_earned      INTEGER NOT NULL DEFAULT 0
        );
        "#,
    )?;
    // Migration: ajoute last_correct si la table date d'avant la pondération étendue.
    let has_last_correct: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('technique_stats') WHERE name = 'last_correct'",
        [],
        |r| r.get(0),
    )?;
    if has_last_correct == 0 {
        conn.execute("ALTER TABLE technique_stats ADD COLUMN last_correct INTEGER", [])?;
    }
    // Migration: ajoute quiz_log.response_ms (durée en ms entre prompt et réponse).
    let has_response_ms: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('quiz_log') WHERE name = 'response_ms'",
        [],
        |r| r.get(0),
    )?;
    if has_response_ms == 0 {
        conn.execute("ALTER TABLE quiz_log ADD COLUMN response_ms INTEGER", [])?;
    }

    // Migration (Track 4 / sync): track per-row LWW timestamp on technique_stats.
    let has_updated_at: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('technique_stats') WHERE name = 'updated_at'",
        [],
        |r| r.get(0),
    )?;
    if has_updated_at == 0 {
        conn.execute(
            "ALTER TABLE technique_stats ADD COLUMN updated_at INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
        // Backfill: seed `updated_at` from `last_shown_at` for existing rows
        // so they're treated as "old" data (a remote row with a recent
        // timestamp will win the LWW comparison on first push/pull).
        conn.execute(
            "UPDATE technique_stats SET updated_at = COALESCE(last_shown_at, 0)
             WHERE updated_at = 0",
            [],
        )?;
    }

    // Sync state (Track 4): one-row table holding the device's session JWT,
    // the user's email, the per-device client_id (a stable ULID), and the
    // last push/pull cursor timestamps. The JWT lives here in addition to
    // tauri-plugin-store so it's queryable from the Rust side without
    // round-tripping through the store.
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS sync_state (
            id              INTEGER PRIMARY KEY CHECK (id = 1),
            email           TEXT,
            session_jwt     TEXT,
            user_id         TEXT,
            client_id       TEXT,
            server_url      TEXT NOT NULL DEFAULT 'https://katamarrant.weill-duflos.fr',
            last_pulled_at  INTEGER NOT NULL DEFAULT 0,
            last_pushed_at  INTEGER NOT NULL DEFAULT 0,
            last_pushed_log_id INTEGER NOT NULL DEFAULT 0,
            pending_changes INTEGER NOT NULL DEFAULT 0,
            updated_at      INTEGER NOT NULL DEFAULT 0
        );
        INSERT OR IGNORE INTO sync_state (id) VALUES (1);
        "#,
    )?;
    // Idempotent column-add for upgrades from a pre-Track-4 sync_state row.
    let has_pushed_log_id: i64 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info('sync_state') WHERE name = 'last_pushed_log_id'",
        [],
        |r| r.get(0),
    )?;
    if has_pushed_log_id == 0 {
        conn.execute(
            "ALTER TABLE sync_state ADD COLUMN last_pushed_log_id INTEGER NOT NULL DEFAULT 0",
            [],
        )?;
    }

    // One-shot backfill of daily_progress from quiz_log on first run after upgrade.
    let daily_count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM daily_progress",
        [],
        |r| r.get(0),
    )?;
    if daily_count == 0 {
        backfill_daily_progress(&conn)?;
        backfill_streaks(&conn)?;
    }

    Ok(conn)
}

/// Walk `quiz_log`, group by local date, and seed `daily_progress` rows.
/// Best-effort xp estimate: correct * 10 (we don't have the historical combo).
fn backfill_daily_progress(conn: &Connection) -> AppResult<()> {
    let mut stmt = conn.prepare("SELECT correct, answered_at FROM quiz_log")?;
    let rows: Vec<(i64, i64)> = stmt
        .query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    use std::collections::BTreeMap;
    let mut by_day: BTreeMap<String, (i64, i64)> = BTreeMap::new();
    for (correct, ts) in rows {
        let day = local_day_string_from_unix(ts);
        let entry = by_day.entry(day).or_insert((0, 0));
        entry.0 += 1;
        if correct == 1 {
            entry.1 += 1;
        }
    }
    let goal = current_daily_goal(conn).unwrap_or(10);
    for (day, (q, c)) in by_day {
        let goal_met: i64 = if q >= goal as i64 { 1 } else { 0 };
        let xp = c * 10;
        conn.execute(
            "INSERT OR REPLACE INTO daily_progress (day, questions, correct, goal_met, xp_earned)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![day, q, c, goal_met, xp],
        )?;
    }
    Ok(())
}

/// Recompute current_streak / longest_streak from the freshly backfilled
/// daily_progress. Streak = consecutive days ending today (or yesterday) with
/// at least one answered question.
fn backfill_streaks(conn: &Connection) -> AppResult<()> {
    let mut stmt = conn.prepare("SELECT day FROM daily_progress ORDER BY day ASC")?;
    let days: Vec<String> = stmt
        .query_map([], |r| r.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    drop(stmt);

    if days.is_empty() {
        return Ok(());
    }

    // Compute longest streak overall.
    let mut longest: i64 = 1;
    let mut cur: i64 = 1;
    for win in days.windows(2) {
        if are_consecutive_days(&win[0], &win[1]) {
            cur += 1;
            if cur > longest {
                longest = cur;
            }
        } else {
            cur = 1;
        }
    }

    // Current streak = run ending at the last day, but only counts as
    // "current" if last day is today or yesterday (local).
    let today = local_today_string();
    let yesterday = local_day_offset_string(-1);
    let last = days.last().cloned().unwrap_or_default();

    let mut current: i64 = 0;
    if last == today || last == yesterday {
        current = 1;
        for i in (1..days.len()).rev() {
            if are_consecutive_days(&days[i - 1], &days[i]) {
                current += 1;
            } else {
                break;
            }
        }
    }

    conn.execute(
        "UPDATE gamification_state SET current_streak = ?1, longest_streak = ?2, last_active_day = ?3 WHERE id = 1",
        params![current, longest, last],
    )?;
    Ok(())
}

fn current_daily_goal(conn: &Connection) -> AppResult<i64> {
    let goal: i64 = conn.query_row(
        "SELECT daily_goal FROM gamification_state WHERE id = 1",
        [],
        |r| r.get(0),
    )?;
    Ok(goal)
}

/// Returns "YYYY-MM-DD" in local time for the given unix seconds timestamp.
pub fn local_day_string_from_unix(ts: i64) -> String {
    use chrono::TimeZone;
    chrono::Local
        .timestamp_opt(ts, 0)
        .single()
        .map(|dt| dt.format("%Y-%m-%d").to_string())
        .unwrap_or_else(|| "1970-01-01".to_string())
}

/// Returns today's local date as "YYYY-MM-DD".
pub fn local_today_string() -> String {
    chrono::Local::now().format("%Y-%m-%d").to_string()
}

/// Returns the local date `delta` days from today as "YYYY-MM-DD".
pub fn local_day_offset_string(delta: i64) -> String {
    let now = chrono::Local::now().date_naive();
    let target = now + chrono::Duration::days(delta);
    target.format("%Y-%m-%d").to_string()
}

/// True iff `b` is exactly one calendar day after `a` (both "YYYY-MM-DD").
pub fn are_consecutive_days(a: &str, b: &str) -> bool {
    let ad = chrono::NaiveDate::parse_from_str(a, "%Y-%m-%d");
    let bd = chrono::NaiveDate::parse_from_str(b, "%Y-%m-%d");
    match (ad, bd) {
        (Ok(ad), Ok(bd)) => (bd - ad).num_days() == 1,
        _ => false,
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct TechniqueStat {
    pub slug: String,
    pub correct_count: i64,
    pub wrong_count: i64,
    pub last_shown_at: i64,
    /// `Some(true)` si la dernière réponse était correcte, `Some(false)` si fausse,
    /// `None` si la prise n'a jamais été répondue.
    pub last_correct: Option<bool>,
}

pub fn get_all_stats(conn: &Connection) -> AppResult<Vec<TechniqueStat>> {
    let mut stmt = conn.prepare(
        "SELECT slug, correct_count, wrong_count, last_shown_at, last_correct FROM technique_stats",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TechniqueStat {
                slug: row.get(0)?,
                correct_count: row.get(1)?,
                wrong_count: row.get(2)?,
                last_shown_at: row.get(3)?,
                last_correct: row.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn get_stat(conn: &Connection, slug: &str) -> AppResult<Option<TechniqueStat>> {
    let mut stmt = conn.prepare(
        "SELECT slug, correct_count, wrong_count, last_shown_at, last_correct FROM technique_stats WHERE slug = ?1",
    )?;
    let mut rows = stmt.query_map(params![slug], |row| {
        Ok(TechniqueStat {
            slug: row.get(0)?,
            correct_count: row.get(1)?,
            wrong_count: row.get(2)?,
            last_shown_at: row.get(3)?,
            last_correct: row.get(4)?,
        })
    })?;
    Ok(rows.next().transpose()?)
}

pub fn record_answer(
    conn: &Connection,
    slug: &str,
    correct: bool,
    mode: &str,
    response_ms: Option<i64>,
) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp();
    let (cd, wd) = if correct { (1, 0) } else { (0, 1) };
    let last_correct: i64 = if correct { 1 } else { 0 };
    conn.execute(
        r#"
        INSERT INTO technique_stats (slug, correct_count, wrong_count, last_shown_at, last_correct, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?4)
        ON CONFLICT(slug) DO UPDATE SET
            correct_count = correct_count + ?2,
            wrong_count   = wrong_count   + ?3,
            last_shown_at = ?4,
            last_correct  = ?5,
            updated_at    = ?4
        "#,
        params![slug, cd, wd, now, last_correct],
    )?;
    conn.execute(
        "INSERT INTO quiz_log (slug, correct, mode, answered_at, response_ms) VALUES (?1, ?2, ?3, ?4, ?5)",
        params![slug, correct as i64, mode, now, response_ms],
    )?;
    // Mark sync state dirty so the next debounced flush picks this up.
    let _ = conn.execute(
        "UPDATE sync_state SET pending_changes = 1 WHERE id = 1",
        [],
    );
    Ok(())
}

pub fn touch_shown(conn: &Connection, slug: &str) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp();
    // Stamp `updated_at` so the row is picked up by the next sync push.
    // Without this, freshly-touched (but never-answered) rows sit at
    // updated_at = 0 forever and are skipped by `WHERE updated_at > since`.
    conn.execute(
        r#"
        INSERT INTO technique_stats (slug, last_shown_at, updated_at)
        VALUES (?1, ?2, ?2)
        ON CONFLICT(slug) DO UPDATE SET last_shown_at = ?2, updated_at = ?2
        "#,
        params![slug, now],
    )?;
    let _ = conn.execute(
        "UPDATE sync_state SET pending_changes = 1 WHERE id = 1",
        [],
    );
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct OverallStats {
    pub total_answered: i64,
    pub total_correct: i64,
    /// Number of answers recorded since local midnight today. Renamed from
    /// `streak_today` (which was a misnomer — it never represented a
    /// consecutive-day streak). Track 2 will introduce a real streak via
    /// `gamification_state.current_streak`.
    pub questions_today: i64,
}

/// Local-midnight timestamp helper. Shared with the scheduler so the
/// "today's count" used by `DailyMinCount` matches the home-card stat.
pub fn local_midnight_unix() -> i64 {
    chrono::Local::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_local_timezone(chrono::Local)
        .unwrap()
        .timestamp()
}

pub fn count_today(conn: &Connection) -> AppResult<i64> {
    let start_of_day = local_midnight_unix();
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM quiz_log WHERE answered_at >= ?1",
        params![start_of_day],
        |r| r.get(0),
    )?;
    Ok(n)
}

pub fn overall_stats(conn: &Connection) -> AppResult<OverallStats> {
    let total_answered: i64 = conn.query_row("SELECT COUNT(*) FROM quiz_log", [], |r| r.get(0))?;
    let total_correct: i64 =
        conn.query_row("SELECT COUNT(*) FROM quiz_log WHERE correct = 1", [], |r| r.get(0))?;
    let questions_today = count_today(conn)?;
    Ok(OverallStats { total_answered, total_correct, questions_today })
}

// ---------------------------------------------------------------------------
// Gamification helpers — back-end primitives for Track 2.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct GamificationStateRow {
    pub xp_total: i64,
    pub level: i64,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub last_active_day: Option<String>,
    pub daily_goal: i64,
    pub current_combo: i64,
    pub best_combo: i64,
    pub updated_at: i64,
}

pub fn get_gamification_state(conn: &Connection) -> AppResult<GamificationStateRow> {
    let row = conn.query_row(
        "SELECT xp_total, level, current_streak, longest_streak, last_active_day,
                daily_goal, current_combo, best_combo, updated_at
         FROM gamification_state WHERE id = 1",
        [],
        |r| {
            Ok(GamificationStateRow {
                xp_total: r.get(0)?,
                level: r.get(1)?,
                current_streak: r.get(2)?,
                longest_streak: r.get(3)?,
                last_active_day: r.get(4)?,
                daily_goal: r.get(5)?,
                current_combo: r.get(6)?,
                best_combo: r.get(7)?,
                updated_at: r.get(8)?,
            })
        },
    )?;
    Ok(row)
}

pub fn set_gamification_state(conn: &Connection, s: &GamificationStateRow) -> AppResult<()> {
    conn.execute(
        "UPDATE gamification_state
         SET xp_total = ?1, level = ?2, current_streak = ?3, longest_streak = ?4,
             last_active_day = ?5, daily_goal = ?6, current_combo = ?7,
             best_combo = ?8, updated_at = ?9
         WHERE id = 1",
        params![
            s.xp_total,
            s.level,
            s.current_streak,
            s.longest_streak,
            s.last_active_day,
            s.daily_goal,
            s.current_combo,
            s.best_combo,
            s.updated_at,
        ],
    )?;
    let _ = conn.execute(
        "UPDATE sync_state SET pending_changes = 1 WHERE id = 1",
        [],
    );
    Ok(())
}

pub fn set_daily_goal(conn: &Connection, goal: i64) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "UPDATE gamification_state SET daily_goal = ?1, updated_at = ?2 WHERE id = 1",
        params![goal, now],
    )?;
    let _ = conn.execute(
        "UPDATE sync_state SET pending_changes = 1 WHERE id = 1",
        [],
    );
    Ok(())
}

pub fn unlock_achievement(conn: &Connection, code: &str, meta: Option<&str>) -> AppResult<bool> {
    let now = chrono::Utc::now().timestamp();
    let changed = conn.execute(
        "INSERT OR IGNORE INTO achievements_unlocked (code, unlocked_at, meta)
         VALUES (?1, ?2, ?3)",
        params![code, now, meta],
    )?;
    Ok(changed > 0)
}

pub fn is_unlocked(conn: &Connection, code: &str) -> AppResult<bool> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM achievements_unlocked WHERE code = ?1",
        params![code],
        |r| r.get(0),
    )?;
    Ok(n > 0)
}

#[derive(Debug, Clone, Serialize)]
pub struct DailyProgressRow {
    pub day: String,
    pub questions: i64,
    pub correct: i64,
    pub goal_met: i64,
    pub xp_earned: i64,
}

pub fn bump_daily(
    conn: &Connection,
    day: &str,
    correct: bool,
    xp: i64,
) -> AppResult<DailyProgressRow> {
    conn.execute(
        "INSERT INTO daily_progress (day, questions, correct, goal_met, xp_earned)
         VALUES (?1, 1, ?2, 0, ?3)
         ON CONFLICT(day) DO UPDATE SET
             questions = questions + 1,
             correct = correct + ?2,
             xp_earned = xp_earned + ?3",
        params![day, if correct { 1 } else { 0 }, xp],
    )?;
    get_daily(conn, day)
}

pub fn mark_goal_met(conn: &Connection, day: &str, bonus_xp: i64) -> AppResult<DailyProgressRow> {
    conn.execute(
        "UPDATE daily_progress SET goal_met = 1, xp_earned = xp_earned + ?2 WHERE day = ?1",
        params![day, bonus_xp],
    )?;
    get_daily(conn, day)
}

pub fn get_daily(conn: &Connection, day: &str) -> AppResult<DailyProgressRow> {
    let row = conn.query_row(
        "SELECT day, questions, correct, goal_met, xp_earned FROM daily_progress WHERE day = ?1",
        params![day],
        |r| {
            Ok(DailyProgressRow {
                day: r.get(0)?,
                questions: r.get(1)?,
                correct: r.get(2)?,
                goal_met: r.get(3)?,
                xp_earned: r.get(4)?,
            })
        },
    );
    match row {
        Ok(r) => Ok(r),
        Err(rusqlite::Error::QueryReturnedNoRows) => Ok(DailyProgressRow {
            day: day.to_string(),
            questions: 0,
            correct: 0,
            goal_met: 0,
            xp_earned: 0,
        }),
        Err(e) => Err(e.into()),
    }
}

#[allow(dead_code)]
pub fn get_recent_days(conn: &Connection, n: i64) -> AppResult<Vec<DailyProgressRow>> {
    let mut stmt = conn.prepare(
        "SELECT day, questions, correct, goal_met, xp_earned
         FROM daily_progress ORDER BY day DESC LIMIT ?1",
    )?;
    let rows = stmt
        .query_map(params![n], |r| {
            Ok(DailyProgressRow {
                day: r.get(0)?,
                questions: r.get(1)?,
                correct: r.get(2)?,
                goal_met: r.get(3)?,
                xp_earned: r.get(4)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

#[allow(dead_code)]
pub fn count_unlocked(conn: &Connection) -> AppResult<i64> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM achievements_unlocked",
        [],
        |r| r.get(0),
    )?;
    Ok(n)
}

#[derive(Debug, Clone, Serialize)]
pub struct UnlockedRow {
    pub code: String,
    pub unlocked_at: i64,
}

pub fn list_unlocked(conn: &Connection) -> AppResult<Vec<UnlockedRow>> {
    let mut stmt = conn.prepare(
        "SELECT code, unlocked_at FROM achievements_unlocked ORDER BY unlocked_at ASC",
    )?;
    let rows = stmt
        .query_map([], |r| {
            Ok(UnlockedRow {
                code: r.get(0)?,
                unlocked_at: r.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Number of techniques in `slugs` that are "mastered": correct_count >= 3
/// AND last_correct = 1.
pub fn count_mastered_in(conn: &Connection, slugs: &[&str]) -> AppResult<i64> {
    if slugs.is_empty() {
        return Ok(0);
    }
    // Build "?, ?, ?, …" placeholders. SQLite has no parameter array support
    // with rusqlite outside of a prepared statement; build the list inline.
    let placeholders: Vec<&str> = slugs.iter().map(|_| "?").collect();
    let sql = format!(
        "SELECT COUNT(*) FROM technique_stats
         WHERE slug IN ({}) AND correct_count >= 3 AND last_correct = 1",
        placeholders.join(", ")
    );
    let mut stmt = conn.prepare(&sql)?;
    let params_vec: Vec<&dyn rusqlite::ToSql> = slugs.iter().map(|s| s as &dyn rusqlite::ToSql).collect();
    let n: i64 = stmt.query_row(params_vec.as_slice(), |r| r.get(0))?;
    Ok(n)
}

pub fn count_distinct_attempted(conn: &Connection) -> AppResult<i64> {
    let n: i64 = conn.query_row(
        "SELECT COUNT(*) FROM technique_stats",
        [],
        |r| r.get(0),
    )?;
    Ok(n)
}
