//! Mobile notification setup. Compiled only on Android/iOS targets.
//!
//! Channels are an Android concept (NotificationChannel / NotificationManager)
//! — iOS authorizes via the request_permission flow and does not need a
//! channel. The user-facing quiz prompt is delivered exclusively via the
//! OS-level alarm path queued by `scheduler::schedule_next_mobile`; no
//! foreground "show this notification now" helper is needed here.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[cfg(target_os = "android")]
pub const QUIZ_CHANNEL: &str = "kata_quiz_v1";

/// Stable ID range for the pending-notification batch on both Android and
/// iOS. Each scheduled fire gets `MOBILE_BASE_ID + slot_index` so
/// cancel/re-enqueue is idempotent without leaking IDs across re-arms.
const MOBILE_BASE_ID: i32 = 7100;

pub fn mobile_notification_id(slot: i32) -> i32 {
    MOBILE_BASE_ID + slot
}

#[cfg(target_os = "android")]
pub fn setup_channels(app: &AppHandle) {
    use tauri_plugin_notification::{Channel, Importance};

    let ch = Channel::builder(QUIZ_CHANNEL, "Quiz Reminders")
        .description("Periodic kata/gokyo quiz prompts".to_string())
        .importance(Importance::Default)
        .vibration(true)
        .lights(true)
        .build();

    if let Err(e) = app.notification().create_channel(ch) {
        log::error!("[notif] create channel failed: {e}");
    }
}

/// iOS: notification channels do not exist on iOS — UNUserNotificationCenter
/// handles authorization at request time. Stub kept so lib.rs can call it
/// uniformly under `#[cfg(mobile)]` without target_os branching.
#[cfg(target_os = "ios")]
pub fn setup_channels(_app: &AppHandle) {}

pub fn request_permission(app: &AppHandle) {
    if let Ok(state) = app.notification().permission_state() {
        if state != tauri::plugin::PermissionState::Granted {
            if let Err(e) = app.notification().request_permission() {
                log::error!("[notif] permission request failed: {e}");
            }
        }
    }
}
