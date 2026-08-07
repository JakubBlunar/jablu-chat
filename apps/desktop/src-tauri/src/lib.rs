mod activity;
mod badges;
mod config;
mod logging;
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
use tauri_plugin_window_state::{AppHandleExt, StateFlags};

/// Shared application state, accessible from Tauri commands via `State<AppState>`.
pub struct AppState {
    pub ptt: Mutex<ptt::PttState>,
    pub update: Mutex<updater::UpdateState>,
    pub activity: Mutex<activity::ActivityState>,
}

/// Window state we persist. Everything except VISIBLE — we decide whether to show
/// the window ourselves in `setup` (it starts hidden on autostart).
fn persisted_state_flags() -> StateFlags {
    StateFlags::all().difference(StateFlags::VISIBLE)
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
fn show_notification(
    app: AppHandle,
    title: String,
    body: String,
    url: Option<String>,
    tag: Option<String>,
) {
    // The toast's own click handler focuses the window and emits `navigate`, so
    // deep-linking works when the user clicks the notification (see notifications.rs).
    notifications::show(&app, &title, &body, url, tag);

    if let Some(window) = app.get_webview_window("main") {
        if !window.is_focused().unwrap_or(false) {
            // Critical, not Informational: Informational flashes once and settles,
            // so a message that arrives while you are in another app leaves no trace
            // on the taskbar. Critical keeps the button highlighted until you look.
            let _ = window.request_user_attention(Some(tauri::UserAttentionType::Critical));
        }
    }
}

#[tauri::command]
fn dismiss_notification(app: AppHandle, tag: String) {
    notifications::dismiss(&app, &tag);
}

/// Native window state, mirrored to the web layer so it can tell "hidden in the
/// tray" from "on screen" — a distinction the webview's own `visibilityState`
/// does not make reliably.
#[derive(Clone, serde::Serialize)]
pub struct WindowState {
    pub visible: bool,
    pub minimized: bool,
    pub focused: bool,
}

fn current_window_state(app: &AppHandle) -> WindowState {
    match app.get_webview_window("main") {
        Some(window) => WindowState {
            visible: window.is_visible().unwrap_or(true),
            minimized: window.is_minimized().unwrap_or(false),
            focused: window.is_focused().unwrap_or(false),
        },
        None => WindowState {
            visible: false,
            minimized: false,
            focused: false,
        },
    }
}

#[tauri::command]
fn get_window_state(app: AppHandle) -> WindowState {
    current_window_state(&app)
}

/// Publishes the current window state. Called after every transition we control
/// (hide, show, minimise, focus) — the web layer de-duplicates, so over-emitting
/// is cheaper than missing a transition and mis-reporting presence.
fn emit_window_state(app: &AppHandle) {
    let _ = app.emit("window-state", current_window_state(app));
}

#[tauri::command]
fn restart_app(app: AppHandle) {
    // Relaunches the app. Handy for applying a downloaded update or recovering
    // from a bad state without hunting for the exe.
    app.restart();
}

/// Reflects the unread count everywhere a glance can reach it: the tray tooltip,
/// a dot burned into the tray icon, and a taskbar overlay badge. The tooltip alone
/// required hovering, which is no use for noticing that something arrived.
#[tauri::command]
fn set_tray_unread(app: AppHandle, count: i64) {
    let has_unread = count > 0;

    if let Some(tray) = app.tray_by_id("main") {
        let tooltip = if has_unread {
            format!("Jablu ({count} unread)")
        } else {
            "Jablu".to_string()
        };
        let _ = tray.set_tooltip(Some(&tooltip));

        if let Some(base) = app.default_window_icon().cloned() {
            let icon = if has_unread {
                badges::with_corner_dot(&base)
            } else {
                Some(base)
            };
            if let Some(icon) = icon {
                let _ = tray.set_icon(Some(icon));
            }
        }
    }

    #[cfg(windows)]
    if let Some(window) = app.get_webview_window("main") {
        let overlay = if has_unread {
            badges::unread_overlay()
        } else {
            None
        };
        let _ = window.set_overlay_icon(overlay);
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
            "quit" => {
                // The window is hidden (not destroyed) on close, so the window-state
                // plugin's on-destroy save never runs. Persist explicitly before exit
                // so size/position survive across restarts.
                let _ = app.save_window_state(persisted_state_flags());
                app.exit(0);
            }
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
        emit_window_state(app);
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    logging::init();

    let result = tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, _argv, _cwd| {
            show_main_window(app);
        }))
        .plugin(
            tauri_plugin_window_state::Builder::default()
                // Restore size/position/maximized, but never visibility — we decide
                // whether to show the window in `setup` (hidden on autostart).
                .with_state_flags(
                    tauri_plugin_window_state::StateFlags::all()
                        .difference(tauri_plugin_window_state::StateFlags::VISIBLE),
                )
                .build(),
        )
        // Frameless chrome: overlays themeable min/max/close controls while keeping
        // native Windows Snap Layouts, aero snap, and edge resizing. `auto_titlebar`
        // applies it to the main window automatically; the close button routes through
        // our CloseRequested handler above (hide-to-tray).
        .plugin(
            tauri_plugin_frame::FramePluginBuilder::new()
                .auto_titlebar(true)
                .titlebar_height(32)
                // The app is always dark; pin the caption-button hover background
                // so it stays visible even when Windows is in light mode (the
                // plugin otherwise picks a near-invisible light-mode hover).
                .button_hover_bg("rgba(255,255,255,0.12)")
                .close_hover_bg("rgba(232,17,35,0.9)")
                .build(),
        )
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::default().build())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            // Login-launched instances get this flag so we can start hidden in the
            // tray; a manual launch has no args and shows the window normally.
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            ptt: Mutex::new(ptt::PttState::default()),
            update: Mutex::new(updater::UpdateState::default()),
            activity: Mutex::new(activity::ActivityState::default()),
        })
        .setup(|app| {
            logging::log("setup: begin");
            let handle = app.handle().clone();
            // Pin the process AUMID before anything shows a toast, so notification
            // clicks activate in-process (focus + deep-link) and don't linger.
            notifications::register_aumid(&handle);
            setup_tray(&handle)?;
            logging::log("setup: tray ready");

            // On login the autostart entry passes `--minimized`. Whether we actually
            // stay in the tray then is up to the user's preference (default: yes). The
            // webview still initializes below, so the app connects and shows
            // notifications without a visible window.
            let start_minimized = std::env::args().any(|arg| arg == "--minimized")
                && config::get_stored_start_minimized(&handle);

            if let Some(window) = app.get_webview_window("main") {
                // Belt-and-suspenders: the custom title bar (tauri-plugin-frame)
                // requires a borderless window. `decorations: false` is set in the
                // config, but enforce it at runtime too so a stale build can never
                // leave the native title bar stacked above our custom one.
                let _ = window.set_decorations(false);

                let hide_target = window.clone();
                window.on_window_event(move |event| {
                    match event {
                        // Hide to tray instead of quitting when the user closes the window.
                        WindowEvent::CloseRequested { api, .. } => {
                            api.prevent_close();
                            // Capture the current size/position before hiding, so it is
                            // preserved even if the process is later killed while in tray.
                            let _ = hide_target
                                .app_handle()
                                .save_window_state(persisted_state_flags());
                            let _ = hide_target.hide();
                        }
                        // Minimise and restore arrive as a resize, not a dedicated
                        // event, so the state has to be re-read rather than inferred.
                        WindowEvent::Focused(_) | WindowEvent::Resized(_) => {}
                        _ => return,
                    }
                    emit_window_state(hide_target.app_handle());
                });

                if start_minimized {
                    logging::log("setup: starting minimized to tray");
                } else {
                    // Show the window before touching WebView2 permissions so a slow or
                    // failing permission call can never leave the user with no window.
                    let _ = window.show();
                    let _ = window.set_focus();
                    logging::log("setup: window shown");
                }
                emit_window_state(&handle);

                // Silently allow the WebView2 mic/camera prompts so voice/video
                // works without the user clicking "grant access" each session.
                permissions::auto_grant_media(&window);
                logging::log("setup: permissions configured");
            }

            updater::start_auto_update(handle);
            logging::log("setup: done");
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_platform,
            get_version,
            show_notification,
            dismiss_notification,
            get_window_state,
            restart_app,
            set_tray_unread,
            get_auto_launch,
            set_auto_launch,
            config::get_start_minimized,
            config::set_start_minimized,
            updater::check_for_updates,
            updater::install_update,
            updater::get_update_status,
            ptt::set_ptt_binding,
            ptt::clear_ptt,
            activity::set_activity_detection_enabled,
            activity::get_detected_activities,
            activity::set_custom_detectables
        ])
        .run(tauri::generate_context!());

    if let Err(e) = result {
        logging::log(&format!("FATAL: error while running tauri application: {e:?}"));
        panic!("error while running tauri application: {e:?}");
    }
}

/// Re-exported for the notification click handler wiring (currently unused on
/// Windows, kept for parity with the web bridge `onNavigate`).
#[allow(dead_code)]
pub fn emit_navigate(app: &AppHandle, url: &str) {
    let _ = app.emit("navigate", url);
}
