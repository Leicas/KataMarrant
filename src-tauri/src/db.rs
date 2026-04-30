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
            answered_at  INTEGER NOT NULL
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
    Ok(conn)
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
) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp();
    let (cd, wd) = if correct { (1, 0) } else { (0, 1) };
    let last_correct: i64 = if correct { 1 } else { 0 };
    conn.execute(
        r#"
        INSERT INTO technique_stats (slug, correct_count, wrong_count, last_shown_at, last_correct)
        VALUES (?1, ?2, ?3, ?4, ?5)
        ON CONFLICT(slug) DO UPDATE SET
            correct_count = correct_count + ?2,
            wrong_count   = wrong_count   + ?3,
            last_shown_at = ?4,
            last_correct  = ?5
        "#,
        params![slug, cd, wd, now, last_correct],
    )?;
    conn.execute(
        "INSERT INTO quiz_log (slug, correct, mode, answered_at) VALUES (?1, ?2, ?3, ?4)",
        params![slug, correct as i64, mode, now],
    )?;
    Ok(())
}

pub fn touch_shown(conn: &Connection, slug: &str) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        r#"
        INSERT INTO technique_stats (slug, last_shown_at)
        VALUES (?1, ?2)
        ON CONFLICT(slug) DO UPDATE SET last_shown_at = ?2
        "#,
        params![slug, now],
    )?;
    Ok(())
}

#[derive(Debug, Clone, Serialize)]
pub struct OverallStats {
    pub total_answered: i64,
    pub total_correct: i64,
    pub streak_today: i64,
}

pub fn overall_stats(conn: &Connection) -> AppResult<OverallStats> {
    let total_answered: i64 = conn.query_row("SELECT COUNT(*) FROM quiz_log", [], |r| r.get(0))?;
    let total_correct: i64 =
        conn.query_row("SELECT COUNT(*) FROM quiz_log WHERE correct = 1", [], |r| r.get(0))?;

    // Day boundary at local midnight.
    let start_of_day = chrono::Local::now()
        .date_naive()
        .and_hms_opt(0, 0, 0)
        .unwrap()
        .and_local_timezone(chrono::Local)
        .unwrap()
        .timestamp();
    let streak_today: i64 = conn.query_row(
        "SELECT COUNT(*) FROM quiz_log WHERE answered_at >= ?1",
        params![start_of_day],
        |r| r.get(0),
    )?;
    Ok(OverallStats { total_answered, total_correct, streak_today })
}
