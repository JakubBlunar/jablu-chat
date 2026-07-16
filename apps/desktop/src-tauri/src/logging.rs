//! Lightweight file logging + panic capture.
//!
//! Release builds use the Windows GUI subsystem, so there's no console to print
//! to — a startup panic just vanishes (the process exits with code 101). To make
//! those diagnosable we install a panic hook that appends the panic message and a
//! backtrace to a log file, plus a small `log()` helper for lifecycle breadcrumbs.
//!
//! Log location: %LOCALAPPDATA%\Jablu\logs\jablu.log (falls back to the temp dir).

use std::fs::{create_dir_all, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::time::{SystemTime, UNIX_EPOCH};

fn log_file() -> Option<PathBuf> {
    let base = std::env::var_os("LOCALAPPDATA")
        .map(PathBuf::from)
        .or_else(|| std::env::var_os("HOME").map(PathBuf::from))
        .or_else(|| Some(std::env::temp_dir()))?;
    let dir = base.join("Jablu").join("logs");
    create_dir_all(&dir).ok()?;
    Some(dir.join("jablu.log"))
}

fn timestamp() -> String {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_millis().to_string())
        .unwrap_or_else(|_| "0".to_string())
}

/// Append a line to the log file. Best-effort: never panics, never blocks setup.
pub fn log(msg: &str) {
    if let Some(path) = log_file() {
        if let Ok(mut f) = OpenOptions::new().create(true).append(true).open(path) {
            let _ = writeln!(f, "[{}] {msg}", timestamp());
        }
    }
}

/// Install the panic hook and record app start. Call this first thing in `run()`.
pub fn init() {
    // Force a backtrace so the hook can capture one, unless the user overrode it.
    if std::env::var_os("RUST_BACKTRACE").is_none() {
        std::env::set_var("RUST_BACKTRACE", "1");
    }

    let default_hook = std::panic::take_hook();
    std::panic::set_hook(Box::new(move |info| {
        let backtrace = std::backtrace::Backtrace::force_capture();
        log(&format!("PANIC: {info}\nbacktrace:\n{backtrace}"));
        default_hook(info);
    }));

    log("=== app starting ===");
}
