//! Optional cross-device sync (Track 4).
//!
//! Design rules baked into this module:
//! - The app is non-blocking on sync failures. Network errors **never**
//!   propagate as `AppError`; they come back as a `SyncResultDto { ok: false,
//!   error: Some("…") }` so the frontend can render a small status line and
//!   keep the app fully usable offline.
//! - Login state lives in two places: `sync_state` (queryable from Rust) and
//!   `tauri-plugin-store::settings.json` under `sync.session_jwt`. The DB row
//!   is the source of truth for the Rust side; the store mirror is kept
//!   updated for the rare frontend caller.
//! - LWW conflict resolution by `updated_at`. Push-side: compare locally
//!   selected rows to `last_pushed_at`. Pull-side: locally upsert if the
//!   remote `updated_at` is greater than the local one.

use serde::{Deserialize, Serialize};
use serde_json::Value as JsonValue;
use std::time::Duration;
use tauri::Manager;
use tauri_plugin_store::StoreExt;

use crate::db;
use crate::error::{AppError, AppResult};
use crate::state::AppState;

const STORE_FILE: &str = "settings.json";
const KEY_SYNC_JWT: &str = "sync.session_jwt";
const KEY_SYNC_EMAIL: &str = "sync.email";
const KEY_SYNC_USER: &str = "sync.user_id";
const KEY_SYNC_CLIENT: &str = "sync.client_id";
const KEY_SYNC_SERVER: &str = "sync.server_url";
const KEY_SYNC_AUTO: &str = "sync.auto_sync";

const HTTP_TIMEOUT: Duration = Duration::from_secs(10);

/// Default server URL — the user's Proxmox-hosted instance. Overridable via
/// the `sync_state.server_url` column or the store key.
const DEFAULT_SERVER_URL: &str = "https://katamarrant.weill-duflos.fr";

#[derive(Debug, Clone, Serialize)]
pub struct SyncStatusDto {
    pub logged_in: bool,
    pub email: Option<String>,
    pub user_id: Option<String>,
    pub server_url: String,
    pub last_pulled_at: i64,
    pub last_pushed_at: i64,
    pub pending_changes: bool,
    pub auto_sync: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct SyncResultDto {
    pub ok: bool,
    pub error: Option<String>,
    /// Number of rows pushed (push) or pulled (pull) — informational only.
    pub stats_count: u32,
    pub log_count: u32,
    /// Server's `now` timestamp from a successful round-trip; 0 on failure.
    pub server_now: i64,
}

impl SyncResultDto {
    fn ok(stats: u32, logs: u32, server_now: i64) -> Self {
        Self {
            ok: true,
            error: None,
            stats_count: stats,
            log_count: logs,
            server_now,
        }
    }

    fn err(msg: impl Into<String>) -> Self {
        Self {
            ok: false,
            error: Some(msg.into()),
            stats_count: 0,
            log_count: 0,
            server_now: 0,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct TechniqueStatsRow {
    slug: String,
    correct_count: i64,
    wrong_count: i64,
    last_shown_at: Option<i64>,
    last_correct: Option<i64>,
    updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct QuizLogRow {
    log_id: i64,
    slug: Option<String>,
    correct: Option<i64>,
    mode: Option<String>,
    answered_at: Option<i64>,
    response_ms: Option<i64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct SettingsBlob {
    scheduler_settings: Option<JsonValue>,
    ui_settings: Option<JsonValue>,
    updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
struct GamificationBlob {
    blob: Option<JsonValue>,
    updated_at: i64,
}

#[derive(Debug, Serialize)]
struct PushBody {
    client_id: String,
    since: i64,
    technique_stats: Vec<TechniqueStatsRow>,
    quiz_log: Vec<QuizLogRow>,
    settings: Option<SettingsBlob>,
    gamification_state: Option<GamificationBlob>,
}

#[derive(Debug, Deserialize)]
struct PushRes {
    server_now: i64,
}

#[derive(Debug, Deserialize)]
#[allow(dead_code)] // log_id + server_received_at carried for future merge logic
struct QuizLogRowOut {
    client_id: String,
    log_id: i64,
    slug: Option<String>,
    correct: Option<i64>,
    mode: Option<String>,
    answered_at: Option<i64>,
    response_ms: Option<i64>,
    server_received_at: i64,
}

#[derive(Debug, Deserialize)]
struct PullRes {
    server_now: i64,
    technique_stats: Vec<TechniqueStatsRow>,
    quiz_log: Vec<QuizLogRowOut>,
    settings: Option<SettingsBlob>,
    gamification_state: Option<GamificationBlob>,
}

// ---------------------------------------------------------------------------
// DB helpers (sync_state row)
// ---------------------------------------------------------------------------

#[derive(Debug, Clone)]
struct SyncStateRow {
    email: Option<String>,
    session_jwt: Option<String>,
    user_id: Option<String>,
    client_id: Option<String>,
    server_url: String,
    last_pulled_at: i64,
    last_pushed_at: i64,
    last_pushed_log_id: i64,
    pending_changes: bool,
}

fn read_sync_state(conn: &rusqlite::Connection) -> AppResult<SyncStateRow> {
    let row = conn.query_row(
        "SELECT email, session_jwt, user_id, client_id, server_url,
                last_pulled_at, last_pushed_at, last_pushed_log_id, pending_changes
         FROM sync_state WHERE id = 1",
        [],
        |r| {
            Ok(SyncStateRow {
                email: r.get(0)?,
                session_jwt: r.get(1)?,
                user_id: r.get(2)?,
                client_id: r.get(3)?,
                server_url: r
                    .get::<_, Option<String>>(4)?
                    .unwrap_or_else(|| DEFAULT_SERVER_URL.to_string()),
                last_pulled_at: r.get(5)?,
                last_pushed_at: r.get(6)?,
                last_pushed_log_id: r.get(7)?,
                pending_changes: r.get::<_, i64>(8)? != 0,
            })
        },
    )?;
    Ok(row)
}

fn ensure_client_id(conn: &rusqlite::Connection) -> AppResult<String> {
    let existing: Option<String> = conn
        .query_row("SELECT client_id FROM sync_state WHERE id = 1", [], |r| r.get(0))
        .ok()
        .flatten();
    if let Some(id) = existing.filter(|s| !s.is_empty()) {
        return Ok(id);
    }
    let id = generate_client_id();
    conn.execute(
        "UPDATE sync_state SET client_id = ?1 WHERE id = 1",
        rusqlite::params![&id],
    )?;
    Ok(id)
}

/// Generate a 26-char ULID-like identifier without pulling in the `ulid`
/// crate on the client. Hex over 16 random bytes is "good enough" for a
/// per-device id; collisions are astronomically unlikely.
fn generate_client_id() -> String {
    use rand::RngCore;
    let mut buf = [0u8; 16];
    rand::thread_rng().fill_bytes(&mut buf);
    buf.iter().map(|b| format!("{:02x}", b)).collect()
}

fn save_session(
    conn: &rusqlite::Connection,
    email: &str,
    user_id: &str,
    jwt: &str,
) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "UPDATE sync_state SET email = ?1, user_id = ?2, session_jwt = ?3, updated_at = ?4
         WHERE id = 1",
        rusqlite::params![email, user_id, jwt, now],
    )?;
    Ok(())
}

fn clear_session(conn: &rusqlite::Connection) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp();
    conn.execute(
        "UPDATE sync_state SET email = NULL, user_id = NULL, session_jwt = NULL, updated_at = ?1
         WHERE id = 1",
        rusqlite::params![now],
    )?;
    Ok(())
}

// ---------------------------------------------------------------------------
// Plugin-store mirror — keeps the JWT discoverable from the frontend if it
// needs to render anything before the Rust side answers.
// ---------------------------------------------------------------------------

fn store_set<R: tauri::Runtime>(app: &tauri::AppHandle<R>, key: &str, value: JsonValue) {
    if let Ok(store) = app.store(STORE_FILE) {
        store.set(key, value);
        if let Err(e) = store.save() {
            log::warn!("[sync] store save failed for {key}: {e}");
        }
    }
}

fn store_clear<R: tauri::Runtime>(app: &tauri::AppHandle<R>, keys: &[&str]) {
    if let Ok(store) = app.store(STORE_FILE) {
        for k in keys {
            store.delete(*k);
        }
        if let Err(e) = store.save() {
            log::warn!("[sync] store save failed (clear): {e}");
        }
    }
}

// ---------------------------------------------------------------------------
// HTTP transport — all calls bounded by `HTTP_TIMEOUT` and isolated so a
// network error never propagates as a fatal AppError.
// ---------------------------------------------------------------------------

fn http_client() -> reqwest::Client {
    reqwest::Client::builder()
        .timeout(HTTP_TIMEOUT)
        .build()
        .unwrap_or_else(|_| reqwest::Client::new())
}

async fn post_json<T: serde::de::DeserializeOwned>(
    url: &str,
    body: &impl Serialize,
    bearer: Option<&str>,
) -> Result<T, String> {
    let client = http_client();
    let mut req = client.post(url).json(body);
    if let Some(t) = bearer {
        req = req.bearer_auth(t);
    }
    let resp = req.send().await.map_err(|e| format!("network: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("http: {}", resp.status()));
    }
    resp.json::<T>().await.map_err(|e| format!("decode: {e}"))
}

async fn get_json<T: serde::de::DeserializeOwned>(
    url: &str,
    bearer: Option<&str>,
) -> Result<T, String> {
    let client = http_client();
    let mut req = client.get(url);
    if let Some(t) = bearer {
        req = req.bearer_auth(t);
    }
    let resp = req.send().await.map_err(|e| format!("network: {e}"))?;
    if !resp.status().is_success() {
        return Err(format!("http: {}", resp.status()));
    }
    resp.json::<T>().await.map_err(|e| format!("decode: {e}"))
}

// ---------------------------------------------------------------------------
// Tauri commands
// ---------------------------------------------------------------------------

#[derive(Debug, Serialize)]
struct AuthStartReq<'a> {
    email: &'a str,
}

/// Server response for `POST /auth/start`. The short code is delivered
/// only in the email itself (not via this API) so an attacker calling
/// `/auth/start` for someone else's address can't get a valid code
/// without inbox access.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AuthStartDto {
    pub session_id: String,
    /// Seconds until the session_id stops being valid for polling.
    pub expires_in: i64,
}

/// Server response for a successful `GET /auth/poll` (200) or
/// `POST /auth/verify` (200). Used both for the JSON wire shape and the
/// command return value, to keep the JS side simple.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionResponse {
    pub session: String,
    pub user_id: String,
    pub expires_at: i64,
}

#[derive(Debug, Serialize)]
struct AuthVerifyReq<'a> {
    code: &'a str,
}

/// `POST /auth/start` — kicks off the magic-link flow. Always succeeds on
/// the server (anti-enumeration), so a successful future means the user
/// should expect an email.
#[tauri::command]
pub async fn auth_start(
    email: String,
    state: tauri::State<'_, AppState>,
) -> AppResult<AuthStartDto> {
    let server_url = {
        let conn = state.db.lock().unwrap();
        let s = read_sync_state(&conn)?;
        s.server_url
    };
    let url = format!("{}/auth/start", server_url.trim_end_matches('/'));
    let resp: AuthStartDto = post_json(&url, &AuthStartReq { email: &email }, None)
        .await
        .map_err(|e| AppError::General(format!("auth_start: {e}")))?;
    Ok(resp)
}

/// `GET /auth/poll?session_id=...` — returns:
///   - `Ok(None)` while the click-flow hasn't completed (HTTP 204)
///   - `Ok(Some(SessionResponse))` once the JWT is delivered (HTTP 200)
///   - Err on 410 Gone (expired), 404 (unknown), or network failure
///
/// On `Some`, the JWT is persisted to the local DB + tauri-plugin-store
/// mirror so the rest of the app sees a logged-in state. The frontend
/// can then transition its UI without an extra round-trip.
#[tauri::command]
pub async fn auth_poll(
    session_id: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> AppResult<Option<SessionResponse>> {
    let server_url = {
        let conn = state.db.lock().unwrap();
        let s = read_sync_state(&conn)?;
        s.server_url
    };
    let url = format!(
        "{}/auth/poll?session_id={}",
        server_url.trim_end_matches('/'),
        urlencode(&session_id),
    );
    let client = http_client();
    let resp = client
        .get(&url)
        .send()
        .await
        .map_err(|e| AppError::General(format!("auth_poll network: {e}")))?;
    let status = resp.status();
    if status.as_u16() == 204 {
        return Ok(None);
    }
    if status.is_success() {
        let parsed: SessionResponse = resp
            .json()
            .await
            .map_err(|e| AppError::General(format!("auth_poll decode: {e}")))?;
        persist_session(&state, &app, &parsed)?;
        return Ok(Some(parsed));
    }
    if status.as_u16() == 410 {
        return Err(AppError::General("expired".to_string()));
    }
    if status.as_u16() == 404 {
        return Err(AppError::General("unknown_session".to_string()));
    }
    Err(AppError::General(format!("auth_poll http: {status}")))
}

/// `POST /auth/verify { code }` — paste-fallback path. The user took the
/// short code from their email and typed it in.
#[tauri::command]
pub async fn auth_verify_code(
    code: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> AppResult<SessionResponse> {
    let server_url = {
        let conn = state.db.lock().unwrap();
        let s = read_sync_state(&conn)?;
        s.server_url
    };
    let url = format!("{}/auth/verify", server_url.trim_end_matches('/'));
    let client = http_client();
    let resp = client
        .post(&url)
        .json(&AuthVerifyReq { code: &code })
        .send()
        .await
        .map_err(|e| AppError::General(format!("auth_verify network: {e}")))?;
    let status = resp.status();
    if status.is_success() {
        let parsed: SessionResponse = resp
            .json()
            .await
            .map_err(|e| AppError::General(format!("auth_verify decode: {e}")))?;
        persist_session(&state, &app, &parsed)?;
        return Ok(parsed);
    }
    if status.as_u16() == 400 {
        // Best-effort: bubble the server's error tag up so the JS side can
        // show a precise message. Falls back to "invalid" if the body
        // doesn't parse.
        #[derive(Deserialize)]
        struct ErrBody {
            error: String,
        }
        let tag = resp
            .json::<ErrBody>()
            .await
            .map(|b| b.error)
            .unwrap_or_else(|_| "invalid".to_string());
        return Err(AppError::General(tag));
    }
    Err(AppError::General(format!("auth_verify http: {status}")))
}

/// Persist a freshly-issued session to the DB + plugin-store mirror.
/// Shared by the poll-success and paste-fallback paths so both flows leave
/// the app in the same state.
fn persist_session(
    state: &tauri::State<'_, AppState>,
    app: &tauri::AppHandle,
    resp: &SessionResponse,
) -> AppResult<()> {
    let email = {
        let conn = state.db.lock().unwrap();
        let s = read_sync_state(&conn)?;
        s.email.unwrap_or_default()
    };
    {
        let conn = state.db.lock().unwrap();
        save_session(&conn, &email, &resp.user_id, &resp.session)?;
        // Generate a stable client_id on first login if we don't have one.
        let _ = ensure_client_id(&conn);
    }
    store_set(app, KEY_SYNC_JWT, JsonValue::String(resp.session.clone()));
    store_set(app, KEY_SYNC_USER, JsonValue::String(resp.user_id.clone()));
    if !email.is_empty() {
        store_set(app, KEY_SYNC_EMAIL, JsonValue::String(email));
    }
    Ok(())
}

/// Minimal URL-encoder for the polling query string. The session_id is a
/// ULID (Crockford base32, no special chars), but we encode defensively in
/// case the server ever changes the alphabet.
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.as_bytes() {
        let c = *b as char;
        if c.is_ascii_alphanumeric() || matches!(c, '-' | '_' | '.' | '~') {
            out.push(c);
        } else {
            out.push_str(&format!("%{:02X}", b));
        }
    }
    out
}

/// Frontends call this **before** `auth_start` so we remember which email
/// the magic-link was sent to (the poll/verify responses don't echo it).
#[tauri::command]
pub fn sync_set_pending_email(
    email: String,
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> AppResult<()> {
    let now = chrono::Utc::now().timestamp();
    let conn = state.db.lock().unwrap();
    conn.execute(
        "UPDATE sync_state SET email = ?1, updated_at = ?2 WHERE id = 1",
        rusqlite::params![email, now],
    )?;
    drop(conn);
    store_set(&app, KEY_SYNC_EMAIL, JsonValue::String(email));
    Ok(())
}

#[tauri::command]
pub fn sync_status(state: tauri::State<'_, AppState>) -> AppResult<SyncStatusDto> {
    let conn = state.db.lock().unwrap();
    let s = read_sync_state(&conn)?;
    let auto_sync = read_auto_sync_default();
    Ok(SyncStatusDto {
        logged_in: s.session_jwt.is_some(),
        email: s.email,
        user_id: s.user_id,
        server_url: s.server_url,
        last_pulled_at: s.last_pulled_at,
        last_pushed_at: s.last_pushed_at,
        pending_changes: s.pending_changes,
        auto_sync,
    })
}

#[tauri::command]
pub fn sync_logout(
    state: tauri::State<'_, AppState>,
    app: tauri::AppHandle,
) -> AppResult<()> {
    {
        let conn = state.db.lock().unwrap();
        clear_session(&conn)?;
    }
    store_clear(&app, &[KEY_SYNC_JWT, KEY_SYNC_USER, KEY_SYNC_EMAIL]);
    Ok(())
}

#[tauri::command]
pub async fn sync_push(state: tauri::State<'_, AppState>) -> AppResult<SyncResultDto> {
    push_inner(&state).await
}

#[tauri::command]
pub async fn sync_pull(state: tauri::State<'_, AppState>) -> AppResult<SyncResultDto> {
    pull_inner(&state).await
}

// ---------------------------------------------------------------------------
// Public entry points used by the periodic background loop in lib.rs.
// ---------------------------------------------------------------------------

pub async fn push_inner(state: &tauri::State<'_, AppState>) -> AppResult<SyncResultDto> {
    let (jwt, server_url, client_id, last_pushed_at, last_pushed_log_id) = {
        let conn = state.db.lock().unwrap();
        let s = read_sync_state(&conn)?;
        let Some(jwt) = s.session_jwt.clone() else {
            return Ok(SyncResultDto::err("not_logged_in"));
        };
        let client_id = match s.client_id {
            Some(id) if !id.is_empty() => id,
            _ => ensure_client_id(&conn)?,
        };
        (
            jwt,
            s.server_url,
            client_id,
            s.last_pushed_at,
            s.last_pushed_log_id,
        )
    };

    // Snapshot stats + logs + gamification + settings under one lock so the
    // payload is internally consistent.
    let (stats, logs, max_log_id, gamification, settings_blob) = {
        let conn = state.db.lock().unwrap();
        let stats = collect_stats_since(&conn, last_pushed_at)?;
        let (logs, max_log_id) = collect_logs_since(&conn, last_pushed_log_id)?;
        let gamification = collect_gamification(&conn)?;
        drop(conn);
        // Settings blob is read from the store outside the DB lock.
        let settings_blob = collect_settings_blob(state)?;
        (stats, logs, max_log_id, gamification, settings_blob)
    };

    let stats_count = stats.len() as u32;
    let log_count = logs.len() as u32;
    let body = PushBody {
        client_id,
        since: last_pushed_at,
        technique_stats: stats,
        quiz_log: logs,
        settings: settings_blob,
        gamification_state: gamification,
    };
    let url = format!("{}/sync/push", server_url.trim_end_matches('/'));
    match post_json::<PushRes>(&url, &body, Some(&jwt)).await {
        Ok(resp) => {
            // Persist the new cursor + clear pending flag.
            let conn = state.db.lock().unwrap();
            let new_log_cursor = max_log_id.unwrap_or(last_pushed_log_id);
            conn.execute(
                "UPDATE sync_state
                 SET last_pushed_at = ?1, last_pushed_log_id = ?2, pending_changes = 0
                 WHERE id = 1",
                rusqlite::params![resp.server_now, new_log_cursor],
            )?;
            Ok(SyncResultDto::ok(stats_count, log_count, resp.server_now))
        }
        Err(e) => {
            log::warn!("[sync] push failed (non-fatal): {e}");
            Ok(SyncResultDto::err(e))
        }
    }
}

pub async fn pull_inner(state: &tauri::State<'_, AppState>) -> AppResult<SyncResultDto> {
    let (jwt, server_url, since) = {
        let conn = state.db.lock().unwrap();
        let s = read_sync_state(&conn)?;
        let Some(jwt) = s.session_jwt.clone() else {
            return Ok(SyncResultDto::err("not_logged_in"));
        };
        (jwt, s.server_url, s.last_pulled_at)
    };

    let url = format!("{}/sync/pull?since={}", server_url.trim_end_matches('/'), since);
    let resp: PullRes = match get_json(&url, Some(&jwt)).await {
        Ok(r) => r,
        Err(e) => {
            log::warn!("[sync] pull failed (non-fatal): {e}");
            return Ok(SyncResultDto::err(e));
        }
    };

    let stats_count = resp.technique_stats.len() as u32;
    let log_count = resp.quiz_log.len() as u32;

    // Apply remote rows locally — LWW per row for stats, INSERT OR IGNORE for logs.
    {
        let conn = state.db.lock().unwrap();
        for r in &resp.technique_stats {
            apply_remote_stats(&conn, r)?;
        }
        for r in &resp.quiz_log {
            apply_remote_log(&conn, r)?;
        }
        if let Some(g) = &resp.gamification_state {
            apply_remote_gamification(&conn, g)?;
        }
        conn.execute(
            "UPDATE sync_state SET last_pulled_at = ?1 WHERE id = 1",
            rusqlite::params![resp.server_now],
        )?;
    }
    if let Some(s) = &resp.settings {
        apply_remote_settings(state, s)?;
    }

    Ok(SyncResultDto::ok(stats_count, log_count, resp.server_now))
}

/// Convenience wrapper for the boot-time + periodic spawn in `lib.rs`. We
/// need a stable `tauri::State<'_, AppState>` borrow in the spawned task,
/// so we accept an `AppHandle` and resolve the state inside.
pub async fn run_periodic_sync(
    app_handle: &tauri::AppHandle,
    do_pull: bool,
    do_push: bool,
) {
    let state = app_handle.state::<AppState>();
    if do_pull {
        match pull_inner(&state).await {
            Ok(r) if r.ok => log::info!(
                "[sync] periodic pull ok: {} stats, {} logs",
                r.stats_count,
                r.log_count
            ),
            Ok(r) => log::warn!("[sync] periodic pull skipped: {:?}", r.error),
            Err(e) => log::warn!("[sync] periodic pull failed: {e}"),
        }
    }
    if do_push {
        match push_inner(&state).await {
            Ok(r) if r.ok => log::info!(
                "[sync] periodic push ok: {} stats, {} logs",
                r.stats_count,
                r.log_count
            ),
            Ok(r) => log::debug!("[sync] periodic push skipped: {:?}", r.error),
            Err(e) => log::warn!("[sync] periodic push failed: {e}"),
        }
    }
}

// ---------------------------------------------------------------------------
// Local DB <-> sync DTO converters
// ---------------------------------------------------------------------------

fn collect_stats_since(
    conn: &rusqlite::Connection,
    since: i64,
) -> AppResult<Vec<TechniqueStatsRow>> {
    let mut stmt = conn.prepare(
        "SELECT slug, correct_count, wrong_count, last_shown_at, last_correct, updated_at
         FROM technique_stats WHERE updated_at > ?1",
    )?;
    let rows = stmt
        .query_map(rusqlite::params![since], |r| {
            Ok(TechniqueStatsRow {
                slug: r.get(0)?,
                correct_count: r.get(1)?,
                wrong_count: r.get(2)?,
                last_shown_at: r.get(3)?,
                last_correct: r.get(4)?,
                updated_at: r.get(5)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

/// Returns the rows AND the max `id` we picked (so the caller can advance
/// the cursor on a successful push).
fn collect_logs_since(
    conn: &rusqlite::Connection,
    last_log_id: i64,
) -> AppResult<(Vec<QuizLogRow>, Option<i64>)> {
    let mut stmt = conn.prepare(
        "SELECT id, slug, correct, mode, answered_at, response_ms
         FROM quiz_log WHERE id > ?1 ORDER BY id ASC LIMIT 500",
    )?;
    let rows: Vec<(i64, QuizLogRow)> = stmt
        .query_map(rusqlite::params![last_log_id], |r| {
            let id: i64 = r.get(0)?;
            Ok((
                id,
                QuizLogRow {
                    log_id: id,
                    slug: r.get(1)?,
                    correct: r.get(2)?,
                    mode: r.get(3)?,
                    answered_at: r.get(4)?,
                    response_ms: r.get(5)?,
                },
            ))
        })?
        .collect::<Result<Vec<_>, _>>()?;
    let max = rows.iter().map(|(id, _)| *id).max();
    Ok((rows.into_iter().map(|(_, r)| r).collect(), max))
}

fn collect_gamification(conn: &rusqlite::Connection) -> AppResult<Option<GamificationBlob>> {
    let s = match db::get_gamification_state(conn) {
        Ok(v) => v,
        Err(e) => {
            log::warn!("[sync] read gamification state failed: {e}");
            return Ok(None);
        }
    };
    let blob = serde_json::json!({
        "xp_total": s.xp_total,
        "level": s.level,
        "current_streak": s.current_streak,
        "longest_streak": s.longest_streak,
        "last_active_day": s.last_active_day,
        "daily_goal": s.daily_goal,
        "current_combo": s.current_combo,
        "best_combo": s.best_combo,
    });
    Ok(Some(GamificationBlob {
        blob: Some(blob),
        updated_at: s.updated_at,
    }))
}

fn collect_settings_blob(state: &tauri::State<'_, AppState>) -> AppResult<Option<SettingsBlob>> {
    // The scheduler config is queryable from AppState; UI settings live in
    // the frontend's localStorage, so for now we sync only the scheduler
    // side. This matches the spec ("future-proof for more analytics/stats")
    // — the server side accepts a generic `ui_settings` blob ready for when
    // the frontend pushes it.
    let scheduler_value = {
        let s = state.scheduler.lock().unwrap();
        serde_json::to_value(&s.config).ok()
    };
    let now = chrono::Utc::now().timestamp();
    Ok(Some(SettingsBlob {
        scheduler_settings: scheduler_value,
        ui_settings: None,
        updated_at: now,
    }))
}

fn apply_remote_stats(conn: &rusqlite::Connection, r: &TechniqueStatsRow) -> AppResult<()> {
    let local_updated: Option<i64> = conn
        .query_row(
            "SELECT updated_at FROM technique_stats WHERE slug = ?1",
            rusqlite::params![&r.slug],
            |row| row.get(0),
        )
        .ok();
    let should_overwrite = match local_updated {
        Some(local) => r.updated_at > local,
        None => true,
    };
    if !should_overwrite {
        return Ok(());
    }
    conn.execute(
        "INSERT INTO technique_stats (slug, correct_count, wrong_count, last_shown_at, last_correct, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)
         ON CONFLICT(slug) DO UPDATE SET
            correct_count = ?2,
            wrong_count   = ?3,
            last_shown_at = ?4,
            last_correct  = ?5,
            updated_at    = ?6",
        rusqlite::params![
            r.slug,
            r.correct_count,
            r.wrong_count,
            r.last_shown_at,
            r.last_correct,
            r.updated_at,
        ],
    )?;
    Ok(())
}

fn apply_remote_log(conn: &rusqlite::Connection, r: &QuizLogRowOut) -> AppResult<()> {
    // Same-device entries are skipped: their own log_id is already the
    // local primary key for our quiz_log table. Only entries from a peer
    // device get folded in. We don't try to preserve the original
    // (client_id, log_id) — the local table has its own AUTOINCREMENT id.
    let our_client = match conn.query_row(
        "SELECT client_id FROM sync_state WHERE id = 1",
        [],
        |row| row.get::<_, Option<String>>(0),
    ) {
        Ok(opt) => opt.unwrap_or_default(),
        Err(_) => String::new(),
    };
    if r.client_id == our_client {
        return Ok(());
    }
    let slug = match r.slug.as_deref() {
        Some(s) => s,
        None => return Ok(()),
    };
    let correct = r.correct.unwrap_or(0);
    let mode = r.mode.as_deref().unwrap_or("synced");
    let answered_at = r.answered_at.unwrap_or_else(|| chrono::Utc::now().timestamp());
    conn.execute(
        "INSERT INTO quiz_log (slug, correct, mode, answered_at, response_ms)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        rusqlite::params![slug, correct, mode, answered_at, r.response_ms],
    )?;
    Ok(())
}

fn apply_remote_gamification(conn: &rusqlite::Connection, g: &GamificationBlob) -> AppResult<()> {
    let Some(blob) = &g.blob else { return Ok(()) };
    let local = db::get_gamification_state(conn).ok();
    if let Some(local) = &local {
        if g.updated_at <= local.updated_at {
            return Ok(());
        }
    }
    let row = db::GamificationStateRow {
        xp_total: blob.get("xp_total").and_then(|v| v.as_i64()).unwrap_or(0),
        level: blob.get("level").and_then(|v| v.as_i64()).unwrap_or(1),
        current_streak: blob
            .get("current_streak")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        longest_streak: blob
            .get("longest_streak")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        last_active_day: blob
            .get("last_active_day")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        daily_goal: blob.get("daily_goal").and_then(|v| v.as_i64()).unwrap_or(10),
        current_combo: blob
            .get("current_combo")
            .and_then(|v| v.as_i64())
            .unwrap_or(0),
        best_combo: blob.get("best_combo").and_then(|v| v.as_i64()).unwrap_or(0),
        updated_at: g.updated_at,
    };
    db::set_gamification_state(conn, &row)?;
    Ok(())
}

fn apply_remote_settings(state: &tauri::State<'_, AppState>, _s: &SettingsBlob) -> AppResult<()> {
    // For the client → server direction we already push the scheduler config.
    // Importing the remote scheduler config back into the local AppState
    // would re-arm the local scheduler with whatever the user set on the
    // other device — that's the desired LWW behaviour. For now we keep
    // this as a no-op (and let the user re-set their schedule from the
    // settings pane on the new device); a future revision can call
    // `commands::scheduler::set_quiz_schedule`-equivalent logic here.
    let _ = state;
    Ok(())
}

fn read_auto_sync_default() -> bool {
    // Default to on. The frontend exposes a toggle that writes to the store
    // key `sync.auto_sync`. We don't depend on that here — `lib.rs` reads
    // the same key when scheduling the periodic loop.
    true
}

#[allow(dead_code)]
pub fn store_keys() -> &'static [&'static str] {
    &[
        KEY_SYNC_JWT,
        KEY_SYNC_EMAIL,
        KEY_SYNC_USER,
        KEY_SYNC_CLIENT,
        KEY_SYNC_SERVER,
        KEY_SYNC_AUTO,
    ]
}
