use tauri_plugin_store::StoreExt;

use crate::error::{AppError, AppResult};
use crate::scheduler::{self, ScheduleConfig};
use crate::state::AppState;

const STORE_FILE: &str = "settings.json";
const KEY_SCHEDULE: &str = "quiz_schedule";

#[tauri::command]
pub async fn set_quiz_schedule(
    config: ScheduleConfig,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    config.validate().map_err(AppError::Schedule)?;

    {
        let mut s = state.scheduler.lock().unwrap();
        s.config = config.clone();
        // Reset last_fired_at so the new schedule's first slot can fire as
        // soon as it arrives (otherwise a recently-fired old config would
        // suppress the first new slot).
        s.last_fired_at = 0;
    }

    let store = app_handle.store(STORE_FILE)?;
    store.set(KEY_SCHEDULE, serde_json::to_value(&config)?);
    if let Err(e) = store.save() {
        log::error!("save schedule failed: {e}");
    }

    log::info!("Quiz schedule updated: {:?}", config);

    // Mobile: cancel + re-enqueue the OS-level pending notification batch
    // so the schedule edit propagates immediately. Desktop reads the new
    // config on its next tick of `run_scheduler_loop` — no explicit re-arm
    // needed.
    #[cfg(mobile)]
    {
        let h = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            scheduler::schedule_next_mobile(&h).await;
        });
    }
    #[cfg(not(mobile))]
    {
        let _ = &app_handle;
        let _ = &scheduler::run_scheduler_loop; // suppress unused-import lint on desktop
    }

    Ok(())
}

#[tauri::command]
pub fn get_quiz_schedule(state: tauri::State<'_, AppState>) -> AppResult<ScheduleConfig> {
    Ok(state.scheduler.lock().unwrap().config.clone())
}

#[tauri::command]
pub async fn trigger_quiz_now(app_handle: tauri::AppHandle) -> AppResult<()> {
    use tauri::Emitter;
    let payload = scheduler::QuizPromptPayload { source: "manual".into() };
    app_handle.emit("show_quiz_prompt", &payload)?;
    Ok(())
}
