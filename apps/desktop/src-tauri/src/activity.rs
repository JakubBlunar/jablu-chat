//! Native activity detection: running Steam games, curated non-Steam games, and
//! the current Spotify track (via the Windows System Media Transport Controls).
//!
//! Successful process scans publish freshness even when the game is unchanged.
//! Media and artwork run independently so they cannot hold up game-exit reports.
//! The renderer and gateway both enforce sharing preferences.

use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::{Arc, Condvar, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::AppState;

const POLL_INTERVAL: Duration = Duration::from_secs(5);

/// A user-registered app/game matched by executable name(s). Pushed from the
/// renderer so entries added under "Registered Games" become detectable.
#[derive(Clone, Deserialize)]
pub struct CustomDetectable {
    pub name: String,
    /// Lowercased executable file names that identify this app.
    pub executables: Vec<String>,
    #[serde(default, rename = "appId")]
    pub app_id: Option<String>,
}

/// A raw activity detected natively, mirrored to the shared `DetectedActivity`
/// TypeScript type (camelCase over the event bridge).
#[derive(Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DetectedActivity {
    pub source: &'static str,
    pub kind: &'static str,
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub app_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub executable: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub state: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_data_url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub icon_url: Option<String>,
    pub started_at: u64,
    pub session_id: Option<String>,
}

#[derive(Clone, Default, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActivitySnapshot {
    activities: Vec<DetectedActivity>,
    observed_at: u64,
    generation: u64,
}

pub struct ActivityState {
    started: bool,
    enabled: Arc<AtomicBool>,
    epoch: Arc<AtomicU64>,
    wake: Arc<(Mutex<()>, Condvar)>,
    current: Arc<Mutex<ActivitySnapshot>>,
    custom: Arc<Mutex<Vec<CustomDetectable>>>,
}
impl Default for ActivityState {
    fn default() -> Self {
        Self {
            started: false,
            enabled: Arc::new(AtomicBool::new(false)),
            epoch: Arc::new(AtomicU64::new(0)),
            wake: Arc::new((Mutex::new(()), Condvar::new())),
            current: Arc::new(Mutex::new(ActivitySnapshot::default())),
            custom: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[tauri::command]
pub fn set_activity_detection_enabled(app: AppHandle, state: State<AppState>, enabled: bool) {
    let Ok(mut activity) = state.activity.lock() else {
        return;
    };
    let changed = activity.enabled.swap(enabled, Ordering::SeqCst) != enabled;
    if changed {
        activity.epoch.fetch_add(1, Ordering::SeqCst);
    }
    if !enabled {
        if let Ok(mut cur) = activity.current.lock() {
            cur.activities.clear();
            cur.observed_at = now_ms();
            cur.generation += 1;
            let _ = app.emit("activity:snapshot", cur.clone());
            let _ = app.emit("activity:detected", Vec::<DetectedActivity>::new());
        }
    }
    if changed {
        activity.wake.1.notify_one();
    }
    if activity.started || !enabled {
        return;
    }
    activity.started = true;
    let enabled_flag = activity.enabled.clone();
    let epoch = activity.epoch.clone();
    let current = activity.current.clone();
    let custom = activity.custom.clone();
    let wake = activity.wake.clone();
    let handle = app.clone();
    let music = Arc::new(Mutex::new((None::<DetectedActivity>, 0_u64, 0_u64)));
    let media = music.clone();
    let media_enabled = enabled_flag.clone();
    let media_epoch = epoch.clone();
    std::thread::spawn(move || {
        init_thread();
        loop {
            let generation = media_epoch.load(Ordering::SeqCst);
            let result = if media_enabled.load(Ordering::SeqCst) {
                std::panic::catch_unwind(detect_music).ok().flatten()
            } else {
                None
            };
            if generation == media_epoch.load(Ordering::SeqCst) {
                if let Ok(mut cached) = media.lock() {
                    *cached = (result, now_ms(), generation);
                }
            }
            std::thread::sleep(POLL_INTERVAL);
        }
    });
    std::thread::spawn(move || {
        let mut previous = Vec::new();
        let mut previous_epoch = u64::MAX;
        loop {
            let generation = epoch.load(Ordering::SeqCst);
            if enabled_flag.load(Ordering::SeqCst) {
                if generation != previous_epoch {
                    previous.clear();
                    previous_epoch = generation;
                }
                let custom_snapshot = custom.lock().map(|c| c.clone()).unwrap_or_default();
                match std::panic::catch_unwind(|| detect_all(&custom_snapshot)) {
                    Ok(mut detected) => {
                        if let Ok(cached) = music.lock() {
                            if cached.2 == generation && now_ms().saturating_sub(cached.1) < 15_000
                            {
                                if let Some(track) = &cached.0 {
                                    detected.push(track.clone());
                                }
                            }
                        }
                        carry_over_started_at(&mut detected, &previous);
                        detected.sort_by(|a, b| {
                            (a.kind, &a.app_id, &a.name).cmp(&(b.kind, &b.app_id, &b.name))
                        });
                        if let Ok(mut cur) = current.lock() {
                            if enabled_flag.load(Ordering::SeqCst)
                                && epoch.load(Ordering::SeqCst) == generation
                            {
                                cur.activities = detected.clone();
                                cur.observed_at = now_ms();
                                cur.generation += 1;
                                let _ = handle.emit("activity:snapshot", cur.clone());
                                if detected != previous {
                                    let _ = handle.emit("activity:detected", &detected);
                                }
                                previous = detected;
                            }
                        }
                    }
                    Err(_) => {
                        crate::logging::log("activity: process scan panicked; retrying next cycle")
                    }
                }
            }
            if let Ok(guard) = wake.0.lock() {
                let _ = wake.1.wait_timeout(guard, POLL_INTERVAL);
            }
        }
    });
}

#[tauri::command]
pub fn set_custom_detectables(state: State<AppState>, detectables: Vec<CustomDetectable>) {
    if let Ok(activity) = state.activity.lock() {
        if let Ok(mut custom) = activity.custom.lock() {
            *custom = detectables
                .into_iter()
                .map(|d| CustomDetectable {
                    name: d.name,
                    app_id: d.app_id,
                    executables: d.executables.iter().map(|e| e.to_lowercase()).collect(),
                })
                .collect();
        }
        activity.wake.1.notify_one();
    }
}
#[tauri::command]
pub fn get_activity_snapshot(state: State<AppState>) -> ActivitySnapshot {
    state
        .activity
        .lock()
        .map(|a| {
            a.wake.1.notify_one();
            a.current.lock().map(|c| c.clone()).unwrap_or_default()
        })
        .unwrap_or_default()
}
#[tauri::command]
pub fn get_detected_activities(state: State<AppState>) -> Vec<DetectedActivity> {
    get_activity_snapshot(state).activities
}

/// Keeps a stable `started_at` for an activity that was already present last tick
/// so elapsed-time display doesn't reset every poll.
fn carry_over_started_at(next: &mut [DetectedActivity], prev: &[DetectedActivity]) {
    for item in next.iter_mut() {
        if let Some(old) = prev.iter().find(|p| {
            p.source == item.source
                && p.app_id == item.app_id
                && p.name == item.name
                && p.session_id == item.session_id
                && p.details == item.details
                && p.state == item.state
        }) {
            item.started_at = old.started_at;
        }
    }
}

fn now_ms() -> u64 {
    std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis() as u64)
        .unwrap_or(0)
}

// Skyrim binaries also cover mod managers launching outside Steam libraries.
// PoE 1 and 2 share binary names, so their installation paths disambiguate them.
fn steam_executable(app_id: &str, executable: &str) -> bool {
    matches!(
        (app_id, executable),
        ("489830", "skyrimse.exe")
            | ("72850", "tesv.exe")
            | ("611670", "skyrimvr.exe")
            | (
                "238960" | "2694490",
                "pathofexilesteam.exe" | "pathofexile_x64steam.exe"
            )
    )
}

fn is_system_host(executable: &str) -> bool {
    matches!(
        executable.to_lowercase().as_str(),
        "conhost.exe"
            | "openconsole.exe"
            | "cmd.exe"
            | "powershell.exe"
            | "pwsh.exe"
            | "wscript.exe"
            | "cscript.exe"
            | "rundll32.exe"
            | "dllhost.exe"
            | "svchost.exe"
    )
}

fn is_helper(executable: &str) -> bool {
    let executable = executable.to_lowercase();
    if is_system_host(&executable)
        || ["steam.exe", "steamservice.exe", "steamwebhelper.exe"].contains(&executable.as_str())
    {
        return true;
    }
    [
        "launcher",
        "crash",
        "unins",
        "setup",
        "redist",
        "modorganizer",
        "_loader",
        "usvfs",
        "helper",
        "updater",
    ]
    .iter()
    .any(|part| executable.contains(part))
}

fn steam_process_matches(
    app_id: &str,
    executable: &str,
    path: Option<&std::path::Path>,
    install: Option<&std::path::Path>,
) -> bool {
    if is_helper(executable) {
        return false;
    }
    // Known titles require the game binary even when another process inherits
    // SteamAppId or lives beside the game. Mod tools must not prolong Skyrim.
    if ["489830", "72850", "611670"].contains(&app_id) {
        return steam_executable(app_id, executable);
    }
    // Environment variables and previously saved executable names are not
    // evidence: launchers pass SteamAppId to unrelated, long-lived children.
    let in_install = path
        .zip(install)
        .is_some_and(|(exe, root)| path_is_inside(exe, root));
    if ["238960", "2694490"].contains(&app_id) {
        return in_install && steam_executable(app_id, executable);
    }
    in_install
}

fn path_is_inside(executable: &std::path::Path, directory: &std::path::Path) -> bool {
    let exe = executable
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase();
    let dir = directory
        .to_string_lossy()
        .replace('/', "\\")
        .to_lowercase();
    exe.starts_with(&format!("{}\\", dir.trim_end_matches('\\')))
}

fn vdf_tokens(text: &str) -> Vec<String> {
    let mut out = Vec::new();
    let mut chars = text.chars();
    while let Some(c) = chars.next() {
        if c != '"' {
            continue;
        }
        let mut token = String::new();
        while let Some(c) = chars.next() {
            if c == '"' {
                break;
            }
            if c == '\\' {
                if let Some(escaped) = chars.next() {
                    token.push(escaped);
                }
            } else {
                token.push(c);
            }
        }
        out.push(token);
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn modded_skyrim_matches_its_real_binary() {
        assert!(steam_executable("489830", "skyrimse.exe"));
        assert!(!steam_executable("489830", "steam.exe"));
        assert!(!steam_executable("489830", "modorganizer.exe"));
        assert!(!steam_executable("489830", "skse64_loader.exe"));
        assert!(!steam_executable("72850", "skyrimse.exe"));
    }

    #[test]
    fn helpers_cannot_keep_a_steam_game_alive() {
        for name in [
            "steam.exe",
            "ModOrganizer.exe",
            "GameLauncher.exe",
            "skse64_loader.exe",
            "CrashReporter.exe",
            "conhost.exe",
            "OpenConsole.exe",
            "cmd.exe",
            "powershell.exe",
        ] {
            assert!(is_helper(name));
        }
        assert!(!is_helper("skyrimse.exe"));
        assert!(!steam_process_matches("489830", "python.exe", None, None));
        assert!(!steam_process_matches(
            "489830",
            "usvfs_proxy_x64.exe",
            None,
            None
        ));
    }

    #[test]
    fn steam_requires_a_live_process_in_its_installation() {
        use std::path::Path;
        let install = Some(Path::new("H:/SteamLibrary/steamapps/common/Example"));
        assert!(steam_process_matches(
            "123",
            "game.exe",
            Some(Path::new(
                "H:/SteamLibrary/steamapps/common/Example/bin/game.exe"
            )),
            install
        ));
        for executable in ["conhost.exe", "cmd.exe", "GameLauncher.exe", "game.exe"] {
            assert!(!steam_process_matches(
                "123",
                executable,
                Some(Path::new("C:/Windows/System32/conhost.exe")),
                install
            ));
            assert!(!steam_process_matches("123", executable, None, None));
        }
        assert!(!steam_process_matches(
            "123",
            "conhost.exe",
            Some(Path::new(
                "H:/SteamLibrary/steamapps/common/Example/conhost.exe"
            )),
            install
        ));
    }

    #[test]
    fn poe_uses_real_binaries_and_distinguishes_installations() {
        use std::path::Path;
        let install = Some(Path::new("H:/SteamLibrary/steamapps/common/Path of Exile"));
        for executable in ["pathofexilesteam.exe", "pathofexile_x64steam.exe"] {
            let path = Path::new("H:/SteamLibrary/steamapps/common/Path of Exile").join(executable);
            assert!(steam_process_matches(
                "238960",
                executable,
                Some(&path),
                install
            ));
            assert!(!steam_process_matches(
                "238960",
                executable,
                Some(&path),
                None
            ));
            assert!(!steam_process_matches(
                "2694490",
                executable,
                Some(&path),
                Some(Path::new(
                    "H:/SteamLibrary/steamapps/common/Path of Exile 2"
                ))
            ));
        }
        // A helper can outlive the game even inside its installation directory.
        assert!(!steam_process_matches(
            "238960",
            "conhost.exe",
            Some(Path::new(
                "H:/SteamLibrary/steamapps/common/Path of Exile/conhost.exe"
            )),
            install
        ));
        assert!(!steam_process_matches(
            "238960",
            "overlay.exe",
            Some(Path::new(
                "H:/SteamLibrary/steamapps/common/Path of Exile/overlay.exe"
            )),
            install
        ));
    }

    #[test]
    fn installation_matching_requires_a_directory_boundary() {
        assert!(path_is_inside(
            std::path::Path::new("I:/Steam/Game/bin/play.exe"),
            std::path::Path::new("i:/steam/game")
        ));
        assert!(!path_is_inside(
            std::path::Path::new("I:/Steam/Game Launcher/play.exe"),
            std::path::Path::new("I:/Steam/Game")
        ));
    }

    #[test]
    fn reads_escaped_steam_library_paths() {
        assert_eq!(
            vdf_tokens(r#""path" "I:\\SteamLibrary" "installdir" "Skyrim Special Edition""#),
            vec![
                "path",
                "I:\\SteamLibrary",
                "installdir",
                "Skyrim Special Edition"
            ]
        );
    }

    #[test]
    fn new_tracks_and_process_sessions_have_distinct_start_times() {
        let old = DetectedActivity {
            source: "smtc",
            kind: "music",
            name: "Spotify".into(),
            app_id: None,
            executable: None,
            details: Some("Old song".into()),
            state: None,
            icon_data_url: None,
            icon_url: None,
            started_at: 100,
            session_id: None,
        };
        let mut new = old.clone();
        new.details = Some("New song".into());
        new.started_at = 200;
        carry_over_started_at(std::slice::from_mut(&mut new), std::slice::from_ref(&old));
        assert_eq!(new.started_at, 200);
        let mut next = old.clone();
        next.started_at = 300;
        carry_over_started_at(std::slice::from_mut(&mut next), std::slice::from_ref(&old));
        assert_eq!(next.started_at, 100);
        next.session_id = Some("new-process".into());
        next.started_at = 400;
        carry_over_started_at(std::slice::from_mut(&mut next), &[old]);
        assert_eq!(next.started_at, 400);
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "Requires Skyrim to be running on the host"]
    fn detects_live_modded_skyrim() {
        let detected = detect_all(&[]);
        let game = detected
            .iter()
            .find(|a| a.source == "steam" && a.app_id.as_deref() == Some("489830"))
            .expect("running Skyrim should be corroborated with its actual process");
        assert_eq!(game.executable.as_deref(), Some("skyrimse.exe"));
        assert!(game.session_id.is_some());
    }

    #[cfg(windows)]
    #[test]
    #[ignore = "Requires Skyrim closed while Steam remains open"]
    fn closed_skyrim_is_not_detected() {
        assert!(!detect_all(&[])
            .iter()
            .any(|a| a.app_id.as_deref() == Some("489830")));
    }
}

// ── Platform dispatch ──────────────────────────────────────────────────────

#[cfg(windows)]
fn init_thread() {
    // WinRT (SMTC) calls require an initialized COM apartment on this thread.
    use windows::Win32::System::Com::{CoInitializeEx, COINIT_MULTITHREADED};
    unsafe {
        let _ = CoInitializeEx(None, COINIT_MULTITHREADED);
    }
}

#[cfg(not(windows))]
fn init_thread() {}

#[cfg(windows)]
fn detect_all(custom: &[CustomDetectable]) -> Vec<DetectedActivity> {
    use sysinfo::{ProcessRefreshKind, System, UpdateKind};

    let mut sys = System::new();
    sys.refresh_processes_specifics(
        ProcessRefreshKind::new()
            .with_exe(UpdateKind::OnlyIfNotSet)
            .with_cmd(UpdateKind::OnlyIfNotSet),
    );

    // Steam supplies app identities. A live game process is required separately;
    // the client and registry flag never prove that a game is running.
    let steam_running = sys
        .processes()
        .values()
        .any(|p| p.name().to_lowercase() == "steam.exe");

    let mut out: Vec<DetectedActivity> = Vec::new();
    let mut seen_names: Vec<String> = Vec::new();

    if steam_running {
        for game in win::detect_steam(&sys) {
            seen_names.push(game.name.to_lowercase());
            out.push(game);
        }
    }
    for game in win::detect_processes(&sys, custom) {
        if seen_names.contains(&game.name.to_lowercase()) {
            continue;
        }
        seen_names.push(game.name.to_lowercase());
        out.push(game);
    }
    out
}

#[cfg(not(windows))]
fn detect_all(_custom: &[CustomDetectable]) -> Vec<DetectedActivity> {
    Vec::new()
}

// ── Windows detection ──────────────────────────────────────────────────────

#[cfg(windows)]
fn detect_music() -> Option<DetectedActivity> {
    win::detect_music()
}
#[cfg(not(windows))]
fn detect_music() -> Option<DetectedActivity> {
    None
}

#[cfg(windows)]
mod win {
    use super::{now_ms, DetectedActivity};
    use base64::Engine;

    fn media_result<T: windows::core::RuntimeType>(
        operation: windows::core::Result<windows_future::IAsyncOperation<T>>,
    ) -> Option<T> {
        let operation = operation.ok()?;
        let deadline = std::time::Instant::now() + std::time::Duration::from_secs(2);
        while operation.Status().ok()? == windows_future::AsyncStatus::Started {
            if std::time::Instant::now() >= deadline {
                let _ = operation.Cancel();
                return None;
            }
            std::thread::sleep(std::time::Duration::from_millis(20));
        }
        operation.GetResults().ok()
    }

    enum IconTask {
        Steam(String, String),
        Executable(std::path::PathBuf),
    }
    type IconMap =
        std::sync::Arc<std::sync::Mutex<std::collections::HashMap<String, Option<String>>>>;
    struct Icons {
        values: IconMap,
        sender: std::sync::mpsc::SyncSender<(String, IconTask)>,
    }
    fn cached_icon(key: String, task: IconTask) -> Option<String> {
        static CACHE: std::sync::OnceLock<Icons> = std::sync::OnceLock::new();
        let cache = CACHE.get_or_init(|| {
            let values: IconMap = Default::default();
            let worker = values.clone();
            let (sender, receiver) = std::sync::mpsc::sync_channel::<(String, IconTask)>(8);
            std::thread::spawn(move || {
                for (key, task) in receiver {
                    let result = std::panic::catch_unwind(|| match task {
                        IconTask::Steam(path, id) => steam_icon_data_url(&path, &id),
                        IconTask::Executable(path) => exe_icon_data_url(&path),
                    })
                    .ok()
                    .flatten();
                    if let Ok(mut values) = worker.lock() {
                        values.insert(key, result);
                    }
                }
            });
            Icons { values, sender }
        });
        let Ok(mut values) = cache.values.lock() else {
            return None;
        };
        if let Some(value) = values.get(&key) {
            return value.clone();
        }
        if values.len() > 128 {
            values.clear();
        }
        if cache.sender.try_send((key.clone(), task)).is_ok() {
            values.insert(key, None);
        }
        None
    }

    fn steam_install_dir(steam_path: &str, app_id: &str) -> Option<std::path::PathBuf> {
        use std::path::PathBuf;
        let mut libraries = vec![PathBuf::from(steam_path)];
        if let Ok(text) =
            std::fs::read_to_string(PathBuf::from(steam_path).join("steamapps/libraryfolders.vdf"))
        {
            for pair in super::vdf_tokens(&text).windows(2) {
                if pair[0] == "path" {
                    libraries.push(PathBuf::from(&pair[1]));
                }
            }
        }
        for library in libraries {
            let apps = library.join("steamapps");
            let Ok(manifest) =
                std::fs::read_to_string(apps.join(format!("appmanifest_{app_id}.acf")))
            else {
                continue;
            };
            if let Some(pair) = super::vdf_tokens(&manifest)
                .windows(2)
                .find(|p| p[0] == "installdir")
            {
                let directory = PathBuf::from(&pair[1]);
                if directory
                    .components()
                    .any(|c| !matches!(c, std::path::Component::Normal(_)))
                {
                    continue;
                }
                return Some(apps.join("common").join(directory));
            }
        }
        None
    }

    /// Small curated non-Steam detectables. Kept in sync with the server list.
    const DETECTABLES: &[(&str, &[&str])] = &[
        ("Minecraft", &["minecraft.exe", "javaw.exe"]),
        (
            "The Elder Scrolls V: Skyrim Special Edition",
            &["skyrimse.exe"],
        ),
        ("The Elder Scrolls V: Skyrim", &["tesv.exe"]),
        ("The Elder Scrolls V: Skyrim VR", &["skyrimvr.exe"]),
        ("League of Legends", &["league of legends.exe"]),
        ("VALORANT", &["valorant.exe", "valorant-win64-shipping.exe"]),
        ("Fortnite", &["fortniteclient-win64-shipping.exe"]),
        ("Grand Theft Auto V", &["gta5.exe", "gtav.exe"]),
        ("Roblox", &["robloxplayerbeta.exe"]),
        ("World of Warcraft", &["wow.exe"]),
        ("Overwatch 2", &["overwatch.exe"]),
        ("Apex Legends", &["r5apex.exe"]),
        ("Genshin Impact", &["genshinimpact.exe"]),
        ("Path of Exile", &["pathofexile.exe", "pathofexile_x64.exe"]),
        ("osu!", &["osu!.exe"]),
    ];

    pub fn detect_steam(sys: &sysinfo::System) -> Vec<DetectedActivity> {
        use winreg::enums::HKEY_CURRENT_USER;
        use winreg::RegKey;

        let mut out = Vec::new();
        let hkcu = RegKey::predef(HKEY_CURRENT_USER);
        let Ok(steam) = hkcu.open_subkey("Software\\Valve\\Steam") else {
            return out;
        };
        let steam_path: String = steam.get_value("SteamPath").unwrap_or_default();
        let Ok(apps) = steam.open_subkey("Apps") else {
            return out;
        };
        for app_id in apps.enum_keys().flatten() {
            let Ok(sub) = apps.open_subkey(&app_id) else {
                continue;
            };
            let running: u32 = sub.get_value("Running").unwrap_or(0);
            let known_running = sys
                .processes()
                .values()
                .any(|p| super::steam_executable(&app_id, &p.name().to_lowercase()));
            if running != 1 && !known_running {
                continue;
            }
            let install = steam_install_dir(&steam_path, &app_id);
            let process = sys
                .processes()
                .iter()
                .filter(|(_, p)| {
                    let name = p.name().to_lowercase();
                    super::steam_process_matches(&app_id, &name, p.exe(), install.as_deref())
                })
                .min_by_key(|(pid, _)| **pid);
            let Some((pid, process)) = process else {
                continue;
            };
            let name: String = sub.get_value("Name").unwrap_or_default();
            if name.is_empty() {
                continue;
            }
            // Prefer Steam's local square icon; fall back to the (rectangular) CDN capsule.
            let icon_data_url = cached_icon(
                format!("steam:{app_id}"),
                IconTask::Steam(steam_path.clone(), app_id.clone()),
            );
            let icon_url = if icon_data_url.is_some() {
                None
            } else {
                Some(format!(
                    "https://cdn.cloudflare.steamstatic.com/steam/apps/{app_id}/capsule_231x87.jpg"
                ))
            };
            out.push(DetectedActivity {
                source: "steam",
                kind: "game",
                name,
                app_id: Some(app_id.clone()),
                executable: Some(process.name().to_lowercase()),
                details: None,
                state: None,
                icon_data_url,
                icon_url,
                started_at: process.start_time().saturating_mul(1000),
                session_id: Some(format!("{pid}:{}", process.start_time())),
            });
        }
        out
    }

    /// Reads the square app icon Steam caches locally and returns it as a data
    /// URL. Steam stores it under `appcache/librarycache` — as a flat
    /// `<appid>_icon.jpg` (older clients) or inside a `<appid>/` folder (newer).
    fn steam_icon_data_url(steam_path: &str, app_id: &str) -> Option<String> {
        use base64::Engine;
        use std::path::PathBuf;

        if steam_path.is_empty() {
            return None;
        }
        let cache = PathBuf::from(steam_path)
            .join("appcache")
            .join("librarycache");

        let mut candidates: Vec<PathBuf> = vec![
            cache.join(format!("{app_id}_icon.jpg")),
            cache.join(app_id).join(format!("{app_id}_icon.jpg")),
        ];
        // Newer clients name the icon by content hash inside the per-app folder;
        // pick the smallest jpg there, which is the square icon rather than art.
        let app_dir = cache.join(app_id);
        if let Ok(entries) = std::fs::read_dir(&app_dir) {
            let mut jpgs: Vec<(u64, PathBuf)> = entries
                .flatten()
                .map(|e| e.path())
                .filter(|p| p.extension().and_then(|x| x.to_str()) == Some("jpg"))
                .filter_map(|p| std::fs::metadata(&p).ok().map(|m| (m.len(), p)))
                .collect();
            jpgs.sort_by_key(|(len, _)| *len);
            if let Some((_, smallest)) = jpgs.into_iter().next() {
                candidates.push(smallest);
            }
        }

        for path in candidates {
            let Ok(bytes) = std::fs::read(&path) else {
                continue;
            };
            if bytes.is_empty() || bytes.len() > 400_000 {
                continue;
            }
            let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
            return Some(format!("data:image/jpeg;base64,{b64}"));
        }
        None
    }

    pub fn detect_processes(
        sys: &sysinfo::System,
        custom: &[super::CustomDetectable],
    ) -> Vec<DetectedActivity> {
        let mut out: Vec<DetectedActivity> = Vec::new();
        let mut processes: Vec<_> = sys.processes().iter().collect();
        processes.sort_by_key(|(pid, proc_)| (proc_.start_time(), **pid));
        for (pid, proc_) in processes {
            let exe_name = proc_.name().to_lowercase();
            if super::is_system_host(&exe_name) {
                continue;
            }
            if exe_name == "javaw.exe"
                && !proc_.cmd().iter().any(|arg| {
                    let arg = arg.to_lowercase();
                    ["minecraft", "fabricmc", "forge", "quiltmc"]
                        .iter()
                        .any(|tag| arg.contains(tag))
                })
            {
                continue;
            }

            // Curated list first, then the user's registered executables.
            let title: Option<String> = DETECTABLES
                .iter()
                .find(|(_, exes)| exes.iter().any(|e| *e == exe_name))
                .map(|(name, _)| (*name).to_string())
                .or_else(|| {
                    custom
                        .iter()
                        .find(|d| {
                            d.app_id.is_none() && d.executables.iter().any(|e| *e == exe_name)
                        })
                        .map(|d| d.name.clone())
                });
            let Some(title) = title else {
                continue;
            };
            if out.iter().any(|a| a.name == title) {
                continue;
            }
            let icon_data_url = proc_.exe().and_then(|path| {
                cached_icon(
                    format!("exe:{}", path.display()),
                    IconTask::Executable(path.to_path_buf()),
                )
            });
            out.push(DetectedActivity {
                source: "process",
                kind: "game",
                name: title,
                app_id: ["489830", "72850", "611670"]
                    .iter()
                    .find(|id| super::steam_executable(id, &exe_name))
                    .map(|id| (*id).to_string()),
                executable: Some(exe_name),
                details: None,
                state: None,
                icon_data_url,
                icon_url: None,
                started_at: proc_.start_time().saturating_mul(1000),
                session_id: Some(format!("{pid}:{}", proc_.start_time())),
            });
        }
        out
    }

    pub fn detect_music() -> Option<DetectedActivity> {
        use windows::Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager as SmtcManager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
        };

        let manager = media_result(SmtcManager::RequestAsync())?;
        let sessions = manager.GetSessions().ok()?;
        let session = (0..sessions.Size().ok()?)
            .filter_map(|i| sessions.GetAt(i).ok())
            .find(|s| {
                s.SourceAppUserModelId()
                    .ok()
                    .is_some_and(|id| id.to_string().to_lowercase().contains("spotify"))
                    && s.GetPlaybackInfo()
                        .ok()
                        .and_then(|p| p.PlaybackStatus().ok())
                        == Some(PlaybackStatus::Playing)
            })?;

        let source = session.SourceAppUserModelId().ok()?.to_string();
        if !source.to_lowercase().contains("spotify") {
            return None;
        }

        let playback = session.GetPlaybackInfo().ok()?;
        if playback.PlaybackStatus().ok()? != PlaybackStatus::Playing {
            return None;
        }

        let props = media_result(session.TryGetMediaPropertiesAsync())?;
        let title = props.Title().ok()?.to_string();
        if title.is_empty() {
            return None;
        }
        let artist = props
            .Artist()
            .ok()
            .map(|s| s.to_string())
            .unwrap_or_default();

        let icon_data_url = read_thumbnail(&props);

        Some(DetectedActivity {
            source: "smtc",
            kind: "music",
            name: "Spotify".to_string(),
            app_id: None,
            executable: None,
            details: Some(title),
            state: if artist.is_empty() {
                None
            } else {
                Some(artist)
            },
            icon_data_url,
            icon_url: None,
            started_at: now_ms(),
            session_id: None,
        })
    }

    fn read_thumbnail(
        props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
    ) -> Option<String> {
        use windows::Storage::Streams::DataReader;

        let thumb_ref = props.Thumbnail().ok()?;
        let stream = media_result(thumb_ref.OpenReadAsync())?;
        let size = stream.Size().ok()?;
        if size == 0 || size > 1_000_000 {
            return None;
        }
        let content_type = stream
            .ContentType()
            .map(|s| s.to_string())
            .unwrap_or_else(|_| "image/jpeg".to_string());

        let input = stream.GetInputStreamAt(0).ok()?;
        let reader = DataReader::CreateDataReader(&input).ok()?;
        media_result(reader.LoadAsync(size as u32))?;
        let mut buf = vec![0u8; size as usize];
        reader.ReadBytes(&mut buf).ok()?;

        let b64 = base64::engine::general_purpose::STANDARD.encode(&buf);
        Some(format!("data:{content_type};base64,{b64}"))
    }

    /// Extracts the icon for an executable and returns it as a PNG data URL.
    fn exe_icon_data_url(path: &std::path::Path) -> Option<String> {
        use std::os::windows::ffi::OsStrExt;
        use windows::core::PCWSTR;
        use windows::Win32::Graphics::Gdi::{DeleteObject, GetObjectW, BITMAP, HGDIOBJ};
        use windows::Win32::UI::Shell::{SHGetFileInfoW, SHFILEINFOW, SHGFI_ICON, SHGFI_LARGEICON};
        use windows::Win32::UI::WindowsAndMessaging::{DestroyIcon, GetIconInfo, ICONINFO};

        let wide: Vec<u16> = path
            .as_os_str()
            .encode_wide()
            .chain(std::iter::once(0))
            .collect();

        unsafe {
            let mut info = SHFILEINFOW::default();
            let res = SHGetFileInfoW(
                PCWSTR(wide.as_ptr()),
                Default::default(),
                Some(&mut info),
                std::mem::size_of::<SHFILEINFOW>() as u32,
                SHGFI_ICON | SHGFI_LARGEICON,
            );
            if res == 0 || info.hIcon.is_invalid() {
                return None;
            }
            let hicon = info.hIcon;

            let mut icon_info = ICONINFO::default();
            if GetIconInfo(hicon, &mut icon_info).is_err() {
                let _ = DestroyIcon(hicon);
                return None;
            }

            let mut bmp = BITMAP::default();
            let got = GetObjectW(
                HGDIOBJ(icon_info.hbmColor.0),
                std::mem::size_of::<BITMAP>() as i32,
                Some(&mut bmp as *mut _ as *mut _),
            );
            let result = if got != 0 {
                bitmap_to_png(icon_info.hbmColor, bmp.bmWidth, bmp.bmHeight)
            } else {
                None
            };

            if !icon_info.hbmColor.is_invalid() {
                let _ = DeleteObject(HGDIOBJ(icon_info.hbmColor.0));
            }
            if !icon_info.hbmMask.is_invalid() {
                let _ = DeleteObject(HGDIOBJ(icon_info.hbmMask.0));
            }
            let _ = DestroyIcon(hicon);
            result
        }
    }

    /// Reads a 32-bit color HBITMAP into RGBA and PNG-encodes it as a data URL.
    fn bitmap_to_png(
        hbm_color: windows::Win32::Graphics::Gdi::HBITMAP,
        width: i32,
        height: i32,
    ) -> Option<String> {
        use base64::Engine;
        use windows::Win32::Foundation::HWND;
        use windows::Win32::Graphics::Gdi::{
            GetDC, GetDIBits, ReleaseDC, BITMAPINFO, BITMAPINFOHEADER, BI_RGB, DIB_RGB_COLORS,
        };

        if width <= 0 || height <= 0 || width > 512 || height > 512 {
            return None;
        }
        let w = width as usize;
        let h = height as usize;

        let mut bmi = BITMAPINFO {
            bmiHeader: BITMAPINFOHEADER {
                biSize: std::mem::size_of::<BITMAPINFOHEADER>() as u32,
                biWidth: width,
                // Negative height => top-down rows so we don't have to flip.
                biHeight: -height,
                biPlanes: 1,
                biBitCount: 32,
                biCompression: BI_RGB.0,
                ..Default::default()
            },
            ..Default::default()
        };

        let mut pixels = vec![0u8; w * h * 4];
        unsafe {
            let hdc = GetDC(Some(HWND::default()));
            let scanlines = GetDIBits(
                hdc,
                hbm_color,
                0,
                height as u32,
                Some(pixels.as_mut_ptr() as *mut _),
                &mut bmi,
                DIB_RGB_COLORS,
            );
            ReleaseDC(Some(HWND::default()), hdc);
            if scanlines == 0 {
                return None;
            }
        }

        // GDI returns BGRA; convert to RGBA. If the icon has no alpha channel at
        // all (all zero), treat it as fully opaque.
        let has_alpha = pixels.chunks_exact(4).any(|px| px[3] != 0);
        for px in pixels.chunks_exact_mut(4) {
            px.swap(0, 2);
            if !has_alpha {
                px[3] = 255;
            }
        }

        let mut png: Vec<u8> = Vec::new();
        {
            use image::codecs::png::PngEncoder;
            use image::{ExtendedColorType, ImageEncoder};
            let encoder = PngEncoder::new(&mut png);
            encoder
                .write_image(&pixels, w as u32, h as u32, ExtendedColorType::Rgba8)
                .ok()?;
        }
        let b64 = base64::engine::general_purpose::STANDARD.encode(&png);
        Some(format!("data:image/png;base64,{b64}"))
    }
}
