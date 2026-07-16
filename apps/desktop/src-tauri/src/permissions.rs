//! Auto-approve WebView2 media/notification permission prompts.
//!
//! On the web the browser must ask the user before granting microphone, camera,
//! or notification access. Inside the desktop shell that prompt is redundant
//! friction — the user already trusts the installed app — so we intercept
//! WebView2's `PermissionRequested` event and silently allow those requests.
//! Every other permission kind is left to WebView2's default handling.
//!
//! Note: this only covers the in-webview prompt. The OS-level microphone/camera
//! privacy settings (Windows Settings → Privacy) are separate and still apply.

/// Register a WebView2 permission handler that auto-grants mic/camera/notifications.
#[cfg(windows)]
pub fn auto_grant_media(window: &tauri::WebviewWindow) {
    use webview2_com::Microsoft::Web::WebView2::Win32::{
        ICoreWebView2, ICoreWebView2PermissionRequestedEventArgs,
        COREWEBVIEW2_PERMISSION_KIND_CAMERA, COREWEBVIEW2_PERMISSION_KIND_MICROPHONE,
        COREWEBVIEW2_PERMISSION_KIND_NOTIFICATIONS, COREWEBVIEW2_PERMISSION_KIND_UNKNOWN_PERMISSION,
        COREWEBVIEW2_PERMISSION_STATE_ALLOW,
    };
    use webview2_com::PermissionRequestedEventHandler;

    let _ = window.with_webview(|webview| unsafe {
        let controller = webview.controller();
        let core = match controller.CoreWebView2() {
            Ok(core) => core,
            Err(_) => return,
        };

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
    });
}

#[cfg(not(windows))]
pub fn auto_grant_media(_window: &tauri::WebviewWindow) {}
