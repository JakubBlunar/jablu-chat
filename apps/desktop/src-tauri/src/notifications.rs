//! Native notifications with click-to-navigate.
//!
//! `tauri-plugin-notification` can show a toast but gives us no way to react when
//! the user clicks it, so a click neither focused the window nor deep-linked to
//! the message. We drive the Windows toast through the `windows` crate directly,
//! whose `Activated` callback fires in-process while the app is running — which is
//! exactly when we show these toasts.
//!
//! On click we surface the window and emit a `navigate` event carrying the target
//! path; the web layer (`setupElectronNavigation`) hands that to the router, so the
//! user lands on the channel the notification pointed at.
//!
//! Two Windows requirements govern the shape of this module:
//!
//! 1. **The AUMID must match.** An unpackaged Win32 app only receives a toast's
//!    in-process `Activated` event if the *process* AUMID equals the AUMID the
//!    toast was created with. `register_aumid` pins the process AUMID and writes
//!    the matching HKCU registration, and `show` uses that one identifier
//!    unconditionally — including in `tauri dev`, which previously fell back to
//!    PowerShell's AUMID and routed every click into the void.
//! 2. **The notification object must stay alive.** Activation is delivered to the
//!    `ToastNotification` instance, so dropping it at the end of `show` silently
//!    disables the callback. Live toasts are therefore parked in `LIVE_TOASTS`
//!    until they are dismissed, activated, or fail.

/// Pin the process AppUserModelID (AUMID) to the bundle identifier and register
/// it under HKCU.
///
/// Registering under HKCU additionally makes toast rendering and Action Center
/// persistence robust against a missing or stale Start Menu shortcut, which is
/// what makes it safe to use the real identifier during development.
#[cfg(windows)]
pub fn register_aumid(app: &tauri::AppHandle) {
    let aumid = app.config().identifier.clone();

    unsafe {
        use windows::core::HSTRING;
        use windows::Win32::UI::Shell::SetCurrentProcessExplicitAppUserModelID;
        if let Err(e) = SetCurrentProcessExplicitAppUserModelID(&HSTRING::from(aumid.as_str())) {
            crate::logging::log(&format!("notif: failed to set process AUMID: {e}"));
        }
    }

    use winreg::enums::HKEY_CURRENT_USER;
    use winreg::RegKey;
    let hkcu = RegKey::predef(HKEY_CURRENT_USER);
    if let Ok((key, _)) = hkcu.create_subkey(format!("Software\\Classes\\AppUserModelId\\{aumid}"))
    {
        let _ = key.set_value("DisplayName", &"Jablu");
    }

    crate::logging::log(&format!("notif: AUMID registered as {aumid}"));
}

#[cfg(not(windows))]
pub fn register_aumid(_app: &tauri::AppHandle) {}

#[cfg(windows)]
mod win {
    use std::collections::HashMap;
    use std::sync::{Mutex, OnceLock};

    use tauri::{AppHandle, Emitter, Manager};
    use windows::core::{Interface, HSTRING};
    use windows::Data::Xml::Dom::XmlDocument;
    use windows::Foundation::TypedEventHandler;
    use windows::UI::Notifications::{
        ToastActivatedEventArgs, ToastDismissedEventArgs, ToastFailedEventArgs, ToastNotification,
        ToastNotificationManager,
    };

    /// Toasts currently on screen, keyed by tag.
    ///
    /// Windows delivers activation to the `ToastNotification` object itself, so it
    /// has to outlive the call that showed it. Entries are removed once the toast
    /// is activated, dismissed, or fails, which bounds the map to what is visible.
    static LIVE_TOASTS: OnceLock<Mutex<HashMap<String, ToastNotification>>> = OnceLock::new();

    fn live_toasts() -> &'static Mutex<HashMap<String, ToastNotification>> {
        LIVE_TOASTS.get_or_init(|| Mutex::new(HashMap::new()))
    }

    fn forget(tag: &str) {
        if let Ok(mut map) = live_toasts().lock() {
            map.remove(tag);
        }
    }

    /// Windows tags and groups are limited to 64 characters, and a channel URL can
    /// exceed that, so hash anything too long into a stable short key.
    fn sanitize_tag(raw: &str) -> String {
        if raw.len() <= 60 && raw.is_ascii() {
            return raw.replace(|c: char| !c.is_ascii_alphanumeric() && c != '-', "-");
        }
        let mut hash: u64 = 0xcbf2_9ce4_8422_2325;
        for byte in raw.as_bytes() {
            hash ^= *byte as u64;
            hash = hash.wrapping_mul(0x1000_0000_01b3);
        }
        format!("t{hash:x}")
    }

    fn escape_xml(value: &str) -> String {
        value
            .replace('&', "&amp;")
            .replace('<', "&lt;")
            .replace('>', "&gt;")
            .replace('"', "&quot;")
    }

    pub fn show(
        app: &AppHandle,
        title: &str,
        body: &str,
        url: Option<String>,
        tag: Option<String>,
    ) {
        let aumid = app.config().identifier.clone();
        let tag = sanitize_tag(tag.as_deref().unwrap_or(title));

        if let Err(e) = show_inner(app, &aumid, title, body, url, &tag) {
            crate::logging::log(&format!("notif: failed to show toast ({tag}): {e}"));
        }
    }

    fn show_inner(
        app: &AppHandle,
        aumid: &str,
        title: &str,
        body: &str,
        url: Option<String>,
        tag: &str,
    ) -> windows::core::Result<()> {
        let xml = XmlDocument::new()?;
        xml.LoadXml(&HSTRING::from(format!(
            r#"<toast><visual><binding template="ToastGeneric"><text>{}</text><text>{}</text></binding></visual></toast>"#,
            escape_xml(title),
            escape_xml(body)
        )))?;

        let toast = ToastNotification::CreateToastNotification(&xml)?;
        // Tag and group make the toast addressable afterwards: repeat messages for
        // one channel replace each other instead of stacking, and reading elsewhere
        // can pull it out of the Action Center (see `dismiss`).
        toast.SetTag(&HSTRING::from(tag))?;
        toast.SetGroup(&HSTRING::from("jablu"))?;

        let activated_app = app.clone();
        let activated_tag = tag.to_string();
        toast.Activated(&TypedEventHandler::new(
            move |_: windows::core::Ref<'_, ToastNotification>,
                  args: windows::core::Ref<'_, windows::core::IInspectable>| {
                let action = args
                    .as_ref()
                    .and_then(|a| a.cast::<ToastActivatedEventArgs>().ok())
                    .and_then(|a| a.Arguments().ok())
                    .map(|s| s.to_string())
                    .unwrap_or_default();
                crate::logging::log(&format!(
                    "notif: toast activated (tag={activated_tag}, action={action})"
                ));

                if let Some(window) = activated_app.get_webview_window("main") {
                    let _ = window.unminimize();
                    let _ = window.show();
                    let _ = window.set_focus();
                }
                if let Some(url) = &url {
                    crate::logging::log(&format!("notif: emitting navigate -> {url}"));
                    match activated_app.emit("navigate", url.clone()) {
                        Ok(()) => crate::logging::log("notif: navigate emitted"),
                        Err(e) => crate::logging::log(&format!("notif: navigate emit failed: {e}")),
                    }
                } else {
                    crate::logging::log("notif: toast had no url, nothing to navigate to");
                }

                forget(&activated_tag);
                Ok(())
            },
        ))?;

        let dismissed_tag = tag.to_string();
        toast.Dismissed(&TypedEventHandler::new(
            move |_: windows::core::Ref<'_, ToastNotification>,
                  args: windows::core::Ref<'_, ToastDismissedEventArgs>| {
                let reason = args
                    .as_ref()
                    .and_then(|a| a.Reason().ok())
                    .map(|r| format!("{r:?}"))
                    .unwrap_or_else(|| "unknown".to_string());
                crate::logging::log(&format!(
                    "notif: toast dismissed (tag={dismissed_tag}, reason={reason})"
                ));
                forget(&dismissed_tag);
                Ok(())
            },
        ))?;

        let failed_tag = tag.to_string();
        toast.Failed(&TypedEventHandler::new(
            move |_: windows::core::Ref<'_, ToastNotification>,
                  args: windows::core::Ref<'_, ToastFailedEventArgs>| {
                let error = args
                    .as_ref()
                    .and_then(|a| a.ErrorCode().ok())
                    .map(|e| format!("{e:?}"))
                    .unwrap_or_else(|| "unknown".to_string());
                crate::logging::log(&format!(
                    "notif: toast failed (tag={failed_tag}, error={error})"
                ));
                forget(&failed_tag);
                Ok(())
            },
        ))?;

        ToastNotificationManager::CreateToastNotifierWithId(&HSTRING::from(aumid))?.Show(&toast)?;

        if let Ok(mut map) = live_toasts().lock() {
            map.insert(tag.to_string(), toast);
        }
        crate::logging::log(&format!("notif: toast shown (tag={tag})"));
        Ok(())
    }

    /// Pulls a toast out of the Action Center, so reading the message on another
    /// device clears the stale desktop notification too.
    pub fn dismiss(app: &AppHandle, tag: &str) {
        let tag = sanitize_tag(tag);
        forget(&tag);

        let aumid = app.config().identifier.clone();
        let result = (|| -> windows::core::Result<()> {
            ToastNotificationManager::History()?.RemoveGroupedTagWithId(
                &HSTRING::from(tag.as_str()),
                &HSTRING::from("jablu"),
                &HSTRING::from(aumid.as_str()),
            )
        })();
        if let Err(e) = result {
            crate::logging::log(&format!("notif: failed to remove toast ({tag}): {e}"));
        }
    }
}

#[cfg(windows)]
pub fn show(
    app: &tauri::AppHandle,
    title: &str,
    body: &str,
    url: Option<String>,
    tag: Option<String>,
) {
    win::show(app, title, body, url, tag);
}

#[cfg(windows)]
pub fn dismiss(app: &tauri::AppHandle, tag: &str) {
    win::dismiss(app, tag);
}

/// Non-Windows fallback: use the notification plugin (no click handling).
#[cfg(not(windows))]
pub fn show(
    app: &tauri::AppHandle,
    title: &str,
    body: &str,
    _url: Option<String>,
    _tag: Option<String>,
) {
    use tauri_plugin_notification::NotificationExt;
    let _ = app.notification().builder().title(title).body(body).show();
}

#[cfg(not(windows))]
pub fn dismiss(_app: &tauri::AppHandle, _tag: &str) {}
