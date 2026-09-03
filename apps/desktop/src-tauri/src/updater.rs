use std::sync::OnceLock;
use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;
use tauri_plugin_window_state::AppHandleExt;
use tokio::sync::Mutex as AsyncMutex;

use crate::config::get_stored_server_url;
use crate::AppState;

/// First check shortly after launch so the webview has time to subscribe, then
/// keep polling. 15 minutes is frequent enough that a just-published release
/// shows up without a manual "Check for updates", without hammering the feed.
const INITIAL_CHECK_DELAY: Duration = Duration::from_secs(5);
const CHECK_INTERVAL: Duration = Duration::from_secs(15 * 60);

/// Update lifecycle state, mirrored to the web layer via events and
/// `get_update_status`.
#[derive(Default)]
pub struct UpdateState {
    pub last_checked_at: Option<i64>,
    pub last_error: Option<String>,
    pub pending: Option<PendingUpdate>,
    /// Version we found and are downloading (or have downloaded). Survives so
    /// a webview that mounts after the events already fired can hydrate.
    pub available_version: Option<String>,
}

/// A downloaded-but-not-installed update. The installer bytes are cached so the
/// user can trigger the install (and relaunch) on demand.
pub struct PendingUpdate {
    pub update: tauri_plugin_updater::Update,
    pub bytes: Vec<u8>,
}

#[derive(Deserialize)]
struct CompatResponse {
    supported: bool,
    #[serde(rename = "minClient")]
    min_client: Option<String>,
    #[serde(rename = "maxClient")]
    max_client: Option<String>,
    reason: Option<String>,
}

fn now_millis() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis() as i64)
        .unwrap_or(0)
}

fn feed_url(app: &AppHandle) -> Option<String> {
    get_stored_server_url(app).map(|base| format!("{base}/api/updates"))
}

fn check_lock() -> &'static AsyncMutex<()> {
    static LOCK: OnceLock<AsyncMutex<()>> = OnceLock::new();
    LOCK.get_or_init(|| AsyncMutex::new(()))
}

async fn fetch_compat(feed: &str, version: &str) -> Option<CompatResponse> {
    let url = format!("{feed}/compat?client={version}");
    let client = reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
        .ok()?;
    let resp = client.get(&url).send().await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    resp.json::<CompatResponse>().await.ok()
}

fn emit_pending(app: &AppHandle, version: &str) {
    let _ = app.emit("update-downloaded", json!({ "version": version }));
}

/// Runs a single update check: compatibility gate, then Tauri's signed update
/// check + download, emitting lifecycle events the web layer listens to.
pub async fn run_check(app: AppHandle) {
    let _lock = check_lock().lock().await;

    {
        let state = app.state::<AppState>();
        let mut guard = state.update.lock().unwrap();
        guard.last_checked_at = Some(now_millis());
        guard.last_error = None;

        // Already downloaded: re-emit so a late-mounted UI still sees it.
        if let Some(pending) = guard.pending.as_ref() {
            let version = pending.update.version.clone();
            drop(guard);
            crate::logging::log(&format!("updater: pending {version} already downloaded"));
            emit_pending(&app, &version);
            return;
        }
    }

    let Some(feed) = feed_url(&app) else {
        crate::logging::log("updater: no feed URL configured, skipping check");
        return;
    };

    let version = app.package_info().version.to_string();
    crate::logging::log(&format!("updater: checking feed={feed} client={version}"));

    if let Some(compat) = fetch_compat(&feed, &version).await {
        if !compat.supported {
            let _ = app.emit(
                "update-incompatible",
                json!({
                    "reason": compat.reason,
                    "minClient": compat.min_client.unwrap_or_else(|| "0.0.0".to_string()),
                    "maxClient": compat.max_client,
                }),
            );
            return;
        }
    }

    let endpoint = format!("{feed}/latest.json");
    let parsed = match url::Url::parse(&endpoint) {
        Ok(u) => u,
        Err(e) => {
            set_error(&app, format!("Invalid update endpoint: {e}"));
            return;
        }
    };

    let updater = match app.updater_builder().endpoints(vec![parsed]) {
        Ok(builder) => match builder.build() {
            Ok(u) => u,
            Err(e) => {
                set_error(&app, e.to_string());
                return;
            }
        },
        Err(e) => {
            set_error(&app, e.to_string());
            return;
        }
    };

    match updater.check().await {
        Ok(Some(update)) => {
            let update_version = update.version.clone();
            {
                let state = app.state::<AppState>();
                let mut guard = state.update.lock().unwrap();
                guard.available_version = Some(update_version.clone());
            }
            crate::logging::log(&format!("updater: {update_version} available, downloading"));
            let _ = app.emit("update-available", json!({ "version": update_version }));

            let mut downloaded: u64 = 0;
            let app_progress = app.clone();
            let download = update
                .download(
                    move |chunk_len, content_len| {
                        downloaded += chunk_len as u64;
                        let total = content_len.unwrap_or(0);
                        let percent = if total > 0 {
                            (downloaded as f64 / total as f64) * 100.0
                        } else {
                            0.0
                        };
                        let _ = app_progress.emit(
                            "update-download-progress",
                            json!({
                                "percent": percent,
                                "transferred": downloaded,
                                "total": total,
                            }),
                        );
                    },
                    || {},
                )
                .await;

            match download {
                Ok(bytes) => {
                    {
                        let state = app.state::<AppState>();
                        let mut guard = state.update.lock().unwrap();
                        guard.pending = Some(PendingUpdate { update, bytes });
                    }
                    crate::logging::log(&format!("updater: {update_version} downloaded"));
                    emit_pending(&app, &update_version);
                }
                Err(e) => set_error(&app, e.to_string()),
            }
        }
        Ok(None) => {
            crate::logging::log("updater: up to date");
            let _ = app.emit("update-not-available", ());
        }
        Err(e) => set_error(&app, e.to_string()),
    }
}

fn set_error(app: &AppHandle, message: String) {
    crate::logging::log(&format!("updater: error {message}"));
    {
        let state = app.state::<AppState>();
        let mut guard = state.update.lock().unwrap();
        guard.last_error = Some(message.clone());
    }
    let _ = app.emit("update-error", json!({ "message": message }));
}

/// Schedules an initial update check shortly after launch and then periodically.
pub fn start_auto_update(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        tokio::time::sleep(INITIAL_CHECK_DELAY).await;
        run_check(app.clone()).await;
        loop {
            tokio::time::sleep(CHECK_INTERVAL).await;
            run_check(app.clone()).await;
        }
    });
}

#[tauri::command]
pub async fn check_for_updates(app: AppHandle) {
    run_check(app).await;
}

#[tauri::command]
pub fn install_update(app: AppHandle) -> Result<(), String> {
    // NSIS relaunches with the original process args (`/ARGS`), which may still
    // include `--minimized` from autostart. Mark this relaunch so setup shows
    // the window the user was looking at when they clicked Update.
    crate::config::mark_show_on_next_launch(&app);

    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = app.save_window_state(crate::persisted_state_flags());
    }

    let pending = {
        let state = app.state::<AppState>();
        let mut guard = state.update.lock().unwrap();
        guard.pending.take()
    };

    let Some(pending) = pending else {
        let _ = app.emit(
            "update-error",
            json!({ "message": "No downloaded update to install." }),
        );
        return Err("no pending update".to_string());
    };

    crate::logging::log("updater: installing and relaunching");

    pending
        .update
        .install(pending.bytes)
        .map_err(|e| e.to_string())?;

    // Windows NSIS `install()` never returns — it launches the installer and
    // exits. Other platforms need an explicit relaunch after the files are
    // replaced.
    app.restart();
}

#[tauri::command]
pub fn get_update_status(app: AppHandle) -> serde_json::Value {
    let state = app.state::<AppState>();
    let guard = state.update.lock().unwrap();
    json!({
        "lastCheckedAt": guard.last_checked_at,
        "lastError": guard.last_error,
        "feedConfigured": get_stored_server_url(&app).is_some(),
        "pendingVersion": guard.pending.as_ref().map(|p| p.update.version.clone()),
        "availableVersion": guard.available_version,
    })
}
