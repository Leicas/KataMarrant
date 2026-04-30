//! Quiz scheduler: emits a "show_quiz_prompt" event every N minutes.
//!
//! Same dual-mechanism pattern as haply-time:
//! - **Desktop**: a tokio loop tick every 30s, emits the event when interval is reached
//! - **Mobile (Android)**: tauri-plugin-schedule-task (WorkManager) re-arms on each fire
//!   so notifications keep coming when the app is in the background.

use std::collections::HashMap;
use serde::Serialize;
use tauri::{AppHandle, Emitter, Manager};
use tokio::time::{self, Duration};

use crate::state::AppState;

#[derive(Default)]
pub struct SchedulerState {
    /// 0 = disabled.
    pub interval_minutes: u64,
    /// ID of the currently scheduled task on mobile.
    pub scheduled_task_id: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct QuizPromptPayload {
    pub source: String,
}

const TICK_SECS: u64 = 30;

pub async fn run_scheduler_loop(app: AppHandle) {
    let mut elapsed: u64 = 0;
    log::info!("[scheduler] loop started (tick={}s)", TICK_SECS);

    loop {
        time::sleep(Duration::from_secs(TICK_SECS)).await;

        let interval_minutes = {
            let state = app.state::<AppState>();
            let s = state.scheduler.lock().unwrap();
            s.interval_minutes
        };

        if interval_minutes == 0 {
            elapsed = 0;
            continue;
        }

        elapsed += TICK_SECS;
        let interval_secs = interval_minutes * 60;
        if elapsed < interval_secs {
            continue;
        }

        log::info!("[scheduler] {}m elapsed → emitting show_quiz_prompt", interval_minutes);
        let payload = QuizPromptPayload { source: "interval".into() };
        let _ = app.emit("show_quiz_prompt", &payload);

        #[cfg(mobile)]
        crate::notification::show_quiz_prompt_notification(&app);

        elapsed = 0;
    }
}

// ---------------------------------------------------------------------------
// Mobile scheduling via tauri-plugin-schedule-task (WorkManager)
// ---------------------------------------------------------------------------

pub struct ScheduledTaskRouter;

impl tauri_plugin_schedule_task::ScheduledTaskHandler<tauri::Wry> for ScheduledTaskRouter {
    fn handle_scheduled_task(
        &self,
        task_name: &str,
        _params: HashMap<String, String>,
        app: &AppHandle,
    ) -> tauri_plugin_schedule_task::Result<()> {
        log::info!("[scheduler] handle_scheduled_task: {task_name}");
        if task_name == "quiz_prompt" {
            let payload = QuizPromptPayload { source: "scheduled".into() };
            let _ = app.emit("show_quiz_prompt", &payload);
            #[cfg(mobile)]
            crate::notification::show_quiz_prompt_notification(app);

            // Re-arm next.
            let app_clone = app.clone();
            tauri::async_runtime::spawn(async move {
                schedule_next(&app_clone).await;
            });
        }
        Ok(())
    }
}

pub async fn schedule_next(app: &AppHandle) {
    use tauri_plugin_schedule_task::ScheduleTaskExt;

    let state = app.state::<AppState>();
    let (interval_minutes, old_task_id) = {
        let s = state.scheduler.lock().unwrap();
        (s.interval_minutes, s.scheduled_task_id.clone())
    };

    if let Some(tid) = old_task_id {
        let req = tauri_plugin_schedule_task::CancelTaskRequest { task_id: tid.clone() };
        if let Err(e) = app.schedule_task().cancel_task(req) {
            log::error!("[scheduler] cancel previous {tid} failed: {e}");
        }
    }

    if interval_minutes == 0 {
        let mut s = state.scheduler.lock().unwrap();
        s.scheduled_task_id = None;
        return;
    }

    let req = tauri_plugin_schedule_task::ScheduleTaskRequest {
        task_name: "quiz_prompt".to_string(),
        schedule_time: tauri_plugin_schedule_task::ScheduleTime::Duration(interval_minutes * 60),
        parameters: None,
    };

    match app.schedule_task().schedule_task(req).await {
        Ok(resp) if resp.success => {
            log::info!(
                "[scheduler] mobile: scheduled in {}m (id={})",
                interval_minutes, resp.task_id
            );
            let mut s = state.scheduler.lock().unwrap();
            s.scheduled_task_id = Some(resp.task_id);
        }
        Ok(resp) => {
            log::error!("[scheduler] mobile schedule failed: {}", resp.message.unwrap_or_default());
        }
        Err(e) => log::error!("[scheduler] mobile schedule error: {e}"),
    }
}
