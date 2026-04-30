use std::sync::Mutex;

use rusqlite::Connection;

use crate::scheduler::SchedulerState;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub scheduler: Mutex<SchedulerState>,
}
