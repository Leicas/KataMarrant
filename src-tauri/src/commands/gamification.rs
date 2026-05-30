//! Gamification — XP, level, streaks, combos, achievements.
//!
//! Pure functions live at the top of the module; the wiring with the DB
//! and the Tauri command surface is at the bottom.

use serde::Serialize;

use crate::data::TECHNIQUES;
use crate::db::{self, DailyProgressRow, GamificationStateRow};
use crate::error::{AppError, AppResult};
use crate::state::AppState;

// ---------------------------------------------------------------------------
// Pure XP / level / combo math
// ---------------------------------------------------------------------------

/// Cumulative XP required to reach `level` (level 1 = 0 XP).
/// Curve: `xp_for_level(n) = 50 * (n-1) * n` (so L1=0, L2=100, L3=300, L5=1000, L10=4500).
///
/// Architect plan said `50 * n * (n+1)` with L1=0 — that doesn't match
/// (50*1*2 = 100, not 0). The corrected curve hits the documented anchor
/// points: L1=0, L2=100, L3=300, L4=600, L5=1000, L10=4500, L20=19000.
/// We use this consistent curve and document it once here.
pub fn xp_for_level(level: u32) -> i64 {
    if level <= 1 {
        return 0;
    }
    let n = level as i64;
    50 * (n - 1) * n
}

/// Level corresponding to a given cumulative XP (clamped at 1).
pub fn level_for_xp(xp: i64) -> u32 {
    if xp <= 0 {
        return 1;
    }
    // Solve 50 * (n-1) * n <= xp  →  n^2 - n - xp/50 <= 0
    //                              →  n <= (1 + sqrt(1 + 4*xp/50)) / 2
    let disc = 1.0_f64 + 4.0 * (xp as f64) / 50.0;
    let n = ((1.0 + disc.sqrt()) / 2.0).floor() as i64;
    n.max(1) as u32
}

/// XP awarded for a single answer.
/// - Correct, no combo (combo_after <= 1): 10
/// - Combo bonus: +min(combo_after - 1, 5)  (combo=1 → 10, combo=6+ → 15)
/// - Wrong: 0
pub fn xp_for_answer(correct: bool, combo_after: u32) -> i64 {
    if !correct {
        return 0;
    }
    let bonus = (combo_after.saturating_sub(1)).min(5) as i64;
    10 + bonus
}

// ---------------------------------------------------------------------------
// Achievements registry
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Copy)]
pub struct AchievementDef {
    pub code: &'static str,
    pub name_en: &'static str,
    pub name_fr: &'static str,
    pub description_en: &'static str,
    pub description_fr: &'static str,
}

pub const ACHIEVEMENTS: &[AchievementDef] = &[
    AchievementDef {
        code: "first_light",
        name_en: "First Light",
        name_fr: "Premier rayon",
        description_en: "Your first correct answer.",
        description_fr: "Ta première bonne réponse.",
    },
    AchievementDef {
        code: "dai_ikkyo",
        name_en: "Dai Ikkyō Mastered",
        name_fr: "Dai Ikkyō maîtrisé",
        description_en: "All 8 techniques of the 1st group answered correctly at least 3 times.",
        description_fr: "Les 8 prises du 1er groupe correctes au moins 3 fois.",
    },
    AchievementDef {
        code: "dai_nikyo",
        name_en: "Dai Nikyō Mastered",
        name_fr: "Dai Nikyō maîtrisé",
        description_en: "All 8 techniques of the 2nd group answered correctly at least 3 times.",
        description_fr: "Les 8 prises du 2e groupe correctes au moins 3 fois.",
    },
    AchievementDef {
        code: "dai_sankyo",
        name_en: "Dai Sankyō Mastered",
        name_fr: "Dai Sankyō maîtrisé",
        description_en: "All 8 techniques of the 3rd group answered correctly at least 3 times.",
        description_fr: "Les 8 prises du 3e groupe correctes au moins 3 fois.",
    },
    AchievementDef {
        code: "dai_yonkyo",
        name_en: "Dai Yonkyō Mastered",
        name_fr: "Dai Yonkyō maîtrisé",
        description_en: "All 8 techniques of the 4th group answered correctly at least 3 times.",
        description_fr: "Les 8 prises du 4e groupe correctes au moins 3 fois.",
    },
    AchievementDef {
        code: "dai_gokyo",
        name_en: "Dai Gokyō Mastered",
        name_fr: "Dai Gokyō maîtrisé",
        description_en: "All 8 techniques of the 5th group answered correctly at least 3 times.",
        description_fr: "Les 8 prises du 5e groupe correctes au moins 3 fois.",
    },
    AchievementDef {
        code: "all_forty",
        name_en: "All Forty",
        name_fr: "Les quarante",
        description_en: "Every technique answered at least once.",
        description_fr: "Chaque prise répondue au moins une fois.",
    },
    AchievementDef {
        code: "osaekomi_master",
        name_en: "Osaekomi Master",
        name_fr: "Maître du Osaekomi",
        description_en: "All 7 osaekomi-waza pins answered correctly at least once.",
        description_fr: "Les 7 immobilisations osaekomi-waza correctes au moins une fois.",
    },
    AchievementDef {
        code: "centenary",
        name_en: "Centenary",
        name_fr: "Centenaire",
        description_en: "100 questions answered in a single day.",
        description_fr: "100 questions répondues en une journée.",
    },
    AchievementDef {
        code: "streak_7",
        name_en: "Week of Discipline",
        name_fr: "Semaine de discipline",
        description_en: "Answer questions on 7 consecutive days.",
        description_fr: "Répondre 7 jours consécutifs.",
    },
    AchievementDef {
        code: "streak_30",
        name_en: "Month of Discipline",
        name_fr: "Mois de discipline",
        description_en: "Answer questions on 30 consecutive days.",
        description_fr: "Répondre 30 jours consécutifs.",
    },
    AchievementDef {
        code: "perfect_burst",
        name_en: "Perfect Burst",
        name_fr: "Rafale parfaite",
        description_en: "Finish a rapid-fire round (10 questions) with no wrong answers.",
        description_fr: "Terminer une rafale (10 questions) sans erreur.",
    },
    AchievementDef {
        code: "silent_sensei",
        name_en: "Silent Sensei",
        name_fr: "Sensei silencieux",
        description_en: "Answer 10 consecutive drill questions in audio prompt mode.",
        description_fr: "Répondre 10 prises de drill en audio sans quitter.",
    },
];

fn achievement_def(code: &str) -> Option<&'static AchievementDef> {
    ACHIEVEMENTS.iter().find(|a| a.code == code)
}

/// Slugs of the 8 techniques in a given Gokyo group (1..=5).
fn group_slugs(group: u8) -> Vec<&'static str> {
    TECHNIQUES
        .iter()
        .filter(|t| t.group == group)
        .map(|t| t.slug)
        .collect()
}

// ---------------------------------------------------------------------------
// DTOs
// ---------------------------------------------------------------------------

#[derive(Debug, Clone, Serialize)]
pub struct DailyProgressDto {
    pub day: String,
    pub questions: i64,
    pub correct: i64,
    pub goal: i64,
    pub goal_met: bool,
    pub xp_earned: i64,
}

impl DailyProgressDto {
    fn from_row(row: DailyProgressRow, goal: i64) -> Self {
        Self {
            day: row.day,
            questions: row.questions,
            correct: row.correct,
            goal,
            goal_met: row.goal_met != 0,
            xp_earned: row.xp_earned,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct GamificationStateDto {
    pub level: u32,
    pub xp_total: i64,
    pub xp_for_current_level: i64,
    pub xp_for_next_level: i64,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub daily_goal: i64,
    pub current_combo: i64,
    pub best_combo: i64,
    pub today: DailyProgressDto,
}

impl GamificationStateDto {
    fn from_row(row: &GamificationStateRow, today: DailyProgressDto) -> Self {
        let level = row.level.max(1) as u32;
        Self {
            level,
            xp_total: row.xp_total,
            xp_for_current_level: xp_for_level(level),
            xp_for_next_level: xp_for_level(level + 1),
            current_streak: row.current_streak,
            longest_streak: row.longest_streak,
            daily_goal: row.daily_goal,
            current_combo: row.current_combo,
            best_combo: row.best_combo,
            today,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct UnlockedAchievement {
    pub code: String,
    pub name_en: String,
    pub name_fr: String,
    pub description_en: String,
    pub description_fr: String,
    pub unlocked_at: i64,
}

impl UnlockedAchievement {
    fn new(code: &str) -> Self {
        let def = achievement_def(code);
        let now = chrono::Utc::now().timestamp();
        Self {
            code: code.to_string(),
            name_en: def.map(|d| d.name_en).unwrap_or("").to_string(),
            name_fr: def.map(|d| d.name_fr).unwrap_or("").to_string(),
            description_en: def.map(|d| d.description_en).unwrap_or("").to_string(),
            description_fr: def.map(|d| d.description_fr).unwrap_or("").to_string(),
            unlocked_at: now,
        }
    }
}

#[derive(Debug, Clone, Serialize)]
pub struct AchievementInfo {
    pub code: String,
    pub name_en: String,
    pub name_fr: String,
    pub description_en: String,
    pub description_fr: String,
    pub unlocked: bool,
    pub unlocked_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct AnswerGamificationOutcome {
    pub xp_gained: i64,
    pub xp_total: i64,
    pub level: u32,
    pub level_up: bool,
    pub current_combo: i64,
    pub best_combo: i64,
    pub current_streak: i64,
    pub longest_streak: i64,
    pub streak_changed: bool,
    pub today: DailyProgressDto,
    pub unlocked: Vec<UnlockedAchievement>,
}

// ---------------------------------------------------------------------------
// Recording an answer (called from quiz::answer_question)
// ---------------------------------------------------------------------------

/// Wraps `db::record_answer` with the gamification state machine.
/// Returns the augmented outcome (XP, level, streak, combos, achievements).
pub fn record_answer_with_gamification(
    state: &AppState,
    slug: &str,
    correct: bool,
    mode: &str,
    response_ms: Option<i64>,
) -> AppResult<AnswerGamificationOutcome> {
    let conn = state.db.lock().unwrap();

    // 1. Persist the raw answer (preserves existing behavior).
    db::record_answer(&conn, slug, correct, mode, response_ms)?;

    // 2. Pull current gamification state.
    let mut gstate = db::get_gamification_state(&conn)?;
    let prev_level = gstate.level.max(1) as u32;
    let prev_streak = gstate.current_streak;

    // 3. Streak update.
    let today = db::local_today_string();
    let yesterday = db::local_day_offset_string(-1);
    let streak_changed;
    match gstate.last_active_day.as_deref() {
        Some(d) if d == today => {
            streak_changed = false;
        }
        Some(d) if d == yesterday => {
            gstate.current_streak += 1;
            streak_changed = true;
        }
        _ => {
            gstate.current_streak = 1;
            streak_changed = true;
        }
    }
    gstate.longest_streak = gstate.longest_streak.max(gstate.current_streak);
    gstate.last_active_day = Some(today.clone());

    // 4. Combo update.
    if correct {
        gstate.current_combo += 1;
    } else {
        gstate.current_combo = 0;
    }
    gstate.best_combo = gstate.best_combo.max(gstate.current_combo);

    // 5. XP for this answer.
    let mut xp_gained = xp_for_answer(correct, gstate.current_combo as u32);

    // Streak bonus on the first correct answer of a fresh day.
    let was_first_today_correct = correct
        && db::get_daily(&conn, &today)?.correct == 0
        && streak_changed; // means today is a "new" active day relative to last_active_day
    if was_first_today_correct {
        xp_gained += gstate.current_streak.clamp(0, 30);
    }

    // 6. Bump daily progress with the per-answer XP.
    let mut today_row = db::bump_daily(&conn, &today, correct, xp_gained)?;

    // 7. Daily-goal completion bonus — exactly once per day.
    let mut bonus_xp_total = xp_gained;
    if today_row.goal_met == 0 && today_row.questions >= gstate.daily_goal {
        let bonus = 25_i64;
        today_row = db::mark_goal_met(&conn, &today, bonus)?;
        bonus_xp_total += bonus;
        xp_gained += bonus;
    }

    // 8. Apply XP + level recompute.
    gstate.xp_total += bonus_xp_total;
    let new_level = level_for_xp(gstate.xp_total);
    let level_up = new_level > prev_level;
    gstate.level = new_level as i64;
    gstate.updated_at = chrono::Utc::now().timestamp();
    db::set_gamification_state(&conn, &gstate)?;

    // 9. Achievement evaluation.
    let mut unlocked: Vec<UnlockedAchievement> = Vec::new();

    if correct
        && !db::is_unlocked(&conn, "first_light")?
        && db::unlock_achievement(&conn, "first_light", None)?
    {
        unlocked.push(UnlockedAchievement::new("first_light"));
    }

    // Mastery per group.
    for (g, code) in [
        (1u8, "dai_ikkyo"),
        (2u8, "dai_nikyo"),
        (3u8, "dai_sankyo"),
        (4u8, "dai_yonkyo"),
        (5u8, "dai_gokyo"),
    ] {
        if !db::is_unlocked(&conn, code)? {
            let slugs = group_slugs(g);
            let mastered = db::count_mastered_in(&conn, &slugs)?;
            if mastered >= 8 && db::unlock_achievement(&conn, code, None)? {
                unlocked.push(UnlockedAchievement::new(code));
            }
        }
    }

    // All forty. Note: TECHNIQUES.len() now includes the 7 Osaekomi pins
    // in addition to the 40 throws, so the literal threshold is 47. The
    // achievement code/name is preserved for back-compat with existing
    // unlock rows; the description still reads "every technique answered
    // at least once" which stays accurate.
    if !db::is_unlocked(&conn, "all_forty")? {
        let attempted = db::count_distinct_attempted(&conn)?;
        if attempted >= TECHNIQUES.len() as i64
            && db::unlock_achievement(&conn, "all_forty", None)?
        {
            unlocked.push(UnlockedAchievement::new("all_forty"));
        }
    }

    // Osaekomi Master — every group-6 (osaekomi-waza) pin answered correctly
    // at least once. Looser bar than the per-Gokyo-group mastery checks
    // because the user just learned the syllabus exists.
    if !db::is_unlocked(&conn, "osaekomi_master")? {
        let slugs = group_slugs(6);
        if !slugs.is_empty() {
            let correct = db::count_correct_at_least_once_in(&conn, &slugs)?;
            if correct >= slugs.len() as i64
                && db::unlock_achievement(&conn, "osaekomi_master", None)?
            {
                unlocked.push(UnlockedAchievement::new("osaekomi_master"));
            }
        }
    }

    // Centenary — count merged across devices so a 60+40 split between
    // phone and laptop still fires it.
    let merged_today = db::get_daily_merged(&conn, &today)?;
    if !db::is_unlocked(&conn, "centenary")?
        && merged_today.questions >= 100
        && db::unlock_achievement(&conn, "centenary", None)?
    {
        unlocked.push(UnlockedAchievement::new("centenary"));
    }

    // Streak milestones.
    if streak_changed {
        if gstate.current_streak >= 7
            && !db::is_unlocked(&conn, "streak_7")?
            && db::unlock_achievement(&conn, "streak_7", None)?
        {
            unlocked.push(UnlockedAchievement::new("streak_7"));
        }
        if gstate.current_streak >= 30
            && !db::is_unlocked(&conn, "streak_30")?
            && db::unlock_achievement(&conn, "streak_30", None)?
        {
            unlocked.push(UnlockedAchievement::new("streak_30"));
        }
    }

    let goal = gstate.daily_goal;
    // Frontend renders the merged total so it matches across devices that
    // both push to the same account. `today_row` is *this* device's
    // contribution (used above for the goal-met decision and the
    // per-answer streak/combo bonus); we replace it with the merge for
    // the user-visible DTO.
    let _ = today_row;
    let today_dto = DailyProgressDto::from_row(merged_today, goal);

    Ok(AnswerGamificationOutcome {
        xp_gained,
        xp_total: gstate.xp_total,
        level: new_level,
        level_up,
        current_combo: gstate.current_combo,
        best_combo: gstate.best_combo,
        current_streak: gstate.current_streak,
        longest_streak: gstate.longest_streak,
        streak_changed: streak_changed && prev_streak != gstate.current_streak,
        today: today_dto,
        unlocked,
    })
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[tauri::command]
pub fn get_gamification_state(
    state: tauri::State<'_, AppState>,
) -> AppResult<GamificationStateDto> {
    let conn = state.db.lock().unwrap();
    let row = db::get_gamification_state(&conn)?;
    let today = db::local_today_string();
    // Merged across devices so the home/profile UI matches what the user
    // actually answered today, regardless of which device.
    let today_row = db::get_daily_merged(&conn, &today)?;
    let dto = DailyProgressDto::from_row(today_row, row.daily_goal);
    Ok(GamificationStateDto::from_row(&row, dto))
}

#[tauri::command]
pub fn set_daily_goal(
    goal: u32,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> AppResult<()> {
    if !(1..=100).contains(&goal) {
        return Err(AppError::Gamification(format!(
            "daily_goal must be in 1..=100 (got {goal})"
        )));
    }
    {
        let conn = state.db.lock().unwrap();
        db::set_daily_goal(&conn, goal as i64)?;
    }
    // The goal change affects the "il te manque X" body and the
    // skip-when-met logic — refresh OS-level pending notifications.
    crate::scheduler::re_enqueue_mobile(&app);
    Ok(())
}

#[tauri::command]
pub fn complete_rapid(
    correct_count: u32,
    total: u32,
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<UnlockedAchievement>> {
    let mut out = Vec::new();
    if correct_count == total && total >= 10 {
        let conn = state.db.lock().unwrap();
        if !db::is_unlocked(&conn, "perfect_burst")?
            && db::unlock_achievement(&conn, "perfect_burst", None)?
        {
            out.push(UnlockedAchievement::new("perfect_burst"));
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn complete_drill_run(
    consecutive_correct: u32,
    prompt_mode: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<UnlockedAchievement>> {
    let mut out = Vec::new();
    if consecutive_correct >= 10 && prompt_mode == "audio" {
        let conn = state.db.lock().unwrap();
        if !db::is_unlocked(&conn, "silent_sensei")?
            && db::unlock_achievement(&conn, "silent_sensei", None)?
        {
            out.push(UnlockedAchievement::new("silent_sensei"));
        }
    }
    Ok(out)
}

#[tauri::command]
pub fn list_achievements(
    state: tauri::State<'_, AppState>,
) -> AppResult<Vec<AchievementInfo>> {
    let conn = state.db.lock().unwrap();
    let unlocked = db::list_unlocked(&conn)?;
    let by_code: std::collections::HashMap<String, i64> = unlocked
        .into_iter()
        .map(|u| (u.code, u.unlocked_at))
        .collect();
    let out: Vec<AchievementInfo> = ACHIEVEMENTS
        .iter()
        .map(|a| AchievementInfo {
            code: a.code.to_string(),
            name_en: a.name_en.to_string(),
            name_fr: a.name_fr.to_string(),
            description_en: a.description_en.to_string(),
            description_fr: a.description_fr.to_string(),
            unlocked: by_code.contains_key(a.code),
            unlocked_at: by_code.get(a.code).copied(),
        })
        .collect();
    Ok(out)
}

// ---------------------------------------------------------------------------
// Tests for the pure math
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn level_anchors() {
        assert_eq!(xp_for_level(1), 0);
        assert_eq!(xp_for_level(2), 100);
        assert_eq!(xp_for_level(3), 300);
        assert_eq!(xp_for_level(5), 1000);
        assert_eq!(xp_for_level(10), 4500);
    }

    #[test]
    fn level_for_xp_round_trip() {
        for lv in 1u32..30 {
            let xp = xp_for_level(lv);
            assert_eq!(level_for_xp(xp), lv, "lv={lv}");
            // One XP below the next threshold should still be `lv`.
            if lv >= 1 {
                let next = xp_for_level(lv + 1);
                if next > 0 {
                    assert_eq!(level_for_xp(next - 1), lv);
                }
            }
        }
    }

    #[test]
    fn xp_per_answer_combo_caps_at_15() {
        assert_eq!(xp_for_answer(false, 0), 0);
        assert_eq!(xp_for_answer(false, 99), 0);
        assert_eq!(xp_for_answer(true, 0), 10);
        assert_eq!(xp_for_answer(true, 1), 10);
        assert_eq!(xp_for_answer(true, 2), 11);
        assert_eq!(xp_for_answer(true, 6), 15);
        assert_eq!(xp_for_answer(true, 50), 15);
    }
}
