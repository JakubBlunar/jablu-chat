use std::time::{Duration, SystemTime, UNIX_EPOCH};

use serde::Deserialize;
use serde_json::json;
use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_updater::UpdaterExt;

use crate::config::get_stored_server_url;
use crate::AppState;

/// Update lifecycle state, mirrored to the web layer via events and
/// `get_update_status`.
#[derive(Default)]
pub struct UpdateState {
    pub last_checked_at: Option<i64>,
    pub last_error: Option<String>,
    pub pending: Option<PendingUpdate>,
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

/// Runs a single update check: compatibility gate, then Tauri's signed update
/// check + download, emitting lifecycle events the web layer listens to.
pub async fn run_check(app: AppHandle) {
    {
        let state = app.state::<AppState>();
        let mut guard = state.update.lock().unwrap();
        guard.last_checked_at = Some(now_millis());
        guard.last_error = None;
    }

    let Some(feed) = feed_url(&app) else {
        return;
    };

    let version = app.package_info().version.to_string();

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
                    let _ = app.emit("update-downloaded", json!({ "version": update_version }));
                }
                Err(e) => set_error(&app, e.to_string()),
            }
        }
        Ok(None) => {
            let _ = app.emit("update-not-available", ());
        }
        Err(e) => set_error(&app, e.to_string()),
    }
}

fn set_error(app: &AppHandle, message: String) {
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
        tokio::time::sleep(Duration::from_secs(5)).await;
        run_check(app.clone()).await;
        loop {
            tokio::time::sleep(Duration::from_secs(4 * 60 * 60)).await;
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

    pending
        .update
        .install(pending.bytes)
        .map_err(|e| e.to_string())?;

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
    })
}
