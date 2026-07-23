//! Native notifications with click-to-navigate.
//!
//! `tauri-plugin-notification` can show a toast but gives us no way to react when
//! the user clicks it, so a click neither focused the window nor deep-linked to
//! the message. We instead drive the Windows toast through `tauri-winrt-notification`,
//! whose `on_activated` callback fires in-process while the app is running — which
//! is exactly when we show these toasts (only when the window isn't focused).
//!
//! On click we surface the window and emit a `navigate` event carrying the target
//! path; the web layer (`setupElectronNavigation`) turns that into a hash-route
//! change, so the user lands on the channel the notification pointed at.

/// Pin the process AppUserModelID (AUMID) to the bundle identifier and register
/// it under HKCU.
///
/// An unpackaged (NSIS-installed) Win32 app only receives a foreground toast's
/// in-process `Activated` event if the *process* AUMID matches the AUMID the
/// toast was created with. Tauri's shortcut carries the AUMID so toasts render,
/// but without `SetCurrentProcessExplicitAppUserModelID` Windows never routes the
/// click back to us — so clicking a notification did nothing and it lingered in
/// Action Center. Registering the AUMID under HKCU additionally makes toast
/// rendering/persistence robust against a missing or stale shortcut property.
#[cfg(windows)]
pub fn register_aumid(app: &tauri::AppHandle) {
    let aumid = app.config().identifier.clone();

    // 1. Match the process AUMID to the toast AUMID so in-process activation is
    //    delivered to this running process.
    unsafe {
        use windows::core::HSTRING;
        use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
        if let Err(e) = SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(aumid.as_str())) {
            eprintln!("failed to set process AUMID: {e}");
        }
    }

    // 2. Self-healing per-user AUMID registration (no admin) so Action Center
    //    renders/persists our toasts regardless of shortcut state or launch path.
    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok((key, _)) =
        hkcu.create_subkey(format!("Software\\Classes\\AppUserModelId\\{aumid}"))
    {
        let _ = key.set_value("DisplayName", &"Jablu");
    }
}

#[cfg(not(windows))]
pub fn register_aumid(_app: &tauri::AppHandle) {}

/// Show a notification and, on click, focus the window and navigate to `url`.
#[cfg(windows)]
pub fn show(app: &tauri::AppHandle, title: &str, body: &str, url: Option<String>) {
    use tauri::Manager;
    use tauri_winrt_notification::Toast;

    let app_id = app_user_model_id(app);
    let app_handle = app.clone();

    let toast = Toast::new(&app_id)
        .title(title)
        .text1(body)
        .on_activated(move |_action| {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.unminimize();
                let _ = window.show();
                let _ = window.set_focus();
            }
            if let Some(url) = &url {
                use tauri::Emitter;
                let _ = app_handle.emit("navigate", url.clone());
            }
            Ok(())
        });

    if let Err(e) = toast.show() {
        eprintln!("failed to show toast notification: {e}");
    }
}

/// Pick the AppUserModelID the same way `tauri-plugin-notification` does: the
/// installed build has a Start Menu shortcut whose AUMID equals the bundle
/// identifier, so use that there. In `tauri dev` the exe lives under `target/`
/// with no such shortcut, so fall back to the always-registered PowerShell AUMID
/// — otherwise Windows may refuse to display the toast (and click activation
/// still fires in-process either way).
#[cfg(windows)]
fn app_user_model_id(app: &tauri::AppHandle) -> String {
    use tauri_winrt_notification::Toast;

    let is_installed = std::env::current_exe()
        .ok()
        .and_then(|exe| exe.parent().map(|dir| dir.to_string_lossy().to_lowercase()))
        .map(|dir| !(dir.ends_with(r"target\debug") || dir.ends_with(r"target\release")))
        .unwrap_or(true);

    if is_installed {
        app.config().identifier.clone()
    } else {
        Toast::POWERSHELL_APP_ID.to_string()
    }
}

/// Non-Windows fallback: use the notification plugin (no click handling).
#[cfg(not(windows))]
pub fn show(app: &tauri::AppHandle, title: &str, body: &str, _url: Option<String>) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}
