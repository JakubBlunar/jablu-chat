#!/usr/bin/env bash
set -euo pipefail

# ─── Publish Desktop App to Server ─────────────────────────
# Usage: ./scripts/publish-desktop.sh user@your-server-ip
#
# This script:
# 1. Builds the web app (bundled into the desktop app)
# 2. Builds the desktop installer for your current platform
# 3. Uploads installers to the server (replacing old versions)
# 4. Uploads auto-update manifest (latest.yml)

SERVER="${1:?Usage: $0 user@server-ip}"
REMOTE_DOWNLOADS="/opt/jablu/downloads"
REMOTE_UPDATES="/opt/jablu/updates"

RELEASE_DIR="apps/desktop/release"
VERSION=$(node -p "require('./apps/desktop/package.json').version")

echo ""
echo "══════════════════════════════════════════"
echo "  Publishing Jablu Desktop v${VERSION}"
echo "══════════════════════════════════════════"
echo ""

# Step 1: Build web app
echo "→ Building web app..."
pnpm --filter @chat/web build

# Step 2: Build desktop app
echo "→ Compiling desktop app..."
pnpm --filter @chat/desktop build

echo "→ Packaging installer..."
if [[ "$OSTYPE" == "msys" || "$OSTYPE" == "cygwin" || "$OSTYPE" == "win32" ]]; then
  pnpm --filter @chat/desktop dist -- --win
elif [[ "$OSTYPE" == "darwin"* ]]; then
  pnpm --filter @chat/desktop dist -- --mac
else
  pnpm --filter @chat/desktop dist -- --linux
fi

echo ""
echo "→ Built artifacts:"
ls -lh "$RELEASE_DIR"/*.{exe,dmg,AppImage,yml} 2>/dev/null || true

# Step 3: Clean old files on server and upload new ones
echo ""
echo "→ Cleaning old downloads on server..."
ssh "$SERVER" "rm -f ${REMOTE_DOWNLOADS}/Jablu*.exe ${REMOTE_DOWNLOADS}/Jablu*.dmg ${REMOTE_DOWNLOADS}/Jablu*.AppImage"
ssh "$SERVER" "mkdir -p ${REMOTE_DOWNLOADS} ${REMOTE_UPDATES}"

echo "→ Uploading installers to ${SERVER}:${REMOTE_DOWNLOADS}/"
for f in "$RELEASE_DIR"/*.exe "$RELEASE_DIR"/*.dmg "$RELEASE_DIR"/*.AppImage; do
  [ -f "$f" ] && scp "$f" "${SERVER}:${REMOTE_DOWNLOADS}/" && echo "  ✓ $(basename "$f")"
done

echo "→ Uploading update manifests to ${SERVER}:${REMOTE_UPDATES}/"
for f in "$RELEASE_DIR"/latest*.yml "$RELEASE_DIR"/*.blockmap; do
  [ -f "$f" ] && scp "$f" "${SERVER}:${REMOTE_UPDATES}/" && echo "  ✓ $(basename "$f")"
done

# Also copy installers to updates dir (electron-updater downloads from there)
for f in "$RELEASE_DIR"/*.exe "$RELEASE_DIR"/*.dmg "$RELEASE_DIR"/*.AppImage; do
  [ -f "$f" ] && scp "$f" "${SERVER}:${REMOTE_UPDATES}/" && echo "  ✓ $(basename "$f") → updates/"
done

echo ""
echo "══════════════════════════════════════════"
echo "  ✓ Jablu Desktop v${VERSION} published!"
echo "══════════════════════════════════════════"
echo ""
echo "Users will see the download in Settings > Desktop App"
echo "Existing desktop users will auto-update within 4 hours"
echo ""
