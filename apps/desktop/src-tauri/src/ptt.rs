use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};

use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};

use crate::AppState;

/// Push-to-talk binding, matching the shape persisted by the web settings store.
#[derive(Clone, Deserialize)]
#[serde(tag = "type")]
pub enum Binding {
    #[serde(rename = "key")]
    Key { key: String },
    #[serde(rename = "mouse")]
    Mouse { button: i64 },
}

/// Global push-to-talk listener state. A single `rdev` listener thread is spawned
/// lazily on first use and stays alive for the process lifetime; enabling/disabling
/// and rebinding is done by mutating the shared atomics/binding it reads.
pub struct PttState {
    started: Arc<AtomicBool>,
    enabled: Arc<AtomicBool>,
    pressed: Arc<AtomicBool>,
    binding: Arc<Mutex<Option<Binding>>>,
}

impl Default for PttState {
    fn default() -> Self {
        Self {
            started: Arc::new(AtomicBool::new(false)),
            enabled: Arc::new(AtomicBool::new(false)),
            pressed: Arc::new(AtomicBool::new(false)),
            binding: Arc::new(Mutex::new(None)),
        }
    }
}

#[tauri::command]
pub fn set_ptt_binding(app: AppHandle, state: State<AppState>, binding: Binding) {
    let ptt = state.ptt.lock().unwrap();

    *ptt.binding.lock().unwrap() = Some(binding);
    ptt.enabled.store(true, Ordering::SeqCst);

    // Only one listener thread should ever be alive at a time. `swap` makes
    // the check-and-set atomic so concurrent calls can't both spawn one.
    if ptt.started.swap(true, Ordering::SeqCst) {
        return;
    }

    let enabled = ptt.enabled.clone();
    let pressed = ptt.pressed.clone();
    let binding = ptt.binding.clone();
    let started = ptt.started.clone();
    let handle = app.clone();

    std::thread::spawn(move || {
        let error_handle = handle.clone();
        let callback = move |event: rdev::Event| {
            if !enabled.load(Ordering::SeqCst) {
                return;
            }
            let current = binding.lock().unwrap().clone();
            let Some(current) = current else {
                return;
            };

            let (down, matches) = match event.event_type {
                rdev::EventType::KeyPress(key) => (Some(true), match_key(&current, key)),
                rdev::EventType::KeyRelease(key) => (Some(false), match_key(&current, key)),
                rdev::EventType::ButtonPress(button) => (Some(true), match_button(&current, button)),
                rdev::EventType::ButtonRelease(button) => {
                    (Some(false), match_button(&current, button))
                }
                _ => (None, false),
            };

            let Some(down) = down else { return };
            if !matches {
                return;
            }

            if down {
                if !pressed.swap(true, Ordering::SeqCst) {
                    let _ = handle.emit("ptt:down", ());
                }
            } else if pressed.swap(false, Ordering::SeqCst) {
                let _ = handle.emit("ptt:up", ());
            }
        };

        // `rdev::listen` blocks for the lifetime of the process on success; it
        // only returns if the global hook failed to install (e.g. security
        // software blocking low-level input hooks). Surface that instead of
        // silently doing nothing, and clear `started` so a later
        // `set_ptt_binding` call (e.g. reopening voice settings) can retry.
        let result = rdev::listen(callback);
        started.store(false, Ordering::SeqCst);
        if let Err(err) = result {
            let message = format!(
                "Push-to-talk failed to start ({err:?}). Security or antivirus software may be blocking global input hooks."
            );
            let _ = error_handle.emit("ptt:error", message);
        }
    });
}

#[tauri::command]
pub fn clear_ptt(app: AppHandle, state: State<AppState>) {
    let ptt = state.ptt.lock().unwrap();
    ptt.enabled.store(false, Ordering::SeqCst);
    if ptt.pressed.swap(false, Ordering::SeqCst) {
        let _ = app.emit("ptt:up", ());
    }
    *ptt.binding.lock().unwrap() = None;
}

fn match_key(binding: &Binding, key: rdev::Key) -> bool {
    let Binding::Key { key: bound } = binding else {
        return false;
    };
    match rdev_key_to_web(key) {
        Some(mapped) => mapped.eq_ignore_ascii_case(bound),
        None => false,
    }
}

fn match_button(binding: &Binding, button: rdev::Button) -> bool {
    let Binding::Mouse { button: bound } = binding else {
        return false;
    };
    rdev_button_to_index(button).map(|i| i == *bound).unwrap_or(false)
}

/// Maps browser `MouseEvent.button` indices (0=left, 1=middle, 2=right, 3/4=X buttons).
fn rdev_button_to_index(button: rdev::Button) -> Option<i64> {
    match button {
        rdev::Button::Left => Some(0),
        rdev::Button::Middle => Some(1),
        rdev::Button::Right => Some(2),
        rdev::Button::Unknown(1) => Some(3),
        rdev::Button::Unknown(2) => Some(4),
        _ => None,
    }
}

/// Best-effort mapping from `rdev::Key` to the corresponding
/// `KeyboardEvent.key` string the web layer stores for PTT bindings.
fn rdev_key_to_web(key: rdev::Key) -> Option<&'static str> {
    use rdev::Key::*;
    let s = match key {
        Space => " ",
        KeyA => "a",
        KeyB => "b",
        KeyC => "c",
        KeyD => "d",
        KeyE => "e",
        KeyF => "f",
        KeyG => "g",
        KeyH => "h",
        KeyI => "i",
        KeyJ => "j",
        KeyK => "k",
        KeyL => "l",
        KeyM => "m",
        KeyN => "n",
        KeyO => "o",
        KeyP => "p",
        KeyQ => "q",
        KeyR => "r",
        KeyS => "s",
        KeyT => "t",
        KeyU => "u",
        KeyV => "v",
        KeyW => "w",
        KeyX => "x",
        KeyY => "y",
        KeyZ => "z",
        Num0 => "0",
        Num1 => "1",
        Num2 => "2",
        Num3 => "3",
        Num4 => "4",
        Num5 => "5",
        Num6 => "6",
        Num7 => "7",
        Num8 => "8",
        Num9 => "9",
        F1 => "F1",
        F2 => "F2",
        F3 => "F3",
        F4 => "F4",
        F5 => "F5",
        F6 => "F6",
        F7 => "F7",
        F8 => "F8",
        F9 => "F9",
        F10 => "F10",
        F11 => "F11",
        F12 => "F12",
        ControlLeft | ControlRight => "Control",
        ShiftLeft | ShiftRight => "Shift",
        Alt | AltGr => "Alt",
        MetaLeft | MetaRight => "Meta",
        Tab => "Tab",
        CapsLock => "CapsLock",
        Escape => "Escape",
        Return => "Enter",
        Backspace => "Backspace",
        UpArrow => "ArrowUp",
        DownArrow => "ArrowDown",
        LeftArrow => "ArrowLeft",
        RightArrow => "ArrowRight",
        Home => "Home",
        End => "End",
        PageUp => "PageUp",
        PageDown => "PageDown",
        Insert => "Insert",
        Delete => "Delete",
        PrintScreen => "PrintScreen",
        ScrollLock => "ScrollLock",
        Pause => "Pause",
        NumLock => "NumLock",
        // Punctuation/symbol keys (US layout key names, matching what browsers
        // report in KeyboardEvent.key for these physical keys).
        BackQuote => "`",
        Minus => "-",
        Equal => "=",
        LeftBracket => "[",
        RightBracket => "]",
        BackSlash => "\\",
        SemiColon => ";",
        Quote => "'",
        Comma => ",",
        Dot => ".",
        Slash => "/",
        // Numpad. Browsers report the same key string for numpad and main-row
        // digits/operators (NumLock-on case), so these intentionally overlap
        // with the main-row mappings above, consistent with how ControlLeft
        // and ControlRight already both merge into "Control".
        KpReturn => "Enter",
        KpMinus => "-",
        KpPlus => "+",
        KpMultiply => "*",
        KpDivide => "/",
        Kp0 => "0",
        Kp1 => "1",
        Kp2 => "2",
        Kp3 => "3",
        Kp4 => "4",
        Kp5 => "5",
        Kp6 => "6",
        Kp7 => "7",
        Kp8 => "8",
        Kp9 => "9",
        KpDelete => "Delete",
        // IntlBackslash (layout-dependent, no reliable single mapping) and
        // Function/Unknown (not exposed as a browser KeyboardEvent) are left
        // unmapped; bindings to these keys will simply never match.
        _ => return None,
    };
    Some(s)
}
