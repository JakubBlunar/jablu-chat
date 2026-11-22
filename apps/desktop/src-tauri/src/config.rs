use std::fs;
use std::path::PathBuf;

use tauri::{AppHandle, Manager};

/// The Jablu server URL is baked in at build time (from the `VITE_SERVER_URL`
/// env var, set by the release script from `UPDATE_PUBLIC_URL`). Returns the
/// trimmed URL without a trailing slash, or `None` in dev builds where it is
/// not set. Used by the updater to build the per-server update feed endpoint.
pub fn get_stored_server_url(_app: &AppHandle) -> Option<String> {
    let raw = option_env!("VITE_SERVER_URL")?;
    let trimmed = raw.trim().trim_end_matches('/').to_string();
    if trimmed.is_empty() {
        None
    } else {
        Some(trimmed)
    }
}

/// Path to the file storing the "start minimized on login" preference.
fn start_minimized_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    Some(dir.join("start-minimized.txt"))
}

/// Whether a login-launched instance should stay in the tray. Defaults to `true`
/// (start hidden) when the user hasn't chosen otherwise.
pub fn get_stored_start_minimized(app: &AppHandle) -> bool {
    read_start_minimized(app).unwrap_or(true)
}

fn read_start_minimized(app: &AppHandle) -> Result<bool, String> {
    let path = start_minimized_path(app).ok_or("could not resolve app config dir")?;
    parse_start_minimized(fs::read_to_string(path))
}

fn parse_start_minimized(contents: std::io::Result<String>) -> Result<bool, String> {
    match contents {
        Ok(value) => value.trim().parse::<bool>().map_err(|e| e.to_string()),
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => Ok(true),
        Err(e) => Err(e.to_string()),
    }
}

#[tauri::command]
pub fn get_start_minimized(app: AppHandle) -> Result<bool, String> {
    read_start_minimized(&app)
}

#[tauri::command]
pub fn set_start_minimized(app: AppHandle, enabled: bool) -> Result<(), String> {
    let path = start_minimized_path(&app).ok_or("could not resolve app config dir")?;
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent).map_err(|e| e.to_string())?;
    }
    fs::write(path, if enabled { "true" } else { "false" }).map_err(|e| e.to_string())
}

/// Marker written before an in-app update relaunch so the next process shows
/// the window even if the original argv still contains `--minimized` (NSIS
/// forwards current-process args via `/ARGS`).
fn show_on_next_launch_path(app: &AppHandle) -> Option<PathBuf> {
    let dir = app.path().app_config_dir().ok()?;
    Some(dir.join("show-on-next-launch"))
}

pub fn mark_show_on_next_launch(app: &AppHandle) {
    let Some(path) = show_on_next_launch_path(app) else {
        return;
    };
    if let Some(parent) = path.parent() {
        let _ = fs::create_dir_all(parent);
    }
    let _ = fs::write(path, "1");
}

/// Consumes the one-shot "show the window" marker. Returns true when this
/// launch should ignore `--minimized` and open the main window.
pub fn take_show_on_next_launch(app: &AppHandle) -> bool {
    let Some(path) = show_on_next_launch_path(app) else {
        return false;
    };
    if path.exists() {
        let _ = fs::remove_file(&path);
        true
    } else {
        false
    }
}

#[cfg(test)]
mod tests {
    use super::parse_start_minimized;
    use std::io::{Error, ErrorKind};

    #[test]
    fn distinguishes_a_new_install_from_corrupt_or_inaccessible_preferences() {
        assert_eq!(
            parse_start_minimized(Err(Error::from(ErrorKind::NotFound))),
            Ok(true)
        );
        assert_eq!(parse_start_minimized(Ok("false\n".into())), Ok(false));
        assert!(parse_start_minimized(Ok("invalid".into())).is_err());
        assert!(parse_start_minimized(Err(Error::from(ErrorKind::PermissionDenied))).is_err());
    }
}
