use rand::seq::SliceRandom;
use rand::Rng;
use serde::Serialize;

use crate::commands::gamification::{
    record_answer_with_gamification, AnswerGamificationOutcome,
};
use crate::data::{Technique, TECHNIQUES};
use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

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

    // Pondération spaced-rep — fait remonter les prises mal connues :
    //   weight = 1
    //          + 6 * smoothed_miss      (taux d'erreur lissé Laplace, stable même sur peu d'essais)
    //          + recency_bonus          (jusqu'à +2 si pas vue depuis 14 jours)
    //          + unseen_bonus           (+1.5 si jamais répondue)
    //          + mistake_bonus          (+0.4 par erreur cumulée, capé à +3)
    //          + recent_fail_bonus      (+4 si la dernière réponse était fausse)
    let stats = {
        let conn = state.db.lock().unwrap();
        db::get_all_stats(&conn)?
    };
    let now = chrono::Utc::now().timestamp();
    let mut weights: Vec<f64> = Vec::with_capacity(pool.len());
    for t in &pool {
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
        // Lissage Laplace : (wrong+1) / (total+2) — démarre à 0.5 si jamais vue,
        // converge vers le vrai taux quand le nombre d'essais grandit.
        let smoothed_miss = (wrong + 1.0) / (total + 2.0);
        let age_days = ((now - last_shown).max(0) as f64) / 86400.0;
        let recency_bonus = (age_days / 7.0).min(2.0);
        let unseen_bonus = if total == 0.0 { 1.5 } else { 0.0 };
        let mistake_bonus = (wrong * 0.4).min(3.0);
        let recent_fail_bonus = if last_correct == Some(false) { 4.0 } else { 0.0 };
        weights.push(
            1.0 + 6.0 * smoothed_miss
                + recency_bonus
                + unseen_bonus
                + mistake_bonus
                + recent_fail_bonus,
        );
    }

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
