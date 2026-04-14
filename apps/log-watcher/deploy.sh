#!/usr/bin/env bash
set -euo pipefail

# ─── Log watcher deploy (same idea as apps/bot/deploy.sh) ────────────
# Runs Docker Compose from the repo root so the log-watcher service
# defined in docker-compose.yml (profile: log-watcher) is used.
#
# Usage (from anywhere):
#   apps/log-watcher/deploy.sh setup
#   apps/log-watcher/deploy.sh update
#   apps/log-watcher/deploy.sh logs
#   apps/log-watcher/deploy.sh stop
#   apps/log-watcher/deploy.sh test
#
# Or from this directory:
#   ./deploy.sh update

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
MAIN_COMPOSE="$REPO_ROOT/docker-compose.yml"

compose() {
  (cd "$REPO_ROOT" && docker compose --profile log-watcher "$@")
}

print_warnings() {
  echo ""
  echo "┌────────────────────────────────────────────────────────────────────"
  echo "│ WARNINGS — read before running log-watcher on a shared host"
  echo "├────────────────────────────────────────────────────────────────────"
  echo "│ • This service mounts the Docker socket (read-only). Anyone who can"
  echo "│   exec into the container can read logs from ALL containers on this"
  echo "│   host. Use firewall / VPN; do not expose the socket to tenants."
  echo "│"
  echo "│ • COMPOSE_PROJECT_NAME must match the project name of your running"
  echo "│   stack (see: docker compose ls). Often it is the repo folder name"
  echo "│   (e.g. chat). Wrong name => no logs or wrong containers."
  echo "│"
  echo "│ • The bind mount uses $REPO_ROOT/docker-compose.yml — keep this path"
  echo "│   valid after deploy; moving the repo breaks log discovery until you"
  echo "│   recreate the container."
  echo "│"
  echo "│ • LOG_WATCHER_ALERT_TO must be set (or LOG_WATCHER_DRY_RUN=1) or the"
  echo "│   container will exit. Broad LOG_WATCHER_PATTERNS can false-positive."
  echo "└────────────────────────────────────────────────────────────────────"
  echo ""
}

require_repo_compose() {
  if [ ! -f "$MAIN_COMPOSE" ]; then
    echo "ERROR: Main compose file not found: $MAIN_COMPOSE"
    exit 1
  fi
}

require_env_for_runtime() {
  local env_file="$REPO_ROOT/.env"
  if [ ! -f "$env_file" ]; then
    echo "ERROR: No .env at repo root: $env_file"
    echo "Copy from .env.example and add LOG_WATCHER_* (see apps/log-watcher/.env.example)."
    exit 1
  fi
  if grep -qiE '^[[:space:]]*LOG_WATCHER_DRY_RUN[[:space:]]*=[[:space:]]*(1|true|yes)([[:space:]]|#|$)' "$env_file" 2>/dev/null; then
    return 0
  fi
  if ! grep -qiE '^[[:space:]]*LOG_WATCHER_ALERT_TO[[:space:]]*=' "$env_file" 2>/dev/null; then
    echo "ERROR: Set LOG_WATCHER_ALERT_TO in $env_file (or set LOG_WATCHER_DRY_RUN=1)."
    echo "See apps/log-watcher/.env.example for a checklist."
    exit 1
  fi
  local val
  val="$(grep -iE '^[[:space:]]*LOG_WATCHER_ALERT_TO[[:space:]]*=' "$env_file" 2>/dev/null | head -1 \
    | sed -E 's/^[[:space:]]*LOG_WATCHER_ALERT_TO[[:space:]]*=[[:space:]]*//; s/[[:space:]]*(#.*)?$//; s/^"(.*)"$/\1/; s/^'"'"'(.*)'"'"'$/\1/')"
  if [ -z "$val" ]; then
    echo "ERROR: LOG_WATCHER_ALERT_TO is empty in $env_file."
    exit 1
  fi
}

case "${1:-help}" in

  setup)
    echo "=== Log watcher setup ==="
    print_warnings

    if ! command -v docker &>/dev/null; then
      echo "Docker not found. Install Docker, then re-run: $0 setup"
      exit 1
    fi

    require_repo_compose
    require_env_for_runtime

    echo "Building and starting log-watcher (repo root: $REPO_ROOT)..."
    compose up -d --build log-watcher

    echo ""
    echo "Cleaning up unused Docker images..."
    docker image prune -a -f --filter "until=24h" 2>/dev/null || true
    echo "Cleaning up build cache (keeping 2GB)..."
    docker builder prune -f --reserved-space=2GB 2>/dev/null || true

    echo ""
    echo "Log watcher is running. Follow logs: $0 logs"
    ;;

  update)
    echo "=== Updating log watcher ==="
    print_warnings
    require_repo_compose
    require_env_for_runtime

    compose up -d --build log-watcher

    echo "Cleaning up unused Docker images..."
    docker image prune -a -f --filter "until=24h" 2>/dev/null || true
    docker builder prune -f --reserved-space=2GB 2>/dev/null || true

    echo "Done. Check logs: $0 logs"
    ;;

  logs)
    require_repo_compose
    compose logs -f --tail=50 log-watcher
    ;;

  stop)
    require_repo_compose
    compose stop log-watcher
    echo "Log watcher stopped (main stack unchanged)."
    ;;

  start)
    require_repo_compose
    require_env_for_runtime
    compose up -d log-watcher
    echo "Log watcher started."
    ;;

  restart)
    require_repo_compose
    require_env_for_runtime
    compose stop log-watcher
    compose up -d log-watcher
    echo "Log watcher restarted."
    ;;

  status)
    require_repo_compose
    compose ps log-watcher
    ;;

  test)
    echo "=== Log watcher status / recent logs ==="
    require_repo_compose
    compose ps log-watcher
    echo ""
    compose logs --tail=40 log-watcher
    ;;

  warnings)
    print_warnings
    ;;

  *)
    echo "Log watcher deploy script"
    echo ""
    echo "Uses docker-compose.yml at repo root with profile: log-watcher."
    echo ""
    echo "Usage: $0 <command>"
    echo ""
    echo "Commands:"
    echo "  setup     Build & start log-watcher (requires root .env configured)"
    echo "  update    Rebuild & restart log-watcher"
    echo "  logs      Follow live logs"
    echo "  stop      Stop log-watcher only (does not touch api/nginx/db)"
    echo "  start     Start log-watcher"
    echo "  restart   Restart log-watcher"
    echo "  status    Container status"
    echo "  test      Show status + last 40 log lines"
    echo "  warnings  Print security / ops warnings only"
    echo ""
    echo "Env: merge apps/log-watcher/.env.example into repo root .env"
    ;;

esac
