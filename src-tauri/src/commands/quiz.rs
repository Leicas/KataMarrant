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
/// recent-shown deque. 0.0 = hard ban: a slug in the deque cannot be
/// re-picked while it stays inside the cooldown window. The "all on
/// cooldown" escape hatch in `compute_weights` exempts the candidate
/// shown longest ago so the picker still has a non-zero option when
/// `group_filter` narrows the pool below the deque size. Was 0.05 (95%
/// suppression), but a heavily-weighted failed slug at 0.05 still beat
/// fresh-but-low-priority candidates often enough to surface as a "same
/// question loop" — the user reported seeing repeats anyway. Hard ban
/// is the only thing that cleanly kills the loop.
const RECENT_COOLDOWN_FACTOR: f64 = 0.0;

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
/// `groups_filter`: when Some(vec), only pick from those groups (e.g. [1,2,3,4,5] for "Gokyo only").
/// If both are set, `groups_filter` wins (it is the more general form).
#[tauri::command]
pub fn next_question(
    distractor_mode: Option<String>,
    group_filter: Option<u8>,
    groups_filter: Option<Vec<u8>>,
    state: tauri::State<'_, AppState>,
) -> AppResult<QuizQuestion> {
    let mode = distractor_mode.as_deref().unwrap_or("same-group");

    // Build the candidate pool (filtered by group if requested).
    let pool: Vec<&'static Technique> = TECHNIQUES
        .iter()
        .filter(|t| match (&groups_filter, group_filter) {
            (Some(gs), _) => gs.contains(&t.group),
            (None, Some(g)) => t.group == g,
            (None, None) => true,
        })
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
///   `RECENT_COOLDOWN_FACTOR` (currently 0.0 — hard ban; see the constant's
///   doc-comment for why we landed there instead of 0.05).
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

    // No-repeat cooldown. If every candidate is on cooldown we exempt
    // the candidate whose slug appears earliest in `recents` (i.e. shown
    // longest ago AMONG slugs that are actually in this pool — using
    // `recents.first()` directly is wrong when the pool is a strict
    // subset of the deque, e.g. group_filter mode).
    let all_on_cooldown = !pool.is_empty()
        && pool.iter().all(|t| recents.iter().any(|r| r == t.slug));
    let exempt_slug: Option<&str> = if all_on_cooldown {
        pool.iter()
            .filter_map(|t| {
                recents
                    .iter()
                    .position(|r| r == t.slug)
                    .map(|pos| (pos, t.slug))
            })
            .min_by_key(|&(pos, _)| pos)
            .map(|(_, slug)| slug)
    } else {
        None
    };
    for (i, t) in pool.iter().enumerate() {
        let is_recent = recents.iter().any(|r| r == t.slug);
        let is_exempt = exempt_slug == Some(t.slug);
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
    fn cooldown_hard_bans_recents() {
        // 12 candidates, mark the first 8 as "recently shown".
        let pool = pool_first(12);
        assert!(pool.len() >= 12, "need at least 12 techniques");
        let recents: Vec<String> = pool.iter().take(8).map(|t| t.slug.to_string()).collect();
        let stats: Vec<TechniqueStat> = Vec::new();
        let now = 1_700_000_000;

        let weights = compute_weights(&pool, &stats, &recents, now);
        assert_eq!(weights.len(), 12);

        // Hard ban: every recent slug's weight is exactly 0.
        for (i, &w) in weights.iter().enumerate().take(8) {
            assert_eq!(w, 0.0, "recent slug {i} should be 0, got {w}");
        }
        // Fresh slugs keep their priority weight.
        for (j, &w) in weights.iter().enumerate().skip(8).take(4) {
            assert!(w > 0.0, "fresh slug {j} should be > 0, got {w}");
        }
    }

    #[test]
    fn cooldown_escape_hatch_picks_oldest_in_pool() {
        // Pool of 3 = {pool[0], pool[1], pool[2]}. Recents (oldest first):
        // [some_other_slug, pool[2].slug, pool[0].slug, pool[1].slug].
        // Among in-pool slugs the oldest is pool[2] (pos 1 in recents),
        // so pool[2] is the one that should be exempted.
        let pool = pool_first(3);
        let recents: Vec<String> = vec![
            "not-in-pool-zzz".to_string(),
            pool[2].slug.to_string(),
            pool[0].slug.to_string(),
            pool[1].slug.to_string(),
        ];
        let stats: Vec<TechniqueStat> = Vec::new();
        let now = 1_700_000_000;

        let weights = compute_weights(&pool, &stats, &recents, now);
        // pool[2] should be the only non-zero weight.
        assert_eq!(weights[0], 0.0);
        assert_eq!(weights[1], 0.0);
        assert!(weights[2] > 0.0, "oldest-in-pool should be exempt; got {weights:?}");
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

    #[test]
    fn baseline_weight_with_no_stats_or_recents() {
        // Pool of 1, no stats, no recents, last_shown=0, now=0.
        // Expected: 1 (base) + 6*0.5 (Laplace) + 0 (recency) + 1.5 (unseen)
        //         + 0 (mistake) + 0 (recent_fail) = 5.5
        let pool = pool_first(1);
        let weights = compute_weights(&pool, &[], &[], 0);
        assert_eq!(weights.len(), 1);
        assert!((weights[0] - 5.5).abs() < 1e-9, "baseline drift: {:?}", weights);
    }

    #[test]
    fn well_known_correct_slug_has_lower_weight_than_unseen() {
        // Slug 0: 100 correct, 0 wrong, last_correct=Some(true), recent.
        //   smoothed_miss = 1/102 ≈ 0.0098; recency=0; unseen=0; mistake=0;
        //   recent_fail=0 → ~1.06.
        // Slug 1: unseen → 5.5 baseline (see prior test).
        let pool = pool_first(2);
        let stats = vec![TechniqueStat {
            slug: pool[0].slug.to_string(),
            correct_count: 100,
            wrong_count: 0,
            last_shown_at: 1_000,
            last_correct: Some(true),
        }];
        let weights = compute_weights(&pool, &stats, &[], 1_000);
        assert!(weights[0] < weights[1], "{:?}", weights);
        assert!(weights[0] < 1.5, "perfect slug should be ~1: {:?}", weights);
    }

    #[test]
    fn recency_bonus_grows_with_age() {
        // Same slug stats but compare two `now` values that differ by 14 days:
        // recency_bonus is age_days/7 capped at 2 → 14d → +2 hit cap.
        let pool = pool_first(1);
        let stats = vec![TechniqueStat {
            slug: pool[0].slug.to_string(),
            correct_count: 1,
            wrong_count: 0,
            last_shown_at: 0,
            last_correct: Some(true),
        }];
        let fresh = compute_weights(&pool, &stats, &[], 0);
        let stale = compute_weights(&pool, &stats, &[], 14 * 86_400);
        assert!(stale[0] > fresh[0], "stale should outweigh fresh: {fresh:?} vs {stale:?}");
        // Cap kicks in at ~14 days; pushing further shouldn't keep growing.
        let further = compute_weights(&pool, &stats, &[], 30 * 86_400);
        assert!((further[0] - stale[0]).abs() < 1e-9, "recency cap broke: {further:?} vs {stale:?}");
    }

    #[test]
    fn mistake_bonus_caps_at_three() {
        // 100 wrongs would be +40 if uncapped; the cap is +3.
        let pool = pool_first(1);
        let stats = vec![TechniqueStat {
            slug: pool[0].slug.to_string(),
            correct_count: 0,
            wrong_count: 100,
            last_shown_at: 0,
            last_correct: Some(true),
        }];
        let weights = compute_weights(&pool, &stats, &[], 0);
        // 1 + 6*(101/102) + 0 + 0 + 3 (capped) + 0 ≈ 1 + 5.94 + 3 = 9.94
        // Without the cap this would be ~46.94 — assert we're nowhere near.
        assert!(weights[0] < 12.0, "mistake bonus didn't cap: {weights:?}");
        assert!(weights[0] > 8.5, "mistake bonus too low: {weights:?}");
    }

    #[test]
    fn weighted_pick_uses_full_distribution() {
        // Deterministic RNG with a tiny pool and skewed weights — the test
        // is statistical but the seed makes it reproducible.
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(42);
        let weights = [1.0, 9.0]; // slug 1 should win ~90% of trials.
        let mut hits = [0usize; 2];
        for _ in 0..1_000 {
            hits[weighted_pick(&weights, &mut rng)] += 1;
        }
        // Loose bounds — well outside any plausible variance for 1k draws.
        assert!(hits[1] > 800, "weight-9 outcome under-represented: {hits:?}");
        assert!(hits[0] > 20, "weight-1 outcome never picked: {hits:?}");
    }

    #[test]
    fn weighted_pick_handles_all_zero_weights() {
        // total <= 0 path returns a uniform random index. Just check it
        // doesn't panic and returns a valid index.
        use rand::SeedableRng;
        let mut rng = rand::rngs::StdRng::seed_from_u64(7);
        let weights = [0.0, 0.0, 0.0];
        for _ in 0..100 {
            let idx = weighted_pick(&weights, &mut rng);
            assert!(idx < weights.len());
        }
    }

    /// Mirrors the deque eviction loop inside `next_question`. We keep
    /// `RECENT_SHOWN_CAP` covered here because the cap is the contract that
    /// `compute_weights`'s "all on cooldown" escape hatch relies on.
    #[test]
    fn recent_shown_deque_evicts_fifo_at_cap() {
        use std::collections::VecDeque;
        let mut q: VecDeque<String> = VecDeque::with_capacity(RECENT_SHOWN_CAP);
        for i in 0..(RECENT_SHOWN_CAP + 5) {
            q.push_back(format!("slug-{i}"));
            while q.len() > RECENT_SHOWN_CAP {
                q.pop_front();
            }
        }
        assert_eq!(q.len(), RECENT_SHOWN_CAP);
        // The first five entries should have been evicted.
        assert_eq!(q.front().unwrap(), &format!("slug-{}", 5));
        assert_eq!(
            q.back().unwrap(),
            &format!("slug-{}", RECENT_SHOWN_CAP + 4)
        );
    }
}
