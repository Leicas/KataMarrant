use std::collections::VecDeque;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::scheduler::SchedulerState;

/// Cap on the no-repeat window used by `commands::quiz::next_question`.
/// Six is large enough to comfortably cover a "10-in-a-row" session
/// without exhausting the smallest realistic candidate pool (a single
/// gokyo group has 8 techniques, so a 6-deep cooldown still leaves
/// 2 freely-pickable slugs even under group_filter).
pub const RECENT_SHOWN_CAP: usize = 6;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub scheduler: Mutex<SchedulerState>,
    /// FIFO of slugs returned by the most recent `next_question` calls.
    /// Within-session only — not persisted across restarts. See
    /// `RECENT_SHOWN_CAP` for sizing rationale.
    pub recent_shown: Mutex<VecDeque<String>>,
}
