use std::collections::VecDeque;
use std::sync::Mutex;

use rusqlite::Connection;

use crate::scheduler::SchedulerState;

/// Cap on the no-repeat window used by `commands::quiz::next_question`.
/// Matches the user's "no repeats in a 10-in-a-row session" mental model.
/// When `group_filter` narrows the pool below 10 (a single gokyo group
/// has 8 techniques), every candidate ends up in the deque at once;
/// `compute_weights`'s escape hatch exempts the slug shown longest ago
/// so the picker keeps making forward progress in that case.
pub const RECENT_SHOWN_CAP: usize = 10;

pub struct AppState {
    pub db: Mutex<Connection>,
    pub scheduler: Mutex<SchedulerState>,
    /// FIFO of slugs returned by the most recent `next_question` calls.
    /// Within-session only — not persisted across restarts. See
    /// `RECENT_SHOWN_CAP` for sizing rationale.
    pub recent_shown: Mutex<VecDeque<String>>,
}
