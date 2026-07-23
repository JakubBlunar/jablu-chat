//! Native activity detection: running Steam games, curated non-Steam games, and
//! the current Spotify track (via the Windows System Media Transport Controls).
//!
//! A single background poll thread is spawned lazily on first enable and stays
//! alive for the process lifetime; the master toggle just flips an atomic. When
//! the detected set changes it emits `activity:detected` with the full list; the
//! renderer applies the user's privacy filters before sharing anything.

use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::time::Duration;

use serde::{Deserialize, Serialize};
use tauri::{AppHandle, Emitter, State};

use crate::AppState;

const POLL_INTERVAL: Duration = Duration::from_secs(12);

/// A user-registered app/game matched by executable name(s). Pushed from the
/// renderer so entries added under "Registered Games" become detectable.
#[derive(Clone, Deserialize)]
pub struct CustomDetectable {
    pub name: String,
    /// Lowercased executable file names that identify this app.
    pub executables: Vec<String>,
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
}

pub struct ActivityState {
    started: bool,
    enabled: Arc<AtomicBool>,
    current: Arc<Mutex<Vec<DetectedActivity>>>,
    custom: Arc<Mutex<Vec<CustomDetectable>>>,
}

impl Default for ActivityState {
    fn default() -> Self {
        Self {
            started: false,
            enabled: Arc::new(AtomicBool::new(false)),
            current: Arc::new(Mutex::new(Vec::new())),
            custom: Arc::new(Mutex::new(Vec::new())),
        }
    }
}

#[tauri::command]
pub fn set_activity_detection_enabled(app: AppHandle, state: State<AppState>, enabled: bool) {
    let mut activity = state.activity.lock().unwrap();
    activity.enabled.store(enabled, Ordering::SeqCst);

    if !enabled {
        // Publish an empty set immediately so the renderer clears its shared state.
        if let Ok(mut cur) = activity.current.lock() {
            if !cur.is_empty() {
                cur.clear();
                let _ = app.emit("activity:detected", Vec::<DetectedActivity>::new());
            }
        }
    }

    if activity.started {
        return;
    }
    activity.started = true;

    let enabled_flag = activity.enabled.clone();
    let current = activity.current.clone();
    let custom = activity.custom.clone();
    let handle = app.clone();

    std::thread::spawn(move || {
        init_thread();
        let mut last_emitted: Vec<DetectedActivity> = Vec::new();
        loop {
            if enabled_flag.load(Ordering::SeqCst) {
                let custom_snapshot = custom.lock().map(|c| c.clone()).unwrap_or_default();
                let mut detected = detect_all(&custom_snapshot);
                carry_over_started_at(&mut detected, &last_emitted);

                if let Ok(mut cur) = current.lock() {
                    *cur = detected.clone();
                }
                if detected != last_emitted {
                    let _ = handle.emit("activity:detected", &detected);
                    last_emitted = detected;
                }
            }
            std::thread::sleep(POLL_INTERVAL);
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
                    executables: d.executables.iter().map(|e| e.to_lowercase()).collect(),
                })
                .collect();
        }
    }
}

#[tauri::command]
pub fn get_detected_activities(state: State<AppState>) -> Vec<DetectedActivity> {
    state
        .activity
        .lock()
        .map(|a| a.current.lock().map(|c| c.clone()).unwrap_or_default())
        .unwrap_or_default()
}

/// Keeps a stable `started_at` for an activity that was already present last tick
/// so elapsed-time display doesn't reset every poll.
fn carry_over_started_at(next: &mut [DetectedActivity], prev: &[DetectedActivity]) {
    for item in next.iter_mut() {
        if let Some(old) = prev
            .iter()
            .find(|p| p.source == item.source && p.name == item.name)
        {
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
    use sysinfo::System;

    let mut sys = System::new();
    sys.refresh_processes();

    // Steam leaves the per-app `Running` registry flag set to the last game even
    // after it exits, so it's only trustworthy while Steam itself is running.
    // Otherwise we'd report a stale "playing" long after the game (and Steam)
    // closed.
    let steam_running = sys
        .processes()
        .values()
        .any(|p| p.name().to_lowercase() == "steam.exe");

    let mut out: Vec<DetectedActivity> = Vec::new();
    let mut seen_names: Vec<String> = Vec::new();

    if steam_running {
        for game in win::detect_steam() {
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
    if let Some(music) = win::detect_music() {
        out.push(music);
    }
    out
}

#[cfg(not(windows))]
fn detect_all(_custom: &[CustomDetectable]) -> Vec<DetectedActivity> {
    Vec::new()
}

// ── Windows detection ──────────────────────────────────────────────────────

#[cfg(windows)]
mod win {
    use super::{now_ms, DetectedActivity};
    use base64::Engine;

    /// Small curated non-Steam detectables. Kept in sync with the server list.
    const DETECTABLES: &[(&str, &[&str])] = &[
        ("Minecraft", &["minecraft.exe", "javaw.exe"]),
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

    pub fn detect_steam() -> Vec<DetectedActivity> {
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
            if running != 1 {
                continue;
            }
            let name: String = sub.get_value("Name").unwrap_or_default();
            if name.is_empty() {
                continue;
            }
            // Prefer Steam's local square icon; fall back to the (rectangular) CDN capsule.
            let icon_data_url = steam_icon_data_url(&steam_path, &app_id);
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
                executable: None,
                details: None,
                state: None,
                icon_data_url,
                icon_url,
                started_at: now_ms(),
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
        let cache = PathBuf::from(steam_path).join("appcache").join("librarycache");

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
        for (_pid, proc_) in sys.processes() {
            let exe_name = proc_.name().to_lowercase();

            // Curated list first, then the user's registered executables.
            let title: Option<String> = DETECTABLES
                .iter()
                .find(|(_, exes)| exes.iter().any(|e| *e == exe_name))
                .map(|(name, _)| (*name).to_string())
                .or_else(|| {
                    custom
                        .iter()
                        .find(|d| d.executables.iter().any(|e| *e == exe_name))
                        .map(|d| d.name.clone())
                });
            let Some(title) = title else {
                continue;
            };
            if out.iter().any(|a| a.name == title) {
                continue;
            }
            let icon_data_url = proc_.exe().and_then(exe_icon_data_url);
            out.push(DetectedActivity {
                source: "process",
                kind: "game",
                name: title,
                app_id: None,
                executable: Some(exe_name),
                details: None,
                state: None,
                icon_data_url,
                icon_url: None,
                started_at: now_ms(),
            });
        }
        out
    }

    pub fn detect_music() -> Option<DetectedActivity> {
        use windows::Media::Control::{
            GlobalSystemMediaTransportControlsSessionManager as SmtcManager,
            GlobalSystemMediaTransportControlsSessionPlaybackStatus as PlaybackStatus,
        };

        let manager = SmtcManager::RequestAsync().ok()?.get().ok()?;
        let session = manager.GetCurrentSession().ok()?;

        let source = session.SourceAppUserModelId().ok()?.to_string();
        if !source.to_lowercase().contains("spotify") {
            return None;
        }

        let playback = session.GetPlaybackInfo().ok()?;
        if playback.PlaybackStatus().ok()? != PlaybackStatus::Playing {
            return None;
        }

        let props = session.TryGetMediaPropertiesAsync().ok()?.get().ok()?;
        let title = props.Title().ok()?.to_string();
        if title.is_empty() {
            return None;
        }
        let artist = props.Artist().ok().map(|s| s.to_string()).unwrap_or_default();

        let icon_data_url = read_thumbnail(&props);

        Some(DetectedActivity {
            source: "smtc",
            kind: "music",
            name: "Spotify".to_string(),
            app_id: None,
            executable: None,
            details: Some(title),
            state: if artist.is_empty() { None } else { Some(artist) },
            icon_data_url,
            icon_url: None,
            started_at: now_ms(),
        })
    }

    fn read_thumbnail(
        props: &windows::Media::Control::GlobalSystemMediaTransportControlsSessionMediaProperties,
    ) -> Option<String> {
        use windows::Storage::Streams::DataReader;

        let thumb_ref = props.Thumbnail().ok()?;
        let stream = thumb_ref.OpenReadAsync().ok()?.get().ok()?;
        let size = stream.Size().ok()?;
        if size == 0 || size > 4_000_000 {
            return None;
        }
        let content_type = stream
            .ContentType()
            .map(|s| s.to_string())
            .unwrap_or_else(|_| "image/jpeg".to_string());

        let input = stream.GetInputStreamAt(0).ok()?;
        let reader = DataReader::CreateDataReader(&input).ok()?;
        reader.LoadAsync(size as u32).ok()?.get().ok()?;
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
