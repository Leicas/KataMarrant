use tauri_plugin_store::StoreExt;

use crate::error::{AppError, AppResult};
use crate::scheduler;
use crate::state::AppState;

const STORE_FILE: &str = "settings.json";
const KEY_INTERVAL: &str = "quiz_interval_minutes";

const VALID_INTERVALS: &[u64] = &[0, 5, 15, 30, 60, 120, 240, 480];

#[tauri::command]
pub async fn set_quiz_interval(
    minutes: u64,
    app_handle: tauri::AppHandle,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    if !VALID_INTERVALS.contains(&minutes) {
        return Err(AppError::General(format!(
            "Invalid interval {minutes}. Allowed: {:?}",
            VALID_INTERVALS
        )));
    }

    {
        let mut s = state.scheduler.lock().unwrap();
        s.interval_minutes = minutes;
    }

    if let Ok(store) = app_handle.store(STORE_FILE) {
        store.set(KEY_INTERVAL, serde_json::json!(minutes));
        if let Err(e) = store.save() {
            log::error!("Save interval failed: {e}");
        }
    }

    log::info!("Quiz interval set to {minutes} min");

    #[cfg(mobile)]
    {
        let h = app_handle.clone();
        tauri::async_runtime::spawn(async move {
            scheduler::schedule_next(&h).await;
        });
    }
    #[cfg(desktop)]
    let _ = &app_handle;

    Ok(())
}

#[tauri::command]
pub fn get_quiz_interval(state: tauri::State<'_, AppState>) -> AppResult<u64> {
    Ok(state.scheduler.lock().unwrap().interval_minutes)
}

#[tauri::command]
pub async fn trigger_quiz_now(app_handle: tauri::AppHandle) -> AppResult<()> {
    use tauri::Emitter;
    let payload = scheduler::QuizPromptPayload { source: "manual".into() };
    app_handle.emit("show_quiz_prompt", &payload)?;
    Ok(())
}
