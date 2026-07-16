use std::fs;
use std::path::PathBuf;
use std::time::Duration;

use tauri::{AppHandle, Manager};

/// Path to the file that stores the configured Jablu server URL. It lives in the
/// app config dir so both the Rust side (updater feed) and the web layer can rely
/// on the same source of truth.
fn server_url_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    Some(dir.join("server-url.txt"))
}

/// Reads the stored server URL (trimmed, without trailing slash). Used by the
/// updater to build the per-server update feed endpoint.
pub fn get_stored_server_url(app: &AppHandle) -> Option<String> {
    let path = server_url_path(app)?;
    let contents = fs::read_to_string(path).ok()?;
    let trimmed = contents.trim().trim_end_matches('/').to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

#[tauri::command]
pub fn get_server_url(app: AppHandle) -> Option<String> {
    get_stored_server_url(&app)
}

#[tauri::command]
pub fn set_server_url(app: AppHandle, url: String) -> Result<(), String> {
    let path = server_url_path(&app).ok_or("could not resolve app config dir")?;
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    fs::write(path, url.trim()).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn test_server_url(url: String) -> bool {
    let target = format!("{}/api/health", url.trim().trim_end_matches('/'));
    let client = match reqwest::Client::builder()
        .timeout(Duration::from_secs(5))
        .build()
    {
        Ok(c) => c,
        Err(_) => return false,
    };
    match client.get(&target).send().await {
        Ok(resp) => resp.status().is_success(),
        Err(_) => false,
    }
}
