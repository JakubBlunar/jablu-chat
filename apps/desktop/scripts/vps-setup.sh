#!/usr/bin/env bash
# One-time bootstrap on the VPS that hosts the Nest server.
#
# Usage:
#   bash vps-setup.sh <UPDATES_DIR> <DOWNLOADS_DIR> [ENV_FILE]
#
# Examples:
#   bash vps-setup.sh /var/lib/jablu/updates /var/lib/jablu/downloads
#   bash vps-setup.sh /var/lib/jablu/updates /var/lib/jablu/downloads /opt/jablu/.env
#
# Creates both directories, chowns them to the invoking user, and appends the
# matching UPDATES_DIR / DOWNLOADS_DIR entries to the Nest server's .env if
# they aren't already present.

set -euo pipefail

if [ "${1-}" = "" ] || [ "${2-}" = "" ]; then
  cat >&2 <<EOF
Usage: $0 <UPDATES_DIR> <DOWNLOADS_DIR> [ENV_FILE]

  UPDATES_DIR    Directory that will hold latest*.yml (+ .sig) manifests.
  DOWNLOADS_DIR  Directory that will hold *.exe / *.AppImage installers.
  ENV_FILE       Optional path to the Nest server's .env (default: ./apps/server/.env).
EOF
  exit 1
fi

UPDATES_DIR="$1"
DOWNLOADS_DIR="$2"
ENV_FILE="${3:-./apps/server/.env}"

OWNER="$(id -un)"
GROUP="$(id -gn)"

echo "[vps-setup] Ensuring $UPDATES_DIR exists"
sudo mkdir -p "$UPDATES_DIR"
sudo chown "$OWNER:$GROUP" "$UPDATES_DIR"
sudo chmod 755 "$UPDATES_DIR"

echo "[vps-setup] Ensuring $DOWNLOADS_DIR exists"
sudo mkdir -p "$DOWNLOADS_DIR"
sudo chown "$OWNER:$GROUP" "$DOWNLOADS_DIR"
sudo chmod 755 "$DOWNLOADS_DIR"

append_env() {
  local key="$1"
  local value="$2"

  if [ ! -f "$ENV_FILE" ]; then
    echo "[vps-setup] $ENV_FILE does not exist; creating"
    mkdir -p "$(dirname "$ENV_FILE")"
    touch "$ENV_FILE"
  fi

  if grep -Eq "^${key}=" "$ENV_FILE"; then
    local existing
    existing="$(grep -E "^${key}=" "$ENV_FILE" | tail -n 1 | cut -d= -f2-)"
    if [ "$existing" = "$value" ]; then
      echo "[vps-setup] $key already set in $ENV_FILE"
    else
      echo "[vps-setup] WARNING: $key already present in $ENV_FILE with a different value:"
      echo "  current:  $key=$existing"
      echo "  expected: $key=$value"
      echo "  (leaving existing value untouched)"
    fi
  else
    printf '\n%s=%s\n' "$key" "$value" >> "$ENV_FILE"
    echo "[vps-setup] appended $key to $ENV_FILE"
  fi
}

append_env "UPDATES_DIR" "$UPDATES_DIR"
append_env "DOWNLOADS_DIR" "$DOWNLOADS_DIR"

if ! grep -Eq "^MIN_CLIENT_VERSION=" "$ENV_FILE"; then
  cat >> "$ENV_FILE" <<'EOF'

# Optional: refuse auto-updates for clients older than this semver.
# Clients below this version see a "please reinstall" banner.
# MIN_CLIENT_VERSION=1.0.0
EOF
  echo "[vps-setup] added commented MIN_CLIENT_VERSION hint to $ENV_FILE"
fi

echo
echo "[vps-setup] Done."
echo "  UPDATES_DIR   = $UPDATES_DIR"
echo "  DOWNLOADS_DIR = $DOWNLOADS_DIR"
echo "  ENV_FILE      = $ENV_FILE"
echo
echo "Restart the Nest server so it picks up the new env vars."
echo "New manifest/installer files drop into these directories are picked up on the next request (no restart needed)."
