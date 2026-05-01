mod commands;
mod data;
mod db;
mod error;
#[cfg(mobile)]
mod notification;
mod scheduler;
mod state;

use std::sync::Mutex;

use tauri::Manager;
use tauri_plugin_store::StoreExt;

use scheduler::SchedulerState;
use state::AppState;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    let builder = tauri::Builder::default()
        // schedule-task must be initialized first.
        .plugin(tauri_plugin_schedule_task::init_with_handler(
            scheduler::ScheduledTaskRouter,
        ))
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(
            tauri_plugin_log::Builder::default()
                .level(log::LevelFilter::Info)
                .build(),
        );

    builder
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir()?;
            let conn = db::initialize(&app_data_dir)?;

            let interval_minutes = app
                .store("settings.json")
                .ok()
                .and_then(|s| s.get("quiz_interval_minutes"))
                .and_then(|v| v.as_u64())
                .unwrap_or(0);

            app.manage(AppState {
                db: Mutex::new(conn),
                scheduler: Mutex::new(SchedulerState {
                    interval_minutes,
                    scheduled_task_id: None,
                }),
            });

            // Mobile: notification channel + permission.
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

            // Mobile: arm the WorkManager-backed schedule.
            #[cfg(mobile)]
            {
                let h = app.handle().clone();
                tauri::async_runtime::spawn(async move {
                    scheduler::schedule_next(&h).await;
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
            commands::scheduler::set_quiz_interval,
            commands::scheduler::get_quiz_interval,
            commands::scheduler::trigger_quiz_now,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
