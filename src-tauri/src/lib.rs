mod commands;
mod data;
mod db;
mod error;
#[cfg(mobile)]
mod notification;
mod scheduler;
mod state;

use std::sync::Mutex;

use serde_json::Value as JsonValue;
use tauri::Manager;
use tauri_plugin_store::{Store, StoreExt};

use scheduler::{ScheduleConfig, SchedulerState, TimeOfDay, WeekdayMask};
use state::AppState;

const STORE_FILE: &str = "settings.json";
const KEY_SCHEDULE: &str = "quiz_schedule";
const KEY_LEGACY_INTERVAL: &str = "quiz_interval_minutes";

// Custom-titlebar window controls. Registered as Rust commands and
// invoked from JS rather than relying on window.__TAURI__.window.* —
// the JS API path under withGlobalTauri shifted across Tauri 2.x minor
// versions and was flaky. Going through the IPC + extractor is bulletproof.
//
// On mobile (Android/iOS), tauri::Window doesn't expose minimize / maximize
// / unmaximize / close (the OS owns chrome). We compile no-op stubs there
// so generate_handler! still finds the symbols and the build succeeds.
#[cfg(desktop)]
#[tauri::command]
async fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}
#[cfg(not(desktop))]
#[tauri::command]
async fn window_minimize(_window: tauri::Window) -> Result<(), String> { Ok(()) }

#[cfg(desktop)]
#[tauri::command]
async fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    let max = window.is_maximized().map_err(|e| e.to_string())?;
    if max {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}
#[cfg(not(desktop))]
#[tauri::command]
async fn window_toggle_maximize(_window: tauri::Window) -> Result<(), String> { Ok(()) }

#[cfg(desktop)]
#[tauri::command]
async fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}
#[cfg(not(desktop))]
#[tauri::command]
async fn window_close(_window: tauri::Window) -> Result<(), String> { Ok(()) }

/// Default schedule for brand-new users: 7pm every day.
fn default_schedule() -> ScheduleConfig {
    ScheduleConfig::Daily {
        time: TimeOfDay { hour: 19, minute: 0 },
        weekdays: WeekdayMask::ALL,
        quiet_hours: None,
    }
}

/// Lift the old `quiz_interval_minutes` key (single u64) to the new
/// `quiz_schedule` shape, then delete the legacy key. Called when the new
/// key is absent. Returns the freshly-translated config.
fn migrate_legacy_interval<R: tauri::Runtime>(store: &Store<R>) -> ScheduleConfig {
    let legacy_minutes = store
        .get(KEY_LEGACY_INTERVAL)
        .and_then(|v| v.as_u64())
        .unwrap_or(u64::MAX); // sentinel for "no legacy key"

    let cfg = match legacy_minutes {
        u64::MAX => default_schedule(),
        0 => ScheduleConfig::Disabled,
        minutes => ScheduleConfig::EveryMinutes {
            minutes: minutes.min(u32::MAX as u64) as u32,
            quiet_hours: None,
        },
    };

    if legacy_minutes != u64::MAX {
        store.delete(KEY_LEGACY_INTERVAL);
        // Persist the freshly migrated config so we never re-run the
        // migration path on subsequent launches.
        store.set(KEY_SCHEDULE, serde_json::to_value(&cfg).unwrap_or(JsonValue::Null));
        if let Err(e) = store.save() {
            log::error!("[migration] save migrated schedule failed: {e}");
        }
        log::info!("[migration] legacy interval={} → {:?}", legacy_minutes, cfg);
    }

    cfg
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );

    // Auto-updater: desktop-only. The crate is target-gated in Cargo.toml so
    // tauri_plugin_updater isn't even nameable on Android/iOS. Mobile uses
    // Play Store / App Store / sideload for distribution. tauri-plugin-process
    // is paired here so the JS side can call relaunch() after install on
    // Linux AppImage (Windows/macOS bundlers self-relaunch).
    #[cfg(desktop)]
    let builder = builder
        .plugin(tauri_plugin_updater::Builder::new().build())
        .plugin(tauri_plugin_process::init());

    let app = builder
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let conn = db::initialize(&app_data_dir)?;

            let store = app.store(STORE_FILE)?;
            let config: ScheduleConfig = store
                .get(KEY_SCHEDULE)
                .and_then(|v| serde_json::from_value(v).ok())
                .unwrap_or_else(|| migrate_legacy_interval(&store));

            app.manage(AppState {
                db: Mutex::new(conn),
                scheduler: Mutex::new(SchedulerState {
                    config,
                    last_fired_at: 0,
                }),
                recent_shown: Mutex::new(std::collections::VecDeque::with_capacity(
                    state::RECENT_SHOWN_CAP,
                )),
            });

            // Mobile: notification channel (Android no-op on iOS).
            //
            // We deliberately do NOT call `request_permission` from here
            // anymore. Android 13+ requires a user-initiated gesture for
            // the permission dialog to appear at all, and prompting on
            // cold-boot is hostile to first-run UX. The frontend now
            // shows a rationale screen, then invokes the
            // `request_notification_permission` Tauri command at the
            // moment the user opts in.
            #[cfg(mobile)]
            {
                notification::setup_channels(app.handle());
            }

            // Desktop tokio loop (also runs on mobile as a foreground complement).
            {
                let h = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    scheduler::run_scheduler_loop(h).await;
                });
            }

            // Sync: optional cross-device sync (Track 4). Boot does an
            // opportunistic pull, then every 5 minutes we attempt a push if
            // there are pending changes. All of this is best-effort — a
            // missing server, broken DNS, etc. must never block the app.
            {
                let h = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    // Initial pull on boot if logged in.
                    commands::sync::run_periodic_sync(&h, true, false).await;
                    let mut tick = tokio::time::interval(std::time::Duration::from_secs(300));
                    // The first immediate tick is consumed so we don't push
                    // immediately after the boot pull.
                    tick.tick().await;
                    loop {
                        tick.tick().await;
                        commands::sync::run_periodic_sync(&h, false, true).await;
                    }
                });
            }

            // Mobile: pre-enqueue pending OS-level notifications via
            // tauri-plugin-notification. On Android this lands as
            // `setExactAndAllowWhileIdle` and is delivered by the plugin's
            // BroadcastReceiver — fires whether or not our app is running.
            // On iOS this populates UNUserNotificationCenter's pending queue.
            // We replaced the previous Android WorkManager path because that
            // plugin's worker tried to relaunch MainActivity to deliver the
            // event, which Android 10+ blocks (background activity launch
            // restriction), so the notification never fired.
            #[cfg(mobile)]
            {
                let h = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    scheduler::schedule_next_mobile(&h).await;
                });
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::quiz::list_techniques,
            commands::quiz::get_technique,
            commands::quiz::next_question,
            commands::quiz::answer_question,
            commands::stats::get_overall_stats,
            commands::stats::get_all_technique_stats,
            commands::stats::get_technique_stat,
            commands::stats::get_analytics,
            commands::stats::get_quiz_log_breakdown,
            commands::stats::dedup_quiz_log,
            commands::scheduler::set_quiz_schedule,
            commands::scheduler::get_quiz_schedule,
            commands::scheduler::trigger_quiz_now,
            commands::notification::request_notification_permission,
            commands::notification::get_notification_permission_state,
            commands::notification::notification_action_handler,
            commands::gamification::get_gamification_state,
            commands::gamification::set_daily_goal,
            commands::gamification::complete_rapid,
            commands::gamification::complete_drill_run,
            commands::gamification::list_achievements,
            commands::sync::auth_start,
            commands::sync::auth_poll,
            commands::sync::auth_verify_code,
            commands::sync::sync_set_pending_email,
            commands::sync::sync_status,
            commands::sync::sync_logout,
            commands::sync::sync_delete_account,
            commands::sync::sync_push,
            commands::sync::sync_pull,
            commands::sync::sync_force_resync,
            window_minimize,
            window_toggle_maximize,
            window_close,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // RunEvent loop — re-enqueue the OS-level notification batch whenever
    // the app comes to the foreground on either mobile platform.
    // `schedule_next_mobile` cancel_alls and re-enqueues from `now`, which
    // (a) lets a fresh schedule edit propagate without waiting for the
    // current pending alarm to fire, and (b) refreshes the rolling
    // 32-slot horizon so the queue never drains.
    app.run(|_app_handle, event| {
        #[cfg(mobile)]
        if let tauri::RunEvent::Resumed = event {
            let h = _app_handle.clone();
            tauri::async_runtime::spawn(async move {
                scheduler::schedule_next_mobile(&h).await;
            });
        }
        let _ = &event;
    });
}
