//! Mobile notification setup. Compiled only on Android/iOS targets.
//!
//! Channels are an Android concept (NotificationChannel / NotificationManager)
//! — iOS authorizes via the request_permission flow and does not need a
//! channel. The user-facing quiz prompt is delivered exclusively via the
//! OS-level alarm path queued by `scheduler::schedule_next_mobile`; no
//! foreground "show this notification now" helper is needed here.

use tauri::AppHandle;
use tauri_plugin_notification::NotificationExt;

/// Bumped from `kata_quiz_v1` → `kata_quiz_v2` together with the importance
/// upgrade (Default → High) and the public visibility / vibration-pattern
/// changes. Android channels are immutable once created — every settings
/// change requires a new channel id and the user re-acknowledging it under
/// system settings, so the bump is the only way to surface the new
/// behaviour on devices that already saw v1.
#[cfg(target_os = "android")]
pub const QUIZ_CHANNEL: &str = "kata_quiz_v2";

/// Action-type id referenced from `schedule_next_mobile` via
/// `.action_type_id(...)`. The matching `ActionType` registration happens
/// from the frontend — see `setup_channels` for the rationale on why we
/// can't register from Rust with the current plugin API.
pub const QUIZ_ACTION_TYPE_ID: &str = "quiz_prompt";

/// Stable ID range for the pending-notification batch on both Android and
/// iOS. Each scheduled fire gets `MOBILE_BASE_ID + slot_index` so
/// cancel/re-enqueue is idempotent without leaking IDs across re-arms.
const MOBILE_BASE_ID: i32 = 7100;

pub fn mobile_notification_id(slot: i32) -> i32 {
    MOBILE_BASE_ID + slot
}

#[cfg(target_os = "android")]
pub fn setup_channels(app: &AppHandle) {
    use tauri_plugin_notification::{Channel, Importance, Visibility};

    // v2 channel: High importance (heads-up + sound + vibration on lock
    // screen), public visibility (full title + body shown on lock screen
    // — none of this is sensitive), lights and vibration on. The plugin's
    // current `Channel` builder does not expose `vibration_pattern` or
    // `show_badge`; both default to true on Android when `vibration(true)`
    // is set and the channel importance is High, so the user-visible
    // outcome matches the brief.
    let ch = Channel::builder(QUIZ_CHANNEL, "Quiz Reminders")
        .description("Periodic kata/gokyo quiz prompts".to_string())
        .importance(Importance::High)
        .visibility(Visibility::Public)
        .vibration(true)
        .lights(true)
        .build();

    if let Err(e) = app.notification().create_channel(ch) {
        log::error!("[notif] create channel failed: {e}");
    }

    // Best-effort cleanup of the previous channel id so the v1 entry stops
    // appearing under Settings → Notifications. Errors are expected on
    // fresh installs (no v1 was ever created) — log at info level only.
    if let Err(e) = app.notification().delete_channel("kata_quiz_v1") {
        log::info!("[notif] delete legacy v1 channel (expected on fresh installs): {e}");
    }

    // Action-type registration:
    //
    // tauri-plugin-notification 2.3.3 exposes `register_action_types(...)`
    // on the Rust side, but the `ActionType` struct's fields are private
    // and there is no public constructor or builder, making the Rust API
    // un-callable from downstream crates. The frontend `registerActionTypes`
    // JS API is the supported path — the frontend agent registers the
    // `quiz_prompt` group (Answer now / Snooze 1h / Skip today) on boot
    // and forwards `onAction` callbacks to our `notification_action_handler`
    // Tauri command. The constant below documents the agreed group id.
    log::debug!(
        "[notif] action_type_id '{}' must be registered by the frontend (registerActionTypes)",
        QUIZ_ACTION_TYPE_ID
    );
}

/// iOS: notification channels do not exist on iOS — UNUserNotificationCenter
/// handles authorization at request time. Stub kept so lib.rs can call it
/// uniformly under `#[cfg(mobile)]` without target_os branching.
#[cfg(target_os = "ios")]
pub fn setup_channels(_app: &AppHandle) {}

/// Map the plugin's `PermissionState` into the three-state string the
/// frontend contract specifies (`"granted" | "denied" | "default"`).
/// `Prompt` and `PromptWithRationale` both collapse to `"default"` because
/// the frontend's gating logic only cares about the granted/denied
/// distinction; the rationale-needed nuance is handled by showing the
/// rationale UI BEFORE calling `request_notification_permission`.
pub fn permission_state_label(app: &AppHandle) -> String {
    use tauri::plugin::PermissionState;
    match app.notification().permission_state() {
        Ok(PermissionState::Granted) => "granted".into(),
        Ok(PermissionState::Denied) => "denied".into(),
        Ok(PermissionState::Prompt) | Ok(PermissionState::PromptWithRationale) => "default".into(),
        Err(e) => {
            log::warn!("[notif] permission_state query failed: {e}");
            "default".into()
        }
    }
}

/// Trigger the OS permission prompt and return whether it was granted.
/// The frontend calls this AFTER showing its own rationale UI (we no
/// longer fire the prompt automatically on app startup — that path was
/// hostile to first-run UX, and Android 13+ requires a user-initiated
/// gesture for the system dialog to appear at all).
pub fn request_permission_and_report(app: &AppHandle) -> bool {
    use tauri::plugin::PermissionState;
    match app.notification().request_permission() {
        Ok(PermissionState::Granted) => true,
        Ok(_) => false,
        Err(e) => {
            log::error!("[notif] permission request failed: {e}");
            false
        }
    }
}
