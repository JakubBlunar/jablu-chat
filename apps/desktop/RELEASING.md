# Releasing the Desktop App

Every Jablu deployment distributes its own desktop app and signs its own update
manifests. This gives each admin full control over the upgrade flow, and - more
importantly - it means update integrity does not depend on the security of the
HTTP server: even if the server is compromised, an attacker cannot push a
malicious update without the private signing key.

This document is for the admin of a deployment, not for end users.

## Quick start: Windows + WSL + pscp (password SSH)

This is the path you want if you're on a Windows dev box, deploying to a Linux
VPS, with password-based SSH. No GitHub Actions, no SSH keys.

### One-time: tooling

```powershell
# PuTTY provides pscp.exe + plink.exe which accept -pw <password> natively.
winget install PuTTY.PuTTY

# WSL (Ubuntu) is needed to cross-build the Linux AppImage from Windows.
wsl --install -d Ubuntu
```

Inside WSL, one-time only, run `pnpm install` at the repo root so electron-builder
has a Linux node_modules layout to work with:

```bash
# In WSL, replace F with your drive letter
cd /mnt/f/Projects/chat
pnpm install
```

### One-time: signing keypair

Generate the Ed25519 keypair on your dev box and store the private key outside
the repo. **Do not lose this key** and **do not commit it**.

```powershell
cd apps\desktop
pnpm keygen "$HOME\.config\jablu-updater.pem"
```

The script writes the private key to the given path and prints the public key
PEM to stdout. Export both (add to your PowerShell profile to persist):

```powershell
$env:UPDATE_SIGNING_KEY_PATH = "$HOME\.config\jablu-updater.pem"
$env:UPDATE_PUBLIC_KEY_PEM   = "-----BEGIN PUBLIC KEY-----`n...`n-----END PUBLIC KEY-----"
```

> Losing the private key means you can never publish another trusted update.
> Rotating the key means every existing user must manually reinstall the new
> build.

If `UPDATE_PUBLIC_KEY_PEM` is not set at build time, the resulting build will
**disable auto-update entirely**. This is intentional - it prevents accidentally
shipping binaries that would blindly trust any update manifest.

### One-time: bootstrap the VPS

Push `scripts/vps-setup.sh` once, then run it as the server user:

```powershell
pscp -pw <vps-password> scripts\vps-setup.sh user@vps:/tmp/
plink -pw <vps-password> user@vps "bash /tmp/vps-setup.sh /var/lib/jablu/updates /var/lib/jablu/downloads /opt/jablu/.env"
```

The script creates both directories, chowns them to the invoking user, and
appends `UPDATES_DIR` / `DOWNLOADS_DIR` to the server's `.env`. Restart Nest
once so it picks up the new env vars.

### One-time: wire up local deploy credentials

Both scripts are git-ignored because they contain your SSH password:

```powershell
Copy-Item scripts\deploy.mjs.example  scripts\deploy.mjs
Copy-Item scripts\rollback.mjs.example scripts\rollback.mjs
```

Open both files and fill in the constants at the top:

- `HOST`, `USER`, `PASSWORD` - your VPS SSH credentials.
- `UPDATES_PATH`, `DOWNLOADS_PATH` - must match what you passed to `vps-setup.sh`
  (and what's in the server's `.env`).

### Per release

```powershell
cd apps\desktop
pnpm release -- --bump=patch
```

That single command:

1. Runs `npm version patch --no-git-tag-version` on `apps/desktop/package.json`.
2. Builds the web assets with `ELECTRON=1`.
3. Builds the Windows NSIS installer.
4. Invokes WSL to build the Linux AppImage.
5. Signs `release/latest*.yml` into `release/latest*.yml.sig` with Ed25519.
6. Snapshots the current remote manifests to `*.prev` on the VPS.
7. Uploads installers to `DOWNLOADS_PATH` and manifests/signatures to `UPDATES_PATH`
   via `pscp` + `plink`.

If `scripts/deploy.mjs` doesn't exist, steps 6-7 are skipped and the script
prints the artifact paths so you can upload them manually.

Useful variations:

```powershell
# Skip Linux (faster; for a Windows-only patch)
pnpm release:win -- --bump=patch

# Skip Windows
pnpm release:linux -- --bump=patch

# No version bump (just rebuild current version)
pnpm release

# Bump + tag in git
pnpm release -- --bump=minor --git-tag
```

## Versioning policy

The source of truth is `apps/desktop/package.json`'s `version`. electron-builder
reads it, stamps the installer filename and `latest*.yml`'s `version:` field,
and `app.getVersion()` exposes it at runtime.

| Level | When to use                                           | Server action                |
| ----- | ----------------------------------------------------- | ---------------------------- |
| patch | Bug fix only, auto-push safe                          | nothing                      |
| minor | Backwards-compatible feature, auto-push safe          | nothing                      |
| major | Protocol break - older clients will misbehave          | bump `MIN_CLIENT_VERSION`    |

After a major bump, edit the server's `.env` to set `MIN_CLIENT_VERSION` to the
new major (e.g. `MIN_CLIENT_VERSION=2.0.0`) and restart Nest. Older clients will
then see the "please update manually" banner instead of auto-updating through a
broken intermediate version.

`electron-updater` never downgrades (`allowDowngrade` stays false), so
publishing a lower version number has no effect - rollback is handled separately.

## Rollback

`pnpm rollback` runs `scripts/rollback.mjs` which uses `plink` to swap the
`*.prev` snapshot over `latest*.yml` and `latest*.yml.sig`:

```powershell
cd apps\desktop
pnpm rollback
```

Caveats:

- Rollback only affects what new clients see as "latest". Clients that already
  installed the bad version must manually reinstall from `/api/downloads`.
- Exactly one level of history is kept: the `.prev` files are overwritten on
  every deploy. For deeper history, tag releases in git or manually copy
  `latest.yml` to `latest.v1.2.3.yml` on the VPS and promote it back later.
- Installer binaries in `DOWNLOADS_PATH` are never removed by either deploy or
  rollback, so direct-download users can always still install any version that
  was ever published.

## Client compatibility gating

`GET /api/updates/compat?client=<version>` returns
`{ supported, reason, minClient, maxClient }`. The desktop app calls this
before every update check. Tune via env vars on the server:

- `MIN_CLIENT_VERSION` (default `0.0.0`) - clients below this get a
  `client-too-old` banner and the updater is skipped.
- `MAX_CLIENT_VERSION` (optional) - if set, clients above this get
  `client-too-new`. Use when a newer client is pointed at an older server.

## Per-platform notes

- **Windows**: unsigned NSIS installers trigger SmartScreen on first install.
  The update itself is still trusted because its manifest is signature-verified.
- **Linux**: AppImage auto-update works out of the box; nothing extra required.
- **macOS**: **currently unsupported for auto-update** because macOS requires a
  valid Apple Developer ID signature + notarization for the updater to swap the
  binary. You can still `dist` a DMG locally for testing.

## WSL prerequisites (summary)

To cross-build the Linux AppImage from Windows you need:

- WSL with an Ubuntu distro (`wsl --install -d Ubuntu`).
- `pnpm install` run once inside WSL from the repo root (pnpm's node_modules
  layout differs between host OSes).

`release.mjs` calls `wsl --status` and exits with a clear message if WSL is not
installed. Pass `--targets=win` to skip the Linux build if you don't need it.

## Using CI instead of a local machine

See [`.github/release-workflow-example.md`](../../.github/release-workflow-example.md)
for a starting point. (It lives outside `.github/workflows/` on purpose so
GitHub Actions does not try to run the example here — copy the YAML block
into `.github/workflows/release.yml` in your fork.) Note that CI will need:

- `UPDATE_PUBLIC_KEY_PEM` as a secret (public, but convenient to store here).
- `UPDATE_SIGNING_KEY` as a secret (private PEM contents). The example workflow
  writes it to a tempfile and sets `UPDATE_SIGNING_KEY_PATH` to point at it.
- Any deploy credentials as secrets if you want auto-upload (though the
  committed deploy scripts use `plink`/`pscp` which assume an interactive
  Windows host; for CI, substitute `rsync` or `scp` with an SSH key).

This file is `.example.yml` because each deployment needs its own secrets and
its own target host; do not rename it unless you are forking for a specific
deployment.
