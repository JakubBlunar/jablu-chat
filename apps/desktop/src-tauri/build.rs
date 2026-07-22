fn main() {
    // The server URL is baked in via option_env!("VITE_SERVER_URL"); rebuild when
    // it changes so a new release URL is not silently cached from a prior build.
    println!("cargo:rerun-if-env-changed=VITE_SERVER_URL");
    tauri_build::build()
}
