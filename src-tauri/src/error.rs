use serde::{Serialize, Serializer};
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("DB error: {0}")]
    Db(#[from] rusqlite::Error),
    #[error("IO error: {0}")]
    Io(#[from] std::io::Error),
    #[error("Tauri error: {0}")]
    Tauri(#[from] tauri::Error),
    #[error("Schedule error: {0}")]
    Schedule(String),
    #[error("Store error: {0}")]
    Store(#[from] tauri_plugin_store::Error),
    #[error("Notification error: {0}")]
    Notification(#[from] tauri_plugin_notification::Error),
    #[error("JSON error: {0}")]
    Json(#[from] serde_json::Error),
    #[error("Gamification error: {0}")]
    Gamification(String),
    #[error("{0}")]
    General(String),
}

impl Serialize for AppError {
    fn serialize<S: Serializer>(&self, s: S) -> Result<S::Ok, S::Error> {
        s.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
