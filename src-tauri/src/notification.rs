//! Mobile notifications. Compiled only on Android/iOS targets.
//!
//! Channels are an Android concept (NotificationChannel / NotificationManager)
//! — iOS authorizes via the request_permission flow and does not need a
//! channel. The iOS path of `show_quiz_prompt_notification` therefore omits
//! the `channel_id(...)` call.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

#[cfg(target_os = "android")]
pub const QUIZ_CHANNEL: &str = "kata_quiz_v1";

pub const QUIZ_NOTIFICATION_ID: i32 = 7001;

/// Stable ID range for the iOS pending-notification batch. Each scheduled
/// fire gets `IOS_BASE_ID + slot_index` so cancel/re-enqueue is idempotent
/// without leaking IDs.
#[cfg(target_os = "ios")]
const IOS_BASE_ID: i32 = 7100;

#[cfg(target_os = "ios")]
pub fn ios_notification_id(slot: i32) -> i32 {
    IOS_BASE_ID + slot
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

#[cfg(target_os = "android")]
pub fn show_quiz_prompt_notification(app: &AppHandle) {
    let res = app
        .notification()
        .builder()
        .id(QUIZ_NOTIFICATION_ID)
        .channel_id(QUIZ_CHANNEL)
        .title("KataMarrant — Quiz time!")
        .body("Tap to identify a technique.")
        .extra("type", "quiz_prompt")
        .auto_cancel()
        .show();

    if let Err(e) = res {
        log::error!("[notif] show quiz prompt failed: {e}");
    }
}

/// iOS path: no `channel_id(...)` — channels are Android-only. We set
/// `sound("default")` so the notification is audible (silent by default
/// otherwise on iOS).
#[cfg(target_os = "ios")]
pub fn show_quiz_prompt_notification(app: &AppHandle) {
    let res = app
        .notification()
        .builder()
        .id(QUIZ_NOTIFICATION_ID)
        .title("KataMarrant — Quiz time!")
        .body("Tap to identify a technique.")
        .extra("type", "quiz_prompt")
        .sound("default")
        .show();

    if let Err(e) = res {
        log::error!("[notif] show quiz prompt failed: {e}");
    }
}
