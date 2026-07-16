//! Auto-approve WebView2 media/notification permission prompts.
//!
//! On the web the browser must ask the user before granting microphone, camera,
//! or notification access. Inside the desktop shell that prompt is redundant
//! friction — the user already trusts the installed app — so we grant those up
//! front and leave every other permission kind to WebView2's default handling.
//!
//! We do this two ways, because they cover different situations:
//!   1. A `PermissionRequested` handler that allows the prompt when it fires.
//!      This only helps the *first* time, when WebView2 has no stored decision.
//!   2. A persistent pre-grant via `ICoreWebView2Profile4::SetPermissionState`,
//!      which writes an "allow" into the profile for our origin. This is the
//!      reliable path: once WebView2 has cached a decision (e.g. the user once
//!      dismissed the camera prompt, storing a "deny"), the event above never
//!      fires again, so camera would keep failing without an explicit override.
//!
//! Note: this only covers the in-webview prompt. The OS-level microphone/camera
//! privacy settings (Windows Settings → Privacy) are separate and still apply.

/// Register a WebView2 permission handler and pre-grant mic/camera/notifications.
#[cfg(windows)]
pub fn auto_grant_media(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2PermissionRequestedEventArgs, ICoreWebView2Profile4,
        ICoreWebView2_13, COREWEBVIEW2_PERMISSION_KIND_CAMERA,
        COREWEBVIEW2_PERMISSION_KIND_MICROPHONE, COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS,
        COREWEBVIEW2_PERMISSION_KIND_UNKNOWN_PERMISSION, COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::{PermissionRequestedEventHandler, SetPermissionStateCompletedHandler};
    use windows::core::{Interface, PCWSTR};

    let _ = window.with_webview(|webview| unsafe {
        let controller = webview.controller();
        let core = match controller.CoreWebView2() {
            Ok(core) => core,
            Err(_) => return,
        };

        // 1. Request-time fallback: allow the prompt if WebView2 ever asks.
        let handler = PermissionRequestedEventHandler::create(Box::new(
            |_sender: Option<ICoreWebView2>,
             args: Option<ICoreWebView2PermissionRequestedEventArgs>|
             -> windows::core::Result<()> {
                if let Some(args) = args {
                    let mut kind = COREWEBVIEW2_PERMISSION_KIND_UNKNOWN_PERMISSION;
                    args.PermissionKind(&mut kind)?;
                    if kind == COREWEBVIEW2_PERMISSION_KIND_MICROPHONE
                        || kind == COREWEBVIEW2_PERMISSION_KIND_CAMERA
                        || kind == COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS
                    {
                        args.SetState(COREWEBVIEW2_PERMISSION_STATE_ALLOW)?;
                    }
                }
                Ok(())
            },
        ));
        // WebView2's `add_PermissionRequested` takes the registration token as a
        // raw `*mut i64`; we never unregister, so a throwaway is fine.
        let mut token: i64 = 0;
        let _ = core.add_PermissionRequested(&handler, &mut token);

        // 2. Persistent pre-grant, overriding any previously cached decision.
        //    (`Profile()` is unsafe, so it must stay inside this `unsafe` block
        //    rather than move into a combinator closure.)
        let profile4 = match core.cast::<ICoreWebView2_13>() {
            Ok(w13) => match w13.Profile() {
                Ok(profile) => profile.cast::<ICoreWebView2Profile4>().ok(),
                Err(_) => None,
            },
            Err(_) => None,
        };
        if let Some(profile4) = profile4 {
            let kinds = [
                COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
                COREWEBVIEW2_PERMISSION_KIND_CAMERA,
                COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS,
            ];
            // Tauri serves the app from tauri.localhost; grant both schemes so the
            // pre-grant matches whichever origin WebView2 reports for the page.
            let origins = ["http://tauri.localhost", "https://tauri.localhost"];
            for kind in kinds {
                for origin in origins {
                    // Keep the wide buffer alive for the duration of the call.
                    let wide: Vec<u16> =
                        origin.encode_utf16().chain(std::iter::once(0)).collect();
                    let done =
                        SetPermissionStateCompletedHandler::create(Box::new(|_hr| Ok(())));
                    let _ = profile4.SetPermissionState(
                        kind,
                        PCWSTR(wide.as_ptr()),
                        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
                        &done,
                    );
                }
            }
        }
    });
}

#[cfg(not(windows))]
pub fn auto_grant_media(_window: &tauri::WebviewWindow) {}
