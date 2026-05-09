//! Tauri commands exposing the notification permission + action surface
//! to the frontend. Live on every platform so the frontend doesn't have
//! to branch on target — desktop simply reports "default" and treats the
//! action handler as a no-op.

use chrono::{Duration as ChronoDuration, Local, TimeZone};
use tauri::{AppHandle, Emitter, Manager};

use crate::error::AppResult;
use crate::scheduler::QuizPromptPayload;
#[cfg(mobile)]
use crate::scheduler;
use crate::state::AppState;

/// Trigger the OS notification permission prompt and report whether the
/// user granted access. Frontend calls this AFTER showing its own
/// rationale UI; we deliberately removed the auto-prompt from app
/// startup because Android 13+ requires a user-initiated gesture for
/// the system dialog to appear at all, and prompting on cold-boot is
/// hostile to first-run UX.
#[tauri::command]
pub async fn request_notification_permission(_app: AppHandle) -> AppResult<bool> {
    #[cfg(mobile)]
    {
        Ok(crate::notification::request_permission_and_report(&_app))
    }
    #[cfg(not(mobile))]
    {
        // Desktop has no plugin-level permission gate — the OS notification
        // surface is always available (or always denied depending on user
        // OS settings), so we report `true` to keep the frontend happy.
        Ok(true)
    }
}

/// Inspect the current OS permission state. Returns one of
/// `"granted" | "denied" | "default"` matching the Web Notification API's
/// `Notification.permission` values; the plugin's two `Prompt` /
/// `PromptWithRationale` states both collapse to `"default"`.
#[tauri::command]
pub async fn get_notification_permission_state(_app: AppHandle) -> AppResult<String> {
    #[cfg(mobile)]
    {
        Ok(crate::notification::permission_state_label(&_app))
    }
    #[cfg(not(mobile))]
    {
        Ok("granted".into())
    }
}

/// Receives action-button taps forwarded from the frontend. The
/// frontend subscribes to `tauri-plugin-notification`'s `onAction` JS
/// API (Rust does not yet expose `on_action_received`) and invokes this
/// command with the action id. Two ids are wired today:
///
/// - `"snooze_1h"` — re-arms the OS notification batch with an override
///   anchor 1 hour ahead of `now`, so the very next slot lands an hour
///   from the snooze tap regardless of the schedule's normal cadence.
/// - `"skip_today"` — sets `last_fired_at` to "end of today" so the
///   desktop tick won't emit for the rest of the day, and re-enqueues
///   the mobile batch (which prunes any pending slots inside today's
///   remaining window).
///
/// Anything else (including the default `"answer"` foreground action,
/// which is just a tap-through to the app) is treated as a foreground
/// open: emit `show_quiz_prompt` with `source = "action"`.
#[tauri::command]
pub async fn notification_action_handler(
    app: AppHandle,
    action_id: String,
    technique_slug: Option<String>,
) -> AppResult<()> {
    log::info!(
        "[notif] action received: id={} slug={:?}",
        action_id,
        technique_slug
    );

    match action_id.as_str() {
        "snooze_1h" => {
            // Bump last_fired_at to (now - schedule_interval + 1h) so the
            // next-fire computation lands roughly one hour from now. We do
            // this by setting last_fired_at to (now + 1h) - small_epsilon,
            // which the scheduler treats as "the previous fire happened
            // right around T+1h" — and since `next_fire_after` always
            // returns a slot strictly after its anchor, the next mobile
            // re-enqueue uses now+1h as its anchor.
            //
            // Practically: we just kick the mobile re-enqueue with an
            // override time so the next pending notification sits 1h
            // ahead, regardless of cadence.
            #[cfg(mobile)]
            {
                let h = app.clone();
                tauri::async_runtime::spawn(async move {
                    scheduler::schedule_next_mobile_with_anchor(
                        &h,
                        Local::now() + ChronoDuration::hours(1),
                    )
                    .await;
                });
            }
            #[cfg(not(mobile))]
            {
                let state = app.state::<AppState>();
                let mut s = state.scheduler.lock().unwrap();
                // Park last_fired_at 1h in the future so the desktop tick
                // skips the next normal slot.
                s.last_fired_at = (Local::now() + ChronoDuration::hours(1)).timestamp();
            }
        }
        "skip_today" => {
            // Park last_fired_at at the very end of today so neither the
            // desktop tick nor the mobile re-enqueue fires again before
            // tomorrow's first slot.
            let now = Local::now();
            let end_of_day = now
                .date_naive()
                .and_hms_opt(23, 59, 59)
                .and_then(|naive| Local.from_local_datetime(&naive).single())
                .unwrap_or(now + ChronoDuration::hours(12));
            {
                let state = app.state::<AppState>();
                let mut s = state.scheduler.lock().unwrap();
                s.last_fired_at = end_of_day.timestamp();
            }
            #[cfg(mobile)]
            {
                // Re-arm the batch so any pending alarm landing inside
                // today's remaining window is dropped on the floor.
                let h = app.clone();
                tauri::async_runtime::spawn(async move {
                    scheduler::schedule_next_mobile(&h).await;
                });
            }
        }
        // "answer" or anything unrecognised: fall through to a foreground
        // open (the click already brought the app forward; we just emit
        // the in-app event so the quiz tab opens with the picked slug).
        _ => {
            let payload = QuizPromptPayload {
                source: "action".into(),
                technique_slug,
            };
            let _ = app.emit("show_quiz_prompt", &payload);
        }
    }

    Ok(())
}
