use crate::db::{self, OverallStats, TechniqueStat};
use crate::error::AppResult;
use crate::state::AppState;

#[tauri::command]
pub fn get_overall_stats(state: tauri::State<'_, AppState>) -> AppResult<OverallStats> {
    let conn = state.db.lock().unwrap();
    db::overall_stats(&conn)
}

#[tauri::command]
pub fn get_all_technique_stats(state: tauri::State<'_, AppState>) -> AppResult<Vec<TechniqueStat>> {
    let conn = state.db.lock().unwrap();
    db::get_all_stats(&conn)
}

#[tauri::command]
pub fn get_technique_stat(
    slug: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<Option<TechniqueStat>> {
    let conn = state.db.lock().unwrap();
    db::get_stat(&conn, &slug)
}
