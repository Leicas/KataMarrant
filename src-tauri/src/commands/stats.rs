use crate::data;
use crate::db::{self, OverallStats, TechniqueStat};
use crate::error::AppResult;
use crate::state::AppState;
use chrono::{Datelike, Duration, NaiveDate, TimeZone, Utc};
use serde::Serialize;
use std::collections::BTreeMap;

#[tauri::command]
pub fn get_overall_stats(state: tauri::State<'_, AppState>) -> AppResult<OverallStats> {
    let conn = state.db.lock().unwrap();
    db::overall_stats(&conn)
}

/// Diagnostic breakdown of `quiz_log` by mode + earliest/latest timestamp.
/// Surfaces in the Settings → Diagnostic card so users can sanity-check
/// the local "Total répondu" count when it diverges from the server's
/// leaderboard total (which only reflects the synced subset).
#[derive(Debug, Clone, Serialize)]
pub struct QuizLogBreakdown {
    pub total: i64,
    pub by_mode: Vec<(String, i64)>,
    pub earliest: Option<i64>,
    pub latest: Option<i64>,
}

/// Result of the one-shot dedup pass.
#[derive(Debug, Clone, Serialize)]
pub struct DedupResult {
    pub before: i64,
    pub after: i64,
    pub removed: i64,
}

/// Deletes quiz_log entries that are duplicates of a prior entry within
/// 2 seconds, matching slug + correct + mode. These were caused by a
/// fast-double-click race in single + rapid `onPick` handlers (no
/// idempotency guard until the bug fix in this commit). Also rebuilds
/// technique_stats from the deduped quiz_log so per-technique counts
/// stop reflecting the duplicates. After running this, you'll likely
/// want to call sync_force_resync so the next push sends the cleaned
/// state (legacy server-side duplicates remain unless cleaned there
/// separately).
#[tauri::command]
pub fn dedup_quiz_log(state: tauri::State<'_, AppState>) -> AppResult<DedupResult> {
    let conn = state.db.lock().unwrap();
    let before: i64 = conn.query_row("SELECT COUNT(*) FROM quiz_log", [], |r| r.get(0))?;

    // 1. Delete any quiz_log row that has an earlier sibling within 2s
    //    sharing slug + correct + mode. Pair-wise comparison via self-join;
    //    keeps the earliest (a.id < b.id), deletes b.
    let removed = conn.execute(
        "DELETE FROM quiz_log WHERE id IN (
            SELECT b.id FROM quiz_log a
            JOIN quiz_log b
              ON a.slug = b.slug
              AND a.correct = b.correct
              AND a.mode = b.mode
              AND b.id > a.id
              AND (b.answered_at - a.answered_at) BETWEEN 0 AND 2
         )",
        [],
    )? as i64;

    // 2. Rebuild technique_stats counts from the deduped quiz_log so
    //    `correct_count` / `wrong_count` reflect the cleaned data.
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "UPDATE technique_stats
            SET correct_count = 0,
                wrong_count   = 0,
                updated_at    = ?1",
        rusqlite::params![now],
    )?;
    conn.execute(
        "INSERT OR REPLACE INTO technique_stats
            (slug, correct_count, wrong_count, last_shown_at, last_correct, updated_at)
         SELECT
            q.slug,
            SUM(CASE WHEN q.correct = 1 THEN 1 ELSE 0 END),
            SUM(CASE WHEN q.correct = 0 THEN 1 ELSE 0 END),
            MAX(q.answered_at),
            (SELECT correct FROM quiz_log
              WHERE slug = q.slug ORDER BY id DESC LIMIT 1),
            ?1
         FROM quiz_log q
         GROUP BY q.slug",
        rusqlite::params![now],
    )?;

    // 3. Mark sync state dirty so the next push reflects the cleaned data.
    let _ = conn.execute(
        "UPDATE sync_state SET pending_changes = 1 WHERE id = 1",
        [],
    );

    let after: i64 = conn.query_row("SELECT COUNT(*) FROM quiz_log", [], |r| r.get(0))?;
    log::info!("[dedup] before={before}, after={after}, removed={removed}");
    Ok(DedupResult { before, after, removed })
}

#[tauri::command]
pub fn get_quiz_log_breakdown(state: tauri::State<'_, AppState>) -> AppResult<QuizLogBreakdown> {
    let conn = state.db.lock().unwrap();
    let total: i64 = conn.query_row("SELECT COUNT(*) FROM quiz_log", [], |r| r.get(0))?;
    let earliest: Option<i64> = conn
        .query_row("SELECT MIN(answered_at) FROM quiz_log", [], |r| r.get(0))
        .ok()
        .flatten();
    let latest: Option<i64> = conn
        .query_row("SELECT MAX(answered_at) FROM quiz_log", [], |r| r.get(0))
        .ok()
        .flatten();
    let mut stmt = conn.prepare(
        "SELECT IFNULL(mode, 'unknown') AS m, COUNT(*) FROM quiz_log GROUP BY m ORDER BY 2 DESC",
    )?;
    let by_mode: Vec<(String, i64)> = stmt
        .query_map([], |r| Ok((r.get::<_, String>(0)?, r.get::<_, i64>(1)?)))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(QuizLogBreakdown { total, by_mode, earliest, latest })
}

/// DTO enrichi: agrégats SQL + métriques dérivées (accuracy, status) calculées
/// dans la couche commande pour garder le schéma DB inchangé.
///
/// `status`:
/// - `"not_acquired"` — moins de 3 essais OU dernière réponse fausse
/// - `"acquired"` — ≥ 5 essais ET ≥ 80% de réussite ET dernière non fausse
/// - `"needs_work"` — entre les deux
#[derive(Debug, Clone, Serialize)]
pub struct TechniqueStatV1 {
    pub slug: String,
    pub correct_count: i64,
    pub wrong_count: i64,
    pub last_shown_at: i64,
    pub last_correct: Option<bool>,
    pub attempts: i64,
    pub accuracy: f32,
    pub status: &'static str,
}

impl From<TechniqueStat> for TechniqueStatV1 {
    fn from(s: TechniqueStat) -> Self {
        let attempts = s.correct_count + s.wrong_count;
        let accuracy = if attempts > 0 {
            s.correct_count as f32 / attempts as f32
        } else {
            0.0
        };
        let status = classify(s.correct_count, s.wrong_count, s.last_correct);
        Self {
            slug: s.slug,
            correct_count: s.correct_count,
            wrong_count: s.wrong_count,
            last_shown_at: s.last_shown_at,
            last_correct: s.last_correct,
            attempts,
            accuracy,
            status,
        }
    }
}

fn classify(correct: i64, wrong: i64, last_correct: Option<bool>) -> &'static str {
    let total = correct + wrong;
    if total < 3 || last_correct == Some(false) {
        "not_acquired"
    } else if total >= 5 && (correct as f32 / total as f32) >= 0.8 {
        "acquired"
    } else {
        "needs_work"
    }
}

#[tauri::command]
pub fn get_all_technique_stats(
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<TechniqueStatV1>> {
    let conn = state.db.lock().unwrap();
    let raw = db::get_all_stats(&conn)?;
    Ok(raw.into_iter().map(TechniqueStatV1::from).collect())
}

#[tauri::command]
pub fn get_technique_stat(
    slug: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<Option<TechniqueStatV1>> {
    let conn = state.db.lock().unwrap();
    Ok(db::get_stat(&conn, &slug)?.map(TechniqueStatV1::from))
}

// ---------------------------------------------------------------------------
// Analytics — aggregates over `quiz_log` for the Stats tab.
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct WeekStat {
    /// Unix timestamp of Monday 00:00 UTC for this bucket.
    pub week_start: i64,
    pub total: i64,
    pub correct: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct GroupStat {
    pub group: u8,
    pub total: i64,
    pub correct: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct CategoryStat {
    pub category: String,
    pub total: i64,
    pub correct: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct ResponseBucket {
    /// "0-2s", "2-5s", "5-10s", "10-20s", "20s+" — the frontend renders
    /// labels via i18n keys, but we ship a stable English fallback.
    pub label: &'static str,
    /// Inclusive lower bound, in milliseconds.
    pub min_ms: i64,
    /// Exclusive upper bound, or `None` for the open-ended top bucket.
    pub max_ms: Option<i64>,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnalyticsReport {
    pub weekly: Vec<WeekStat>,
    pub by_group: Vec<GroupStat>,
    pub by_category: Vec<CategoryStat>,
    pub response_buckets: Vec<ResponseBucket>,
    pub avg_response_ms: Option<f32>,
    pub total_with_response_ms: i64,
}

/// Align a Unix timestamp to the Monday 00:00 UTC of its week.
fn week_start_unix(ts: i64) -> i64 {
    let dt = match Utc.timestamp_opt(ts, 0).single() {
        Some(dt) => dt,
        None => return ts,
    };
    let date: NaiveDate = dt.date_naive();
    let weekday = date.weekday().num_days_from_monday();
    let monday = date - Duration::days(weekday as i64);
    monday
        .and_hms_opt(0, 0, 0)
        .map(|nd| nd.and_utc().timestamp())
        .unwrap_or(ts)
}

#[tauri::command]
pub fn get_analytics(state: tauri::State<'_, AppState>) -> AppResult<AnalyticsReport> {
    // Fixed-edge buckets for response-time distribution. Open top bucket
    // catches anything above 20s (probably users who got distracted).
    const BUCKETS: &[(&str, i64, Option<i64>)] = &[
        ("0-2s", 0, Some(2_000)),
        ("2-5s", 2_000, Some(5_000)),
        ("5-10s", 5_000, Some(10_000)),
        ("10-20s", 10_000, Some(20_000)),
        ("20s+", 20_000, None),
    ];

    let conn = state.db.lock().unwrap();
    let mut stmt = conn.prepare(
        "SELECT slug, correct, answered_at, response_ms FROM quiz_log ORDER BY answered_at ASC",
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, i64>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<i64>>(3)?,
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;

    let now = Utc::now().timestamp();
    let cutoff = now - 8 * 7 * 86_400; // last 8 weeks

    let mut weekly_map: BTreeMap<i64, (i64, i64)> = BTreeMap::new();
    let mut group_map: BTreeMap<u8, (i64, i64)> = BTreeMap::new();
    let mut cat_map: BTreeMap<String, (i64, i64)> = BTreeMap::new();
    let mut bucket_counts = vec![0i64; BUCKETS.len()];
    let mut total_response_ms: i128 = 0;
    let mut count_with_response_ms: i64 = 0;

    for (slug, correct_i, answered_at, response_ms) in rows {
        let correct = correct_i != 0;
        let inc = (1, if correct { 1 } else { 0 });

        if answered_at >= cutoff {
            let wk = week_start_unix(answered_at);
            let entry = weekly_map.entry(wk).or_insert((0, 0));
            entry.0 += inc.0;
            entry.1 += inc.1;
        }

        if let Some(tech) = data::find(&slug) {
            let g = group_map.entry(tech.group).or_insert((0, 0));
            g.0 += inc.0;
            g.1 += inc.1;
            let c = cat_map.entry(tech.category.to_string()).or_insert((0, 0));
            c.0 += inc.0;
            c.1 += inc.1;
        }

        if let Some(ms) = response_ms {
            // Skip implausibly large values to keep the histogram readable.
            if (0..24 * 3600 * 1000).contains(&ms) {
                total_response_ms += ms as i128;
                count_with_response_ms += 1;
                for (i, (_, lo, hi)) in BUCKETS.iter().enumerate() {
                    let in_bucket = match hi {
                        Some(top) => ms >= *lo && ms < *top,
                        None => ms >= *lo,
                    };
                    if in_bucket {
                        bucket_counts[i] += 1;
                        break;
                    }
                }
            }
        }
    }

    let weekly: Vec<WeekStat> = weekly_map
        .into_iter()
        .map(|(week_start, (total, correct))| WeekStat { week_start, total, correct })
        .collect();
    let by_group: Vec<GroupStat> = group_map
        .into_iter()
        .map(|(group, (total, correct))| GroupStat { group, total, correct })
        .collect();
    let by_category: Vec<CategoryStat> = cat_map
        .into_iter()
        .map(|(category, (total, correct))| CategoryStat { category, total, correct })
        .collect();
    let response_buckets: Vec<ResponseBucket> = BUCKETS
        .iter()
        .enumerate()
        .map(|(i, (label, lo, hi))| ResponseBucket {
            label,
            min_ms: *lo,
            max_ms: *hi,
            count: bucket_counts[i],
        })
        .collect();

    let avg_response_ms = if count_with_response_ms > 0 {
        Some((total_response_ms as f64 / count_with_response_ms as f64) as f32)
    } else {
        None
    };

    Ok(AnalyticsReport {
        weekly,
        by_group,
        by_category,
        response_buckets,
        avg_response_ms,
        total_with_response_ms: count_with_response_ms,
    })
}
