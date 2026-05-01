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
