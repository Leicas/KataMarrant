//! Mobile notifications. Compiled only on Android/iOS targets.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

pub const QUIZ_CHANNEL: &str = "kata_quiz_v1";
pub const QUIZ_NOTIFICATION_ID: i32 = 7001;

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

pub fn request_permission(app: &AppHandle) {
    if let Ok(state) = app.notification().permission_state() {
        if state != tauri::plugin::PermissionState::Granted {
            if let Err(e) = app.notification().request_permission() {
                log::error!("[notif] permission request failed: {e}");
            }
        }
    }
}

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
