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
//!   `setExactAndAllowWhileIdle` alarms delivered by a BroadcastReceiver, so
//!   the notification fires whether or not our app process is alive. When
//!   the app is foregrounded (`RunEvent::Resumed`) we cancel-then-re-enqueue
//!   so the queue tracks any config edits and the rolling horizon never
//!   drains.

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
    },
    TwiceDaily {
        time_a: TimeOfDay,
        time_b: TimeOfDay,
        weekdays: WeekdayMask,
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
            ScheduleConfig::Daily { time, weekdays } => {
                check_time(time)?;
                check_mask(weekdays)
            }
            ScheduleConfig::TwiceDaily { time_a, time_b, weekdays } => {
                check_time(time_a)?;
                check_time(time_b)?;
                check_mask(weekdays)
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
                if let Some(qh) = quiet_hours {
                    check_time(&qh.start)?;
                    check_time(&qh.end)?;
                }
                Ok(())
            }
        }
    }
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

#[derive(Debug, Clone, Serialize)]
pub struct QuizPromptPayload {
    pub source: String,
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
        ScheduleConfig::Daily { time, weekdays } => {
            next_daily_slot(after, *time, *weekdays)
        }
        ScheduleConfig::TwiceDaily { time_a, time_b, weekdays } => {
            let a = next_daily_slot(after, *time_a, *weekdays);
            let b = next_daily_slot(after, *time_b, *weekdays);
            match (a, b) {
                (Some(x), Some(y)) => Some(x.min(y)),
                (x, y) => x.or(y),
            }
        }
        ScheduleConfig::DailyMinCount { time, weekdays, .. } => {
            // The min-count check happens at fire time, not at scheduling
            // time — we always ask "when does the next slot land?" and let
            // the handler decide whether to actually emit.
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
        let payload = QuizPromptPayload { source: "interval".into() };
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
// path. On Android this lands as `setExactAndAllowWhileIdle` (or
// `setAndAllowWhileIdle` if exact-alarm permission isn't granted) and is
// delivered by `app.tauri.notification.TimedNotificationPublisher` — a
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

    let now = Local::now();
    let horizon = now + ChronoDuration::days(30);
    let mut anchor = now;
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

        let id = crate::notification::mobile_notification_id(count as i32);
        let builder = app
            .notification()
            .builder()
            .id(id)
            .title("KataMarrant")
            .body("Quiz time! Tap to identify a technique.")
            .extra("type", "quiz_prompt")
            .sound("default");

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
