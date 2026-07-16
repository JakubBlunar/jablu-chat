mod config;
mod notifications;
mod permissions;
mod ptt;
mod updater;

use std::sync::Mutex;

use tauri::{
    menu::{Menu, MenuItem},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Emitter, Manager, WindowEvent,
};

/// Shared application state, accessible from Tauri commands via `State<AppState>`.
pub struct AppState {
    pub ptt: Mutex<ptt::PttState>,
    pub update: Mutex<updater::UpdateState>,
}

#[tauri::command]
fn get_platform() -> String {
    // Mirror Electron's `process.platform` value so the web layer's platform
    // checks behave identically.
    "win32".to_string()
}

#[tauri::command]
fn get_version(app: AppHandle) -> String {
    app.package_info().version.to_string()
}

#[tauri::command]
fn show_notification(app: AppHandle, title: String, body: String, url: Option<String>) {
    // The toast's own click handler focuses the window and emits `navigate`, so
    // deep-linking works when the user clicks the notification (see notifications.rs).
    notifications::show(&app, &title, &body, url);

    if let Some(window) = app.get_webview_window("main") {
        if !window.is_focused().unwrap_or(false) {
            let _ = window.request_user_attention(Some(tauri::UserAttentionType::Informational));
        }
    }
}

#[tauri::command]
fn set_tray_unread(app: AppHandle, count: i64) {
    if let Some(tray) = app.tray_by_id("main") {
        let tooltip = if count > 0 {
            format!("Jablu ({count} unread)")
        } else {
            "Jablu".to_string()
        };
        let _ = tray.set_tooltip(Some(&tooltip));
    }
}

#[tauri::command]
fn get_auto_launch(app: AppHandle) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    app.autolaunch().is_enabled().unwrap_or(false)
}

#[tauri::command]
fn set_auto_launch(app: AppHandle, enabled: bool) -> bool {
    use tauri_plugin_autostart::ManagerExt;
    let manager = app.autolaunch();
    if enabled {
        let _ = manager.enable();
    } else {
        let _ = manager.disable();
    }
    manager.is_enabled().unwrap_or(false)
}

fn setup_tray(app: &AppHandle) -> tauri::Result<()> {
    let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
    let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
    let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

    let icon = app
        .default_window_icon()
        .cloned()
        .expect("app should have a default window icon");

    TrayIconBuilder::with_id("main")
        .icon(icon)
        .tooltip("Jablu")
        .menu(&menu)
        .show_menu_on_left_click(false)
        .on_menu_event(|app, event| match event.id.as_ref() {
            "show" => show_main_window(app),
            "quit" => app.exit(0),
            _ => {}
        })
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::DoubleClick {
                button: MouseButton::Left,
                ..
            } = event
            {
                show_main_window(tray.app_handle());
            }
        })
        .build(app)?;

    Ok(())
}

fn show_main_window(app: &AppHandle) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.unminimize();
        let _ = window.show();
        let _ = window.set_focus();
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }))
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            ptt: Mutex::new(ptt::PttState::default()),
            update: Mutex::new(updater::UpdateState::default()),
        })
        .setup(|app| {
            let handle = app.handle().clone();
            setup_tray(&handle)?;

            if let Some(window) = app.get_webview_window("main") {
                let hide_target = window.clone();
                window.on_window_event(move |event| {
                    // Hide to tray instead of quitting when the user closes the window.
                    if let WindowEvent::CloseRequested { api, .. } = event {
                        api.prevent_close();
                        let _ = hide_target.hide();
                    }
                });

                // Silently allow the WebView2 mic/camera prompts so voice/video
                // works without the user clicking "grant access" each session.
                permissions::auto_grant_media(&window);

                let _ = window.show();
                let _ = window.set_focus();
            }

            updater::start_auto_update(handle);
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_platform,
            get_version,
            show_notification,
            set_tray_unread,
            get_auto_launch,
            set_auto_launch,
            config::set_server_url,
            config::get_server_url,
            config::test_server_url,
            updater::check_for_updates,
            updater::install_update,
            updater::get_update_status,
            ptt::set_ptt_binding,
            ptt::clear_ptt
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Re-exported for the notification click handler wiring (currently unused on
/// Windows, kept for parity with the web bridge `onNavigate`).
#[allow(dead_code)]
pub fn emit_navigate(app: &AppHandle, url: &str) {
    let _ = app.emit("navigate", url);
}
