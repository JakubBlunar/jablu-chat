# Releasing the Jablu Desktop App (Tauri, Windows)

The desktop app is a Tauri v2 shell around the `@chat/web` SPA. It supports automatic
updates, global push-to-talk, auto-start, tray, and web-hosted installer downloads.

## Prerequisites (one-time)

1. **Rust toolchain** – install via https://rustup.rs (stable).
2. **Tauri prerequisites** – on Windows, the WebView2 runtime (preinstalled on Win10/11)
   and the MSVC build tools. See https://tauri.app/start/prerequisites/.
3. **Updater signing key (free, self-generated)** – required for auto-updates:

   ```bash
   pnpm --filter @chat/desktop tauri signer generate -w tauri-signing.key
   ```

   This prints a public key and writes the private key to `tauri-signing.key`
   (gitignored). Put the **public key** into `src-tauri/tauri.conf.json` at
   `plugins.updater.pubkey` (replace `REPLACE_WITH_TAURI_UPDATER_PUBKEY`).

   Keep the private key secret. Before building, export it:

   ```bash
   $env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw tauri-signing.key
   $env:TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "<the password you chose>"
   ```

> Windows code-signing (Authenticode) is intentionally **not** configured. The
> installer is unsigned, so the first install shows a one-time SmartScreen
> "unknown publisher" prompt. Auto-updates are unaffected. A certificate can be
> added later without code changes.

## Icons (one-time / when the logo changes)

```bash
pnpm --filter @chat/desktop tauri icon resources/icon.ico
```

This regenerates `src-tauri/icons/*` (png/ico/icns) referenced by `tauri.conf.json`.

## Development

```bash
pnpm dev        # terminal 1: web (:5173) + api (:3001)
pnpm desktop    # terminal 2: tauri dev (loads http://localhost:5173)
```

## Building a release

```bash
# from the repo root
node apps/desktop/scripts/release.mjs --bump patch --notes "What changed"
```

The `release.mjs` script:

1. Optionally bumps the version (`--bump patch|minor|major|x.y.z`) across
   `tauri.conf.json`, `package.json`, and `Cargo.toml`.
2. Builds the web app and the Tauri NSIS installer.
3. Stages artifacts into `apps/desktop/release-artifacts/` and writes `latest.json`.
4. Prints exactly which files go to which server directory.

Set `UPDATE_PUBLIC_URL` to the public base URL of the server hosting updates so the
installer URL inside `latest.json` is correct, e.g.:

```bash
$env:UPDATE_PUBLIC_URL = "https://chat.example.com"
```

## Uploading

Upload the staged files over SSH. Either do it manually:

- `DOWNLOADS_DIR` (served by `/api/downloads`) ← `Jablu_<v>_x64-setup.exe`
- `UPDATES_DIR` (served by `/api/updates`) ← `latest.json`, `Jablu_<v>_x64-setup.exe`, `Jablu_<v>_x64-setup.exe.sig`

…or use the built-in optional uploader:

```bash
cp apps/desktop/scripts/upload.mjs.example apps/desktop/scripts/upload.mjs
# edit upload.mjs with your SSH host + remote paths, then:
node apps/desktop/scripts/release.mjs --bump patch --upload
```

`scripts/upload.mjs` is gitignored (personal, machine-specific).

## How updates work

- The installed app reads the configured server URL and points the Tauri updater at
  `{server}/api/updates/latest.json`.
- Before checking, it calls `{server}/api/updates/compat?client={version}` to honor
  `MIN_CLIENT_VERSION`/`MAX_CLIENT_VERSION` gating.
- Tauri verifies the update signature against the embedded public key, downloads the
  installer, and installs on user confirmation (Restart & Update), then relaunches.
- No NestJS redeploy is needed per release — the server only serves files. The CORS
  allowlist (`http(s)://tauri.localhost`) and `.json` content-type are one-time changes
  already in the server.
