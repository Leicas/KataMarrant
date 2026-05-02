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

/// Default schedule for brand-new users: 7pm every day.
fn default_schedule() -> ScheduleConfig {
    ScheduleConfig::Daily {
        time: TimeOfDay { hour: 19, minute: 0 },
        weekdays: WeekdayMask::ALL,
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
    let builder = tauri::Builder::default();

    // schedule-task is Android-only — its desktop init panics with
    // "Cannot start a runtime from within a runtime", and the upstream
    // plugin ships no iOS implementation. iOS uses tauri-plugin-notification
    // for scheduling instead (see scheduler::schedule_next_ios).
    #[cfg(target_os = "android")]
    let builder = builder.plugin(tauri_plugin_schedule_task::init_with_handler(
        scheduler::ScheduledTaskRouter,
    ));

    let builder = builder
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );

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
                    scheduled_task_ids: Vec::new(),
                }),
            });

            // Mobile: notification channel (Android no-op on iOS) + permission.
            #[cfg(mobile)]
            {
                notification::setup_channels(app.handle());
                notification::request_permission(app.handle());
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

            // Android: arm the WorkManager-backed schedule.
            #[cfg(target_os = "android")]
            {
                let h = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    scheduler::schedule_next(&h).await;
                });
            }

            // iOS: pre-enqueue pending local notifications via
            // tauri-plugin-notification (no app-side handler required).
            #[cfg(target_os = "ios")]
            {
                let h = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    scheduler::schedule_next_ios(&h).await;
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
            commands::scheduler::set_quiz_schedule,
            commands::scheduler::get_quiz_schedule,
            commands::scheduler::trigger_quiz_now,
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
            commands::sync::sync_push,
            commands::sync::sync_pull,
            commands::sync::sync_force_resync,
        ])
        .build(tauri::generate_context!())
        .expect("error while building tauri application");

    // RunEvent loop — used for the iOS "re-enqueue on resume" path.
    // tauri-plugin-notification's iOS scheduler queues fire times as
    // pending OS-level notifications, but the app-side count check for
    // DailyMinCount can only run while the app is alive. Resuming gives us
    // a chance to refresh the queue against the latest config + DB state.
    app.run(|_app_handle, event| {
        #[cfg(target_os = "ios")]
        if let tauri::RunEvent::Resumed = event {
            let h = _app_handle.clone();
            tauri::async_runtime::spawn(async move {
                scheduler::schedule_next_ios(&h).await;
            });
        }
        let _ = &event;
    });
}
