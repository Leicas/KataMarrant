//! Quiz scheduler: emits a "show_quiz_prompt" event on the configured cadence.
//!
//! Two execution paths share one `ScheduleConfig`:
//!
//! - **Desktop**: a tokio loop tick every 30s that re-evaluates whether the
//!   next fire time has been reached. Cheap because the loop just compares
//!   timestamps. Also runs on mobile while the app is foregrounded so the
//!   in-app `show_quiz_prompt` event still fires for live UX, but it does
//!   NOT raise OS notifications there — the mobile path below owns those.
//! - **Mobile (Android + iOS)**: `tauri-plugin-notification` pre-enqueues a
//!   batch of pending local notifications (capped at 32 to stay well under
//!   iOS's 64-pending-per-app limit). On Android the plugin lands these as
//!   `setAndAllowWhileIdle` alarms (inexact, ±5-15min Doze drift — see the
//!   `schedule_next_mobile` comment for why we don't declare exact-alarm
//!   permissions) delivered by a BroadcastReceiver, so the notification
//!   fires whether or not our app process is alive. When the app is
//!   foregrounded (`RunEvent::Resumed`) we cancel-then-re-enqueue so the
//!   queue tracks any config edits and the rolling horizon never drains.

use chrono::{Datelike, Duration as ChronoDuration, Local, TimeZone, Timelike};
use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{self, Duration};

use crate::state::AppState;

// ---------------------------------------------------------------------------
// Configuration types — serialized to settings.json under "quiz_schedule".
// ---------------------------------------------------------------------------

#[derive(Default, Clone, Debug, Serialize, Deserialize, PartialEq, Eq)]
#[serde(tag = "kind", rename_all = "snake_case")]
pub enum ScheduleConfig {
    #[default]
    Disabled,
    Daily {
        time: TimeOfDay,
        weekdays: WeekdayMask,
        /// Optional quiet-hours override. If a computed slot lands inside
        /// the window, it is pushed forward to the first minute past the
        /// window's end. `#[serde(default)]` keeps backward compat with
        /// settings.json blobs that pre-date this field.
        #[serde(default)]
        quiet_hours: Option<QuietHours>,
    },
    TwiceDaily {
        time_a: TimeOfDay,
        time_b: TimeOfDay,
        weekdays: WeekdayMask,
        #[serde(default)]
        quiet_hours: Option<QuietHours>,
    },
    DailyMinCount {
        time: TimeOfDay,
        min_count: u32,
        weekdays: WeekdayMask,
    },
    EveryMinutes {
        minutes: u32,
        quiet_hours: Option<QuietHours>,
    },
}

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct TimeOfDay {
    pub hour: u8,
    pub minute: u8,
}

/// Bit0 = Monday … bit6 = Sunday. 0x7f = every day.
#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct WeekdayMask(pub u8);

#[derive(Clone, Copy, Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct QuietHours {
    pub start: TimeOfDay,
    pub end: TimeOfDay,
}

impl WeekdayMask {
    pub const ALL: WeekdayMask = WeekdayMask(0b0111_1111);

    /// Test whether the given chrono weekday is enabled.
    fn includes(&self, wd: chrono::Weekday) -> bool {
        let bit = wd.num_days_from_monday();
        (self.0 & (1u8 << bit)) != 0
    }
}

impl TimeOfDay {
    fn is_valid(&self) -> bool {
        self.hour < 24 && self.minute < 60
    }
}

impl ScheduleConfig {
    pub fn validate(&self) -> Result<(), String> {
        match self {
            ScheduleConfig::Disabled => Ok(()),
            ScheduleConfig::Daily { time, weekdays, quiet_hours } => {
                check_time(time)?;
                check_mask(weekdays)?;
                check_quiet(quiet_hours.as_ref())
            }
            ScheduleConfig::TwiceDaily { time_a, time_b, weekdays, quiet_hours } => {
                check_time(time_a)?;
                check_time(time_b)?;
                check_mask(weekdays)?;
                check_quiet(quiet_hours.as_ref())
            }
            ScheduleConfig::DailyMinCount { time, min_count, weekdays } => {
                check_time(time)?;
                check_mask(weekdays)?;
                if !(1..=200).contains(min_count) {
                    return Err(format!(
                        "min_count must be in 1..=200, got {min_count}"
                    ));
                }
                Ok(())
            }
            ScheduleConfig::EveryMinutes { minutes, quiet_hours } => {
                if *minutes == 0 || *minutes > 24 * 60 {
                    return Err(format!("minutes must be in 1..=1440, got {minutes}"));
                }
                check_quiet(quiet_hours.as_ref())
            }
        }
    }
}

fn check_quiet(qh: Option<&QuietHours>) -> Result<(), String> {
    if let Some(qh) = qh {
        check_time(&qh.start)?;
        check_time(&qh.end)?;
    }
    Ok(())
}

fn check_time(t: &TimeOfDay) -> Result<(), String> {
    if t.is_valid() {
        Ok(())
    } else {
        Err(format!("invalid time {:02}:{:02}", t.hour, t.minute))
    }
}

fn check_mask(m: &WeekdayMask) -> Result<(), String> {
    if m.0 <= 0x7f && m.0 != 0 {
        Ok(())
    } else {
        Err(format!("invalid weekday mask 0x{:x}", m.0))
    }
}

// ---------------------------------------------------------------------------
// Runtime state held in AppState.
// ---------------------------------------------------------------------------

#[derive(Default)]
pub struct SchedulerState {
    pub config: ScheduleConfig,
    /// Unix seconds — used by the desktop loop and the mobile resume
    /// re-enqueue to avoid double-firing across config-change races.
    pub last_fired_at: i64,
}

/// Payload emitted with the `show_quiz_prompt` event.
///
/// `source` is one of:
/// - `"scheduled"` — the desktop tokio loop matched a configured slot.
///   (Replaces the legacy `"interval"` value; same wire shape.)
/// - `"manual"` — `trigger_quiz_now` IPC call from the UI.
/// - `"notification_tap"` — user tapped a delivered notification body.
/// - `"action"` — user tapped an action button on a delivered
///   notification (Answer now / Snooze 1h / Skip today flow).
///
/// `technique_slug` is set when the source carried a pre-picked slug
/// (notification taps include the slug we baked into the alarm at
/// enqueue time); it is `None` for desktop-tick / manual paths so the
/// frontend can fall back to live spaced-rep weighting.
#[derive(Debug, Clone, Serialize)]
pub struct QuizPromptPayload {
    pub source: String,
    pub technique_slug: Option<String>,
}

// ---------------------------------------------------------------------------
// next_fire_after — pure scheduling math. Same function drives every
// platform's "when should the next prompt be?" calculation.
// ---------------------------------------------------------------------------

/// Compute the next fire time strictly after `after`. The
/// `today_count_provider` is only consulted for the `DailyMinCount` branch
/// (and even then, the architect's plan defers the count check to fire-time
/// rather than skipping the slot upfront). Returns `None` when the schedule
/// is `Disabled` or when no future slot can be found within a reasonable
/// horizon (14 days).
pub fn next_fire_after(
    config: &ScheduleConfig,
    after: chrono::DateTime<Local>,
    _today_count_provider: impl Fn() -> u32,
) -> Option<chrono::DateTime<Local>> {
    match config {
        ScheduleConfig::Disabled => None,
        ScheduleConfig::Daily { time, weekdays, quiet_hours } => {
            next_daily_slot(after, *time, *weekdays)
                .map(|dt| advance_past_quiet(dt, quiet_hours.as_ref()))
        }
        ScheduleConfig::TwiceDaily { time_a, time_b, weekdays, quiet_hours } => {
            let qh = quiet_hours.as_ref();
            let a = next_daily_slot(after, *time_a, *weekdays)
                .map(|dt| advance_past_quiet(dt, qh));
            let b = next_daily_slot(after, *time_b, *weekdays)
                .map(|dt| advance_past_quiet(dt, qh));
            match (a, b) {
                (Some(x), Some(y)) => Some(x.min(y)),
                (x, y) => x.or(y),
            }
        }
        ScheduleConfig::DailyMinCount { time, weekdays, .. } => {
            // The min-count check happens at fire time, not at scheduling
            // time — we always ask "when does the next slot land?" and let
            // the handler decide whether to actually emit. Quiet hours are
            // intentionally omitted from this variant: a "smart daily"
            // slot at a fixed time is the user's explicit choice — pushing
            // it past quiet hours could surprise them by reminding hours
            // late.
            next_daily_slot(after, *time, *weekdays)
        }
        ScheduleConfig::EveryMinutes { minutes, quiet_hours } => {
            let candidate = after + ChronoDuration::minutes(*minutes as i64);
            Some(advance_past_quiet(candidate, quiet_hours.as_ref()))
        }
    }
}

fn next_daily_slot(
    after: chrono::DateTime<Local>,
    t: TimeOfDay,
    mask: WeekdayMask,
) -> Option<chrono::DateTime<Local>> {
    for delta in 0..14 {
        let date = (after + ChronoDuration::days(delta)).date_naive();
        if !mask.includes(date.weekday()) {
            continue;
        }
        let candidate = match Local
            .with_ymd_and_hms(date.year(), date.month(), date.day(), t.hour as u32, t.minute as u32, 0)
            .single()
        {
            Some(dt) => dt,
            None => continue, // DST gap — skip
        };
        if candidate > after {
            return Some(candidate);
        }
    }
    None
}

fn advance_past_quiet(
    candidate: chrono::DateTime<Local>,
    quiet: Option<&QuietHours>,
) -> chrono::DateTime<Local> {
    let Some(qh) = quiet else { return candidate };
    if !is_in_quiet(candidate, qh) {
        return candidate;
    }
    // Jump to qh.end on the same day, or next day if end is "before" start
    // (which in clock arithmetic means the quiet window crosses midnight).
    let date = candidate.date_naive();
    let same_day_end = Local
        .with_ymd_and_hms(
            date.year(),
            date.month(),
            date.day(),
            qh.end.hour as u32,
            qh.end.minute as u32,
            0,
        )
        .single();
    match same_day_end {
        Some(dt) if dt > candidate => dt,
        _ => {
            // Either DST gap or the end-of-window already passed — push to
            // tomorrow at qh.end.
            let tomorrow = date + ChronoDuration::days(1);
            Local
                .with_ymd_and_hms(
                    tomorrow.year(),
                    tomorrow.month(),
                    tomorrow.day(),
                    qh.end.hour as u32,
                    qh.end.minute as u32,
                    0,
                )
                .single()
                .unwrap_or(candidate)
        }
    }
}

fn is_in_quiet(dt: chrono::DateTime<Local>, qh: &QuietHours) -> bool {
    let mins = dt.hour() * 60 + dt.minute();
    let start = qh.start.hour as u32 * 60 + qh.start.minute as u32;
    let end = qh.end.hour as u32 * 60 + qh.end.minute as u32;
    if start == end {
        false
    } else if start < end {
        mins >= start && mins < end
    } else {
        // Crosses midnight.
        mins >= start || mins < end
    }
}

// ---------------------------------------------------------------------------
// Desktop loop. Re-evaluates the config every TICK_SECS and fires when the
// computed next-slot is reached. Cheap: only does work when a fire is due.
// ---------------------------------------------------------------------------

const TICK_SECS: u64 = 30;

pub async fn run_scheduler_loop(app: AppHandle) {
    log::info!("[scheduler] desktop loop started (tick={}s)", TICK_SECS);
    loop {
        time::sleep(Duration::from_secs(TICK_SECS)).await;

        let (config, last_fired_at) = {
            let state = app.state::<AppState>();
            let s = state.scheduler.lock().unwrap();
            (s.config.clone(), s.last_fired_at)
        };

        if matches!(config, ScheduleConfig::Disabled) {
            continue;
        }

        let now = Local::now();
        // Anchor the search at last_fired_at (so we don't re-fire the same
        // slot twice on consecutive ticks). For brand-new state with
        // last_fired_at == 0 we fall back to (now - 1s) so the first tick
        // can pick up an upcoming slot rather than wait one full interval.
        let anchor = if last_fired_at > 0 {
            Local
                .timestamp_opt(last_fired_at, 0)
                .single()
                .unwrap_or(now - ChronoDuration::seconds(1))
        } else {
            now - ChronoDuration::seconds(1)
        };

        let count_provider = || count_today(&app);
        let Some(next) = next_fire_after(&config, anchor, count_provider) else {
            continue;
        };

        if now < next {
            continue;
        }

        // For DailyMinCount, gate the actual emission on today's count.
        if let ScheduleConfig::DailyMinCount { min_count, .. } = config {
            if count_today(&app) >= min_count {
                log::info!("[scheduler] daily_min_count: skipping (already met)");
                let state = app.state::<AppState>();
                let mut s = state.scheduler.lock().unwrap();
                s.last_fired_at = now.timestamp();
                continue;
            }
        }

        log::info!("[scheduler] emitting show_quiz_prompt (next was {next})");
        let payload = QuizPromptPayload {
            source: "scheduled".into(),
            technique_slug: None,
        };
        let _ = app.emit("show_quiz_prompt", &payload);

        // On mobile, the OS-level pre-enqueued alarm (see schedule_next_mobile)
        // fires the user-facing notification — we do NOT also fire one from
        // here because that would double-notify when the app happens to be
        // foregrounded at the slot. Desktop has no OS alarm path, so the
        // foreground emission above is the only signal.

        let state = app.state::<AppState>();
        let mut s = state.scheduler.lock().unwrap();
        s.last_fired_at = now.timestamp();
    }
}

fn count_today(app: &AppHandle) -> u32 {
    let state = app.state::<AppState>();
    let conn = state.db.lock().unwrap();
    crate::db::count_today(&conn).map(|n| n.max(0) as u32).unwrap_or(0)
}

// ---------------------------------------------------------------------------
// Mobile scheduling via tauri-plugin-notification.
//
// Pre-enqueues a batch of pending local notifications via the OS-level alarm
// path. On Android this lands as `setAndAllowWhileIdle` (inexact, ±5-15min
// drift in Doze mode) — we deliberately do NOT declare USE_EXACT_ALARM
// (Google Play restricts it to alarm/calendar apps) or SCHEDULE_EXACT_ALARM
// (would need a runtime grant UX), so tauri-plugin-notification's
// `canScheduleExactAlarms() == false` fallback path is what we get.
// Drift is acceptable for a daily learning prompt. The alarm is delivered
// by `app.tauri.notification.TimedNotificationPublisher` — a
// BroadcastReceiver that fires regardless of whether our app process is
// alive. On iOS the pending notifications sit in UNUserNotificationCenter.
//
// We use this on Android *and* iOS because the previous Android path
// (tauri-plugin-schedule-task / WorkManager → startActivity → Rust handler)
// silently failed: Android 10+ blocks background activity launches, so the
// worker could never wake the app to call `show_quiz_prompt_notification`.
// The notification-plugin path bypasses the app entirely — the OS displays
// the notification directly when the alarm fires.
//
// Caveats:
//   - DailyMinCount fires the OS notification at the configured time
//     regardless of today's count: the count check would require running
//     app-side code at fire time, which neither platform reliably allows
//     when the app is killed. The next foreground tick (or app launch)
//     re-enqueues the remaining slots and re-evaluates.
//   - iOS caps pending notifications at 64 per app; we stay well under
//     (max_pending=32) so this leaves headroom for any other notifications.
//   - `allow_while_idle: true` is critical on Android — without it the
//     alarm uses RTC (no wakeup) and won't fire while the device is in
//     Doze / dozing screen-off state, which is exactly when the user
//     needs the reminder.
// ---------------------------------------------------------------------------

#[cfg(mobile)]
pub async fn schedule_next_mobile(app: &AppHandle) {
    schedule_next_mobile_with_anchor(app, Local::now()).await;
}

/// `schedule_next_mobile` variant that lets the caller override the
/// "anchor" — the timestamp the slot search starts strictly after. Used
/// by the snooze action: the snooze button passes `now + 1h` so the next
/// pending alarm sits an hour out, regardless of the configured cadence.
#[cfg(mobile)]
pub async fn schedule_next_mobile_with_anchor(
    app: &AppHandle,
    start_anchor: chrono::DateTime<Local>,
) {
    use tauri_plugin_notification::{NotificationExt, Schedule};
    // Absolute path: `tokio::time` is brought into scope as `time` at the
    // top of this file, which would otherwise shadow the `time` crate and
    // make `time::OffsetDateTime` unresolvable.
    use ::time::OffsetDateTime;

    let state = app.state::<AppState>();
    let config = {
        let s = state.scheduler.lock().unwrap();
        s.config.clone()
    };

    // Cancel any previously enqueued notifications. Best-effort.
    if let Err(e) = app.notification().cancel_all() {
        log::warn!("[scheduler] mobile cancel_all failed: {e}");
    }

    if matches!(config, ScheduleConfig::Disabled) {
        return;
    }

    let locale = read_ui_language(app);
    let (title, body) = localized_quiz_strings(&locale);

    let horizon = Local::now() + ChronoDuration::days(30);
    let mut anchor = start_anchor;
    let mut count = 0;
    let max_pending: usize = 32;

    while count < max_pending {
        let Some(next) =
            next_fire_after(&config, anchor, || count_today(app))
        else {
            break;
        };
        if next > horizon {
            break;
        }

        let unix = next.timestamp();
        let Ok(date) = OffsetDateTime::from_unix_timestamp(unix) else {
            log::warn!("[scheduler] mobile: bad timestamp {unix}");
            break;
        };

        // Pre-pick a technique deterministically: cycle through the
        // syllabus by mapping the slot's epoch seconds modulo the
        // technique count. We bake this into the notification's extras so
        // the frontend can deep-link straight to the picked technique
        // without paying a round-trip to recompute spaced-rep weights at
        // notification-tap time. We deliberately do NOT use the live
        // weighting here because it depends on stats that haven't been
        // collected yet for slots 32 alarms ahead.
        let picked_slug = pick_slug_for_slot(unix);

        let id = crate::notification::mobile_notification_id(count as i32);
        let builder = app
            .notification()
            .builder()
            .id(id)
            .title(title)
            .body(body)
            .group("kata-quiz")
            .summary("Quiz reminder")
            .action_type_id(crate::notification::QUIZ_ACTION_TYPE_ID)
            // Custom sound asset placeholder. The file does not yet exist
            // in `res/raw/`, so the OS falls back to the channel's default
            // sound — exactly what we want during rollout.
            .sound("dojo_bell")
            .extra("type", "quiz_prompt")
            .extra("technique_slug", picked_slug);

        // Android needs an explicit channel id; iOS ignores it (no channels).
        // cfg-shadowing avoids an `unused_mut` warning on the iOS build.
        #[cfg(target_os = "android")]
        let builder = builder.channel_id(crate::notification::QUIZ_CHANNEL);

        let res = builder
            .schedule(Schedule::At { date, repeating: false, allow_while_idle: true })
            .show();

        if let Err(e) = res {
            log::error!("[scheduler] mobile schedule({next}) failed: {e}");
            break;
        }

        anchor = next;
        count += 1;
    }

    log::info!("[scheduler] mobile: enqueued {count} notifications");
}

/// Read `ui_language` from the tauri-plugin-store `settings.json`.
/// Returns `"en"` if the key is missing, malformed, or the underlying
/// store cannot be opened — never propagates an error since we'd rather
/// fall back to English than block notification scheduling.
#[cfg(mobile)]
fn read_ui_language(app: &AppHandle) -> String {
    use tauri_plugin_store::StoreExt;
    match app.store("settings.json") {
        Ok(store) => store
            .get("ui_language")
            .and_then(|v| v.as_str().map(|s| s.to_string()))
            .unwrap_or_else(|| "en".into()),
        Err(e) => {
            log::warn!("[scheduler] open store for ui_language failed: {e}");
            "en".into()
        }
    }
}

/// Localized title/body for the OS notification. Two locales today
/// (en, fr); anything else falls back to English. Returned as static
/// `&'static str` so we don't allocate per slot on the schedule loop.
#[cfg(mobile)]
fn localized_quiz_strings(locale: &str) -> (&'static str, &'static str) {
    match locale {
        "fr" => (
            "KataMarrant",
            "Heure du quiz ! Touchez pour identifier une technique.",
        ),
        _ => (
            "KataMarrant",
            "Quiz time! Tap to identify a technique.",
        ),
    }
}

/// Deterministic round-robin pick of a technique slug for a given slot
/// timestamp. Keyed on the slot's epoch seconds so the same slot always
/// maps to the same slug across re-enqueues, but the index walks
/// monotonically over the day (epoch divided by 60) so the user sees
/// genuine variety rather than a single technique on repeat.
#[cfg(mobile)]
fn pick_slug_for_slot(unix_seconds: i64) -> &'static str {
    let len = crate::data::TECHNIQUES.len() as i64;
    if len == 0 {
        // Defensive: should never happen — TECHNIQUES is a static const.
        return "";
    }
    // Bucket by minute so two slots within the same minute don't collide
    // on the same technique (each `set_quiz_schedule` re-enqueue restarts
    // the search and the deterministic mapping naturally varies).
    let bucket = unix_seconds / 60;
    // Rust's `%` follows the dividend's sign; `rem_euclid` keeps the
    // index in [0, len) for negative epoch values too (test harnesses).
    let idx = bucket.rem_euclid(len) as usize;
    crate::data::TECHNIQUES[idx].slug
}

// ---------------------------------------------------------------------------
// Unit tests for the pure scheduling math. Everything below covers
// `next_fire_after` (and its helpers) — the function shared by every
// platform's "when is the next prompt due?" path. No Tauri runtime required.
// ---------------------------------------------------------------------------

#[cfg(test)]
mod tests {
    use super::*;
    use chrono::{Datelike, Local, TimeZone};

    /// Build a deterministic Local timestamp for tests. We feed all branches
    /// of `next_fire_after` through this so the assertions are tied to a
    /// known wall clock, not the host runner's clock.
    fn dt(y: i32, m: u32, d: u32, h: u32, mi: u32) -> chrono::DateTime<Local> {
        Local
            .with_ymd_and_hms(y, m, d, h, mi, 0)
            .single()
            .expect("valid timestamp")
    }

    fn never_fired() -> u32 { 0 }

    // ----- Validation -------------------------------------------------------

    #[test]
    fn validate_disabled_is_ok() {
        assert!(ScheduleConfig::Disabled.validate().is_ok());
    }

    #[test]
    fn validate_rejects_bad_time() {
        let cfg = ScheduleConfig::Daily {
            time: TimeOfDay { hour: 25, minute: 0 },
            weekdays: WeekdayMask::ALL,
            quiet_hours: None,
        };
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn validate_rejects_zero_weekdays() {
        let cfg = ScheduleConfig::Daily {
            time: TimeOfDay { hour: 9, minute: 0 },
            weekdays: WeekdayMask(0),
            quiet_hours: None,
        };
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn validate_rejects_zero_minutes() {
        let cfg = ScheduleConfig::EveryMinutes { minutes: 0, quiet_hours: None };
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn validate_rejects_minutes_over_one_day() {
        let cfg = ScheduleConfig::EveryMinutes { minutes: 24 * 60 + 1, quiet_hours: None };
        assert!(cfg.validate().is_err());
    }

    #[test]
    fn validate_rejects_min_count_out_of_range() {
        let bad_low = ScheduleConfig::DailyMinCount {
            time: TimeOfDay { hour: 7, minute: 0 },
            min_count: 0,
            weekdays: WeekdayMask::ALL,
        };
        let bad_high = ScheduleConfig::DailyMinCount {
            time: TimeOfDay { hour: 7, minute: 0 },
            min_count: 201,
            weekdays: WeekdayMask::ALL,
        };
        assert!(bad_low.validate().is_err());
        assert!(bad_high.validate().is_err());
    }

    // ----- WeekdayMask ------------------------------------------------------

    #[test]
    fn weekday_mask_all_includes_every_day() {
        let mask = WeekdayMask::ALL;
        assert!(mask.includes(chrono::Weekday::Mon));
        assert!(mask.includes(chrono::Weekday::Tue));
        assert!(mask.includes(chrono::Weekday::Wed));
        assert!(mask.includes(chrono::Weekday::Thu));
        assert!(mask.includes(chrono::Weekday::Fri));
        assert!(mask.includes(chrono::Weekday::Sat));
        assert!(mask.includes(chrono::Weekday::Sun));
    }

    #[test]
    fn weekday_mask_weekdays_only() {
        // Mon-Fri = bits 0..=4 set.
        let mask = WeekdayMask(0b0001_1111);
        assert!(mask.includes(chrono::Weekday::Mon));
        assert!(mask.includes(chrono::Weekday::Fri));
        assert!(!mask.includes(chrono::Weekday::Sat));
        assert!(!mask.includes(chrono::Weekday::Sun));
    }

    // ----- Disabled / EveryMinutes -----------------------------------------

    #[test]
    fn disabled_returns_none() {
        let after = dt(2026, 1, 5, 12, 0);
        assert!(next_fire_after(&ScheduleConfig::Disabled, after, never_fired).is_none());
    }

    #[test]
    fn every_minutes_advances_by_minutes() {
        let after = dt(2026, 1, 5, 12, 0);
        let cfg = ScheduleConfig::EveryMinutes { minutes: 30, quiet_hours: None };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        assert_eq!(next, dt(2026, 1, 5, 12, 30));
    }

    #[test]
    fn every_minutes_skips_into_quiet_window() {
        // 22:00 quiet → 07:00. After=21:50 + 30min = 22:20 → skips to 07:00.
        let after = dt(2026, 1, 5, 21, 50);
        let cfg = ScheduleConfig::EveryMinutes {
            minutes: 30,
            quiet_hours: Some(QuietHours {
                start: TimeOfDay { hour: 22, minute: 0 },
                end: TimeOfDay { hour: 7, minute: 0 },
            }),
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        // Quiet crosses midnight, so end-of-quiet is 07:00 the next day.
        assert_eq!(next, dt(2026, 1, 6, 7, 0));
    }

    #[test]
    fn every_minutes_no_quiet_hours_passes_through() {
        let after = dt(2026, 1, 5, 1, 0);
        let cfg = ScheduleConfig::EveryMinutes {
            minutes: 60,
            quiet_hours: Some(QuietHours {
                start: TimeOfDay { hour: 22, minute: 0 },
                end: TimeOfDay { hour: 7, minute: 0 },
            }),
        };
        // Candidate 02:00 lands inside quiet → push to 07:00 same day.
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        assert_eq!(next, dt(2026, 1, 5, 7, 0));
    }

    #[test]
    fn every_minutes_outside_quiet_passes_through() {
        let after = dt(2026, 1, 5, 12, 0);
        let cfg = ScheduleConfig::EveryMinutes {
            minutes: 30,
            quiet_hours: Some(QuietHours {
                start: TimeOfDay { hour: 22, minute: 0 },
                end: TimeOfDay { hour: 7, minute: 0 },
            }),
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        assert_eq!(next, dt(2026, 1, 5, 12, 30));
    }

    // ----- Daily -----------------------------------------------------------

    #[test]
    fn daily_picks_today_when_after_is_before_slot() {
        // 2026-01-05 is a Monday. Slot is 19:00 daily. After=10:00 → today 19:00.
        let after = dt(2026, 1, 5, 10, 0);
        let cfg = ScheduleConfig::Daily {
            time: TimeOfDay { hour: 19, minute: 0 },
            weekdays: WeekdayMask::ALL,
            quiet_hours: None,
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        assert_eq!(next, dt(2026, 1, 5, 19, 0));
    }

    #[test]
    fn daily_picks_tomorrow_when_after_is_past_slot() {
        let after = dt(2026, 1, 5, 20, 0);
        let cfg = ScheduleConfig::Daily {
            time: TimeOfDay { hour: 19, minute: 0 },
            weekdays: WeekdayMask::ALL,
            quiet_hours: None,
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        assert_eq!(next, dt(2026, 1, 6, 19, 0));
    }

    #[test]
    fn daily_skips_disabled_weekdays() {
        // 2026-01-05 = Mon. Mask is Sat+Sun only (bits 5 and 6).
        let after = dt(2026, 1, 5, 8, 0);
        let cfg = ScheduleConfig::Daily {
            time: TimeOfDay { hour: 9, minute: 0 },
            weekdays: WeekdayMask(0b0110_0000),
            quiet_hours: None,
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        // First valid is Saturday 2026-01-10.
        assert_eq!(next, dt(2026, 1, 10, 9, 0));
        assert_eq!(next.weekday(), chrono::Weekday::Sat);
    }

    #[test]
    fn daily_pushes_slot_past_quiet_window_same_day() {
        // Slot is 06:30; quiet hours 06:00 → 08:00 (same-day window).
        // Expect the slot to land at 08:00 same day.
        let after = dt(2026, 1, 5, 0, 0);
        let cfg = ScheduleConfig::Daily {
            time: TimeOfDay { hour: 6, minute: 30 },
            weekdays: WeekdayMask::ALL,
            quiet_hours: Some(QuietHours {
                start: TimeOfDay { hour: 6, minute: 0 },
                end: TimeOfDay { hour: 8, minute: 0 },
            }),
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        assert_eq!(next, dt(2026, 1, 5, 8, 0));
    }

    #[test]
    fn daily_pushes_slot_past_quiet_window_crossing_midnight() {
        // Slot is 23:00; quiet hours 22:00 → 07:00 (crosses midnight).
        // Expect the slot to land at 07:00 the NEXT day.
        let after = dt(2026, 1, 5, 12, 0);
        let cfg = ScheduleConfig::Daily {
            time: TimeOfDay { hour: 23, minute: 0 },
            weekdays: WeekdayMask::ALL,
            quiet_hours: Some(QuietHours {
                start: TimeOfDay { hour: 22, minute: 0 },
                end: TimeOfDay { hour: 7, minute: 0 },
            }),
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        assert_eq!(next, dt(2026, 1, 6, 7, 0));
    }

    #[test]
    fn daily_outside_quiet_passes_through() {
        // Slot 12:00 with a 22:00→07:00 quiet window; the slot is firmly
        // outside, no shift.
        let after = dt(2026, 1, 5, 0, 0);
        let cfg = ScheduleConfig::Daily {
            time: TimeOfDay { hour: 12, minute: 0 },
            weekdays: WeekdayMask::ALL,
            quiet_hours: Some(QuietHours {
                start: TimeOfDay { hour: 22, minute: 0 },
                end: TimeOfDay { hour: 7, minute: 0 },
            }),
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        assert_eq!(next, dt(2026, 1, 5, 12, 0));
    }

    // ----- TwiceDaily -------------------------------------------------------

    #[test]
    fn twice_daily_picks_earlier_slot() {
        // Both 09:00 and 19:00; after=08:00 → 09:00 today.
        let after = dt(2026, 1, 5, 8, 0);
        let cfg = ScheduleConfig::TwiceDaily {
            time_a: TimeOfDay { hour: 9, minute: 0 },
            time_b: TimeOfDay { hour: 19, minute: 0 },
            weekdays: WeekdayMask::ALL,
            quiet_hours: None,
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        assert_eq!(next, dt(2026, 1, 5, 9, 0));
    }

    #[test]
    fn twice_daily_picks_later_slot_after_first() {
        // After=10:00 has passed 09:00; should pick 19:00 today.
        let after = dt(2026, 1, 5, 10, 0);
        let cfg = ScheduleConfig::TwiceDaily {
            time_a: TimeOfDay { hour: 9, minute: 0 },
            time_b: TimeOfDay { hour: 19, minute: 0 },
            weekdays: WeekdayMask::ALL,
            quiet_hours: None,
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        assert_eq!(next, dt(2026, 1, 5, 19, 0));
    }

    #[test]
    fn twice_daily_rolls_to_tomorrow_after_both() {
        let after = dt(2026, 1, 5, 20, 0);
        let cfg = ScheduleConfig::TwiceDaily {
            time_a: TimeOfDay { hour: 9, minute: 0 },
            time_b: TimeOfDay { hour: 19, minute: 0 },
            weekdays: WeekdayMask::ALL,
            quiet_hours: None,
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        // First slot tomorrow is the earlier of the two, 09:00.
        assert_eq!(next, dt(2026, 1, 6, 9, 0));
    }

    #[test]
    fn twice_daily_pushes_morning_slot_past_quiet() {
        // Quiet 22:00 → 07:00. Morning slot 06:30 lands inside quiet →
        // shifted to 07:00. Evening slot 19:00 untouched. Earlier of the
        // two (07:00) wins.
        let after = dt(2026, 1, 5, 0, 0);
        let cfg = ScheduleConfig::TwiceDaily {
            time_a: TimeOfDay { hour: 6, minute: 30 },
            time_b: TimeOfDay { hour: 19, minute: 0 },
            weekdays: WeekdayMask::ALL,
            quiet_hours: Some(QuietHours {
                start: TimeOfDay { hour: 22, minute: 0 },
                end: TimeOfDay { hour: 7, minute: 0 },
            }),
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        assert_eq!(next, dt(2026, 1, 5, 7, 0));
    }

    #[test]
    fn twice_daily_pushes_both_slots_past_quiet() {
        // Quiet 06:00 → 23:30 (very long; both slots inside).
        // 09:00 → 23:30, 19:00 → 23:30 → earliest is the same-day 23:30.
        let after = dt(2026, 1, 5, 0, 0);
        let cfg = ScheduleConfig::TwiceDaily {
            time_a: TimeOfDay { hour: 9, minute: 0 },
            time_b: TimeOfDay { hour: 19, minute: 0 },
            weekdays: WeekdayMask::ALL,
            quiet_hours: Some(QuietHours {
                start: TimeOfDay { hour: 6, minute: 0 },
                end: TimeOfDay { hour: 23, minute: 30 },
            }),
        };
        let next = next_fire_after(&cfg, after, never_fired).expect("some");
        assert_eq!(next, dt(2026, 1, 5, 23, 30));
    }

    // ----- DailyMinCount ---------------------------------------------------

    #[test]
    fn daily_min_count_uses_daily_slot_independent_of_count() {
        // The architect's plan: `next_fire_after` does NOT consult the count
        // provider for DailyMinCount — that gating happens at fire time.
        let after = dt(2026, 1, 5, 10, 0);
        let cfg = ScheduleConfig::DailyMinCount {
            time: TimeOfDay { hour: 19, minute: 0 },
            min_count: 5,
            weekdays: WeekdayMask::ALL,
        };
        // Even with a "huge" today_count, we still get back the next slot.
        let next = next_fire_after(&cfg, after, || 999).expect("some");
        assert_eq!(next, dt(2026, 1, 5, 19, 0));
    }

    // ----- is_in_quiet -----------------------------------------------------

    #[test]
    fn is_in_quiet_handles_simple_window() {
        let qh = QuietHours {
            start: TimeOfDay { hour: 22, minute: 0 },
            end: TimeOfDay { hour: 23, minute: 0 },
        };
        assert!(is_in_quiet(dt(2026, 1, 5, 22, 30), &qh));
        assert!(!is_in_quiet(dt(2026, 1, 5, 21, 30), &qh));
        // Half-open: end exclusive.
        assert!(!is_in_quiet(dt(2026, 1, 5, 23, 0), &qh));
    }

    #[test]
    fn is_in_quiet_handles_midnight_crossing() {
        let qh = QuietHours {
            start: TimeOfDay { hour: 22, minute: 0 },
            end: TimeOfDay { hour: 7, minute: 0 },
        };
        assert!(is_in_quiet(dt(2026, 1, 5, 22, 30), &qh));
        assert!(is_in_quiet(dt(2026, 1, 5, 3, 0), &qh));
        assert!(!is_in_quiet(dt(2026, 1, 5, 7, 0), &qh));
        assert!(!is_in_quiet(dt(2026, 1, 5, 12, 0), &qh));
    }

    #[test]
    fn is_in_quiet_returns_false_when_start_equals_end() {
        let qh = QuietHours {
            start: TimeOfDay { hour: 12, minute: 0 },
            end: TimeOfDay { hour: 12, minute: 0 },
        };
        // Empty window: never quiet.
        assert!(!is_in_quiet(dt(2026, 1, 5, 12, 0), &qh));
        assert!(!is_in_quiet(dt(2026, 1, 5, 0, 0), &qh));
    }

    // ----- Round-trip serialization (used to persist to settings.json) -----

    #[test]
    fn schedule_config_serde_round_trip() {
        let cfg = ScheduleConfig::EveryMinutes {
            minutes: 60,
            quiet_hours: Some(QuietHours {
                start: TimeOfDay { hour: 22, minute: 0 },
                end: TimeOfDay { hour: 7, minute: 0 },
            }),
        };
        let json = serde_json::to_string(&cfg).expect("serialize");
        let back: ScheduleConfig = serde_json::from_str(&json).expect("deserialize");
        assert_eq!(cfg, back);
    }

    #[test]
    fn schedule_config_default_is_disabled() {
        let cfg = ScheduleConfig::default();
        assert_eq!(cfg, ScheduleConfig::Disabled);
    }
}
