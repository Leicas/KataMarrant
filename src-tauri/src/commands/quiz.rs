use rand::seq::SliceRandom;
use rand::Rng;
use serde::Serialize;

use crate::commands::gamification::{
    record_answer_with_gamification, AnswerGamificationOutcome,
};
use crate::data::{Technique, TECHNIQUES};
use crate::db::{self, TechniqueStat};
use crate::error::{AppError, AppResult};
use crate::state::{AppState, RECENT_SHOWN_CAP};

/// Multiplier applied to a candidate slug's weight when it appears in the
/// recent-shown deque. 0.05 = 95% suppression — strong enough to almost
/// always knock the slug out of contention, but non-zero so a tiny pool
/// (e.g. group_filter on a near-empty group) still has a fallback. See
/// `compute_weights` for the all-suppressed escape hatch that keeps
/// progress moving when EVERY candidate is on cooldown.
const RECENT_COOLDOWN_FACTOR: f64 = 0.05;

#[derive(Debug, Clone, Serialize)]
pub struct TechniqueDto {
    pub slug: &'static str,
    pub name: &'static str,
    pub kanji: &'static str,
    pub name_fr: &'static str,
    pub name_en: &'static str,
    pub group: u8,
    pub category: &'static str,
    pub judo_how_url: &'static str,
    pub wikipedia_url: &'static str,
    pub image_url: &'static str,
    pub youtube_id: &'static str,
}

impl From<&'static Technique> for TechniqueDto {
    fn from(t: &'static Technique) -> Self {
        Self {
            slug: t.slug,
            name: t.name,
            kanji: t.kanji,
            name_fr: t.name_fr,
            name_en: t.name_en,
            group: t.group,
            category: t.category,
            judo_how_url: t.judo_how_url,
            wikipedia_url: t.wikipedia_url,
            image_url: t.image_url,
            youtube_id: t.youtube_id,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct QuizQuestion {
    pub answer: TechniqueDto,
    pub choices: Vec<TechniqueDto>,
}

#[tauri::command]
pub fn list_techniques() -> Vec<TechniqueDto> {
    TECHNIQUES.iter().map(TechniqueDto::from).collect()
}

#[tauri::command]
pub fn get_technique(slug: String) -> AppResult<TechniqueDto> {
    crate::data::find(&slug)
        .map(TechniqueDto::from)
        .ok_or_else(|| AppError::General(format!("unknown technique: {slug}")))
}

/// Build a quiz question.
///
/// `distractor_mode`:
/// - "same-group" → other 7 of the same gokyo group (hardest, useful for gradutes)
/// - "same-category" → from the same category (te/koshi/ashi/sutemi)
/// - "any" → any other technique
///
/// `group_filter`: when Some(n), only pick the answer from group n.
#[tauri::command]
pub fn next_question(
    distractor_mode: Option<String>,
    group_filter: Option<u8>,
    state: tauri::State<'_, AppState>,
) -> AppResult<QuizQuestion> {
    let mode = distractor_mode.as_deref().unwrap_or("same-group");

    // Build the candidate pool (filtered by group if requested).
    let pool: Vec<&'static Technique> = TECHNIQUES
        .iter()
        .filter(|t| group_filter.map_or(true, |g| t.group == g))
        .collect();
    if pool.is_empty() {
        return Err(AppError::General("empty pool".into()));
    }

    let stats = {
        let conn = state.db.lock().unwrap();
        db::get_all_stats(&conn)?
    };
    let recents: Vec<String> = {
        let q = state.recent_shown.lock().unwrap();
        q.iter().cloned().collect()
    };
    let now = chrono::Utc::now().timestamp();
    let weights = compute_weights(&pool, &stats, &recents, now);

    let mut rng = rand::thread_rng();
    let idx = weighted_pick(&weights, &mut rng);
    let answer = pool[idx];

    // Distractors.
    let distractor_pool: Vec<&'static Technique> = TECHNIQUES
        .iter()
        .filter(|t| t.slug != answer.slug)
        .filter(|t| match mode {
            "same-group"    => t.group == answer.group,
            "same-category" => t.category == answer.category,
            _               => true,
        })
        .collect();

    // Fall back to "any" if not enough distractors in the strict pool.
    let mut chosen: Vec<&'static Technique> = distractor_pool
        .choose_multiple(&mut rng, 2)
        .copied()
        .collect();
    if chosen.len() < 2 {
        let all_others: Vec<&'static Technique> =
            TECHNIQUES.iter().filter(|t| t.slug != answer.slug).collect();
        chosen = all_others.choose_multiple(&mut rng, 2).copied().collect();
    }
    let mut choices: Vec<&'static Technique> = chosen;
    choices.push(answer);
    choices.shuffle(&mut rng);

    {
        let conn = state.db.lock().unwrap();
        db::touch_shown(&conn, answer.slug)?;
    }

    // Record this slug in the within-session recent-shown deque so the
    // next `next_question` call can suppress it. Capacity is bounded by
    // `RECENT_SHOWN_CAP`; oldest entry is evicted FIFO.
    {
        let mut q = state.recent_shown.lock().unwrap();
        q.push_back(answer.slug.to_string());
        while q.len() > RECENT_SHOWN_CAP {
            q.pop_front();
        }
    }

    Ok(QuizQuestion {
        answer: TechniqueDto::from(answer),
        choices: choices.into_iter().map(TechniqueDto::from).collect(),
    })
}

#[tauri::command]
pub fn answer_question(
    slug: String,
    correct: bool,
    mode: Option<String>,
    response_ms: Option<i64>,
    state: tauri::State<'_, AppState>,
) -> AppResult<AnswerGamificationOutcome> {
    let mode_str = mode.as_deref().unwrap_or("single");
    record_answer_with_gamification(&state, &slug, correct, mode_str, response_ms)
}

fn weighted_pick<R: Rng>(weights: &[f64], rng: &mut R) -> usize {
    let total: f64 = weights.iter().sum();
    if total <= 0.0 {
        return rng.gen_range(0..weights.len());
    }
    let mut x: f64 = rng.gen::<f64>() * total;
    for (i, w) in weights.iter().enumerate() {
        if x < *w {
            return i;
        }
        x -= w;
    }
    weights.len() - 1
}

/// Pure spaced-rep weighting — extracted from `next_question` so it can be
/// unit-tested without spinning up an `AppState`. For each candidate in
/// `pool`, returns the picker weight derived from the persistent stats and
/// the within-session `recents` cooldown deque.
///
/// Formula:
///
/// ```text
/// weight = 1
///        + 6 * smoothed_miss     (Laplace (wrong+1)/(total+2), stable on small N)
///        + recency_bonus         (≤ 2, scales with days since last shown)
///        + unseen_bonus          (+1.5 if never answered)
///        + mistake_bonus         (+0.4 per cumulative wrong, capped at +3)
///        + recent_fail_bonus     (+2 if the last answer was wrong)
/// ```
///
/// Then a "no-repeat" pass:
///
/// - any slug present in `recents` has its weight multiplied by
///   `RECENT_COOLDOWN_FACTOR` (95% suppression).
/// - escape hatch: if EVERY candidate is in `recents` (e.g. the user is
///   filtering on a tiny group whose entire size fits in the deque), the
///   slug shown LONGEST ago — front of `recents` — gets its full
///   un-suppressed weight back, guaranteeing forward progress.
///
/// `recent_fail_bonus` was lowered from +4 to +2 in conjunction with the
/// cooldown: at +4 a freshly-failed slug stayed ~5x more likely than the
/// average forever, which combined with no-cooldown produced the
/// "same question 3x in a row" bug. +2 keeps failed items prominent
/// (~3x average) while letting the deque enforce variety.
pub(crate) fn compute_weights(
    pool: &[&'static Technique],
    stats: &[TechniqueStat],
    recents: &[String],
    now_unix: i64,
) -> Vec<f64> {
    let mut weights: Vec<f64> = Vec::with_capacity(pool.len());
    for t in pool {
        let s = stats.iter().find(|s| s.slug == t.slug);
        let (correct, wrong, last_shown, last_correct) = match s {
            Some(s) => (
                s.correct_count as f64,
                s.wrong_count as f64,
                s.last_shown_at,
                s.last_correct,
            ),
            None => (0.0, 0.0, 0, None),
        };
        let total = correct + wrong;
        // Laplace smoothing: (wrong+1) / (total+2) — starts at 0.5 for
        // an unseen slug, converges to the true miss-rate as N grows.
        let smoothed_miss = (wrong + 1.0) / (total + 2.0);
        let age_days = ((now_unix - last_shown).max(0) as f64) / 86400.0;
        let recency_bonus = (age_days / 7.0).min(2.0);
        let unseen_bonus = if total == 0.0 { 1.5 } else { 0.0 };
        let mistake_bonus = (wrong * 0.4).min(3.0);
        let recent_fail_bonus = if last_correct == Some(false) { 2.0 } else { 0.0 };
        weights.push(
            1.0 + 6.0 * smoothed_miss
                + recency_bonus
                + unseen_bonus
                + mistake_bonus
                + recent_fail_bonus,
        );
    }

    // No-repeat cooldown. If every candidate is on cooldown we exempt the
    // slug shown longest ago so the picker can still make progress.
    let oldest_recent: Option<&str> = recents.first().map(|s| s.as_str());
    let all_on_cooldown = !pool.is_empty()
        && pool.iter().all(|t| recents.iter().any(|r| r == t.slug));
    for (i, t) in pool.iter().enumerate() {
        let is_recent = recents.iter().any(|r| r == t.slug);
        let is_exempt = all_on_cooldown && Some(t.slug) == oldest_recent;
        if is_recent && !is_exempt {
            weights[i] *= RECENT_COOLDOWN_FACTOR;
        }
    }
    weights
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::data::TECHNIQUES;

    fn pool_first(n: usize) -> Vec<&'static Technique> {
        TECHNIQUES.iter().take(n).collect()
    }

    #[test]
    fn cooldown_suppresses_recents_below_remaining() {
        // 10 candidates, mark the first 6 as "recently shown".
        let pool = pool_first(10);
        assert_eq!(pool.len(), 10, "need at least 10 techniques to run this test");
        let recents: Vec<String> = pool.iter().take(6).map(|t| t.slug.to_string()).collect();
        let stats: Vec<TechniqueStat> = Vec::new(); // pretend nobody has answered anything

        let now = 1_700_000_000;
        let weights = compute_weights(&pool, &stats, &recents, now);
        assert_eq!(weights.len(), 10);

        let suppressed_total: f64 = weights[..6].iter().sum();
        let fresh_total: f64 = weights[6..].iter().sum();

        // The 4 fresh slugs should dominate the 6 suppressed ones —
        // even though there are fewer of them.
        assert!(
            fresh_total > suppressed_total,
            "expected fresh sum > suppressed sum, got fresh={fresh_total} suppressed={suppressed_total}"
        );
        // And each suppressed weight should be about 5% of a fresh one.
        for i in 0..6 {
            for j in 6..10 {
                assert!(
                    weights[i] < weights[j] * 0.2,
                    "recent slug {i} (w={}) should be <20% of fresh slug {j} (w={})",
                    weights[i],
                    weights[j],
                );
            }
        }
    }

    #[test]
    fn cooldown_escape_hatch_when_everyone_is_recent() {
        // Pool of 3, recents covers all 3 (oldest first).
        let pool = pool_first(3);
        let recents: Vec<String> = pool.iter().map(|t| t.slug.to_string()).collect();
        let stats: Vec<TechniqueStat> = Vec::new();
        let now = 1_700_000_000;

        let weights = compute_weights(&pool, &stats, &recents, now);

        // The slug shown LONGEST ago (recents[0] == pool[0].slug) must
        // keep its full weight; the other two stay suppressed.
        assert!(
            weights[0] > weights[1] * 5.0 && weights[0] > weights[2] * 5.0,
            "oldest-recent should be exempt; got {weights:?}"
        );
    }

    #[test]
    fn recent_fail_bonus_is_two_not_four() {
        // Build a 2-element pool. Slug 0 has last_correct = Some(false),
        // slug 1 is unseen. With recent_fail_bonus = +2 the failed slug
        // should be ~3x baseline, NOT 5x.
        let pool = pool_first(2);
        let stats = vec![TechniqueStat {
            slug: pool[0].slug.to_string(),
            correct_count: 0,
            wrong_count: 0,
            last_shown_at: 0,
            last_correct: Some(false),
        }];
        let now = 0; // age_days = 0 for both
        let weights = compute_weights(&pool, &stats, &[], now);

        // Slug 0 (failed, unseen-counts-as-no-answers since stat row exists
        // but counts are 0): 1 + 6*0.5 + 0 + 1.5 (unseen) + 0 + 2.0 = 7.5
        // Slug 1 (truly unseen):                1 + 6*0.5 + 0 + 1.5 + 0 + 0 = 5.5
        // The old +4 bonus would have produced 9.5 for slug 0. Assert the
        // failed slug landed in the new band, well below the old one.
        assert!(weights[0] < 8.0, "recent-fail bonus appears too high: {weights:?}");
        assert!(weights[0] > 6.5, "recent-fail bonus appears too low: {weights:?}");
    }
}
