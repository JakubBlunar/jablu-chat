#!/usr/bin/env bash
set -euo pipefail

# ─── FreeGameBot Deploy Script ───────────────────────────────────────
# Usage:
#   First time:  ./deploy.sh setup
#   Update:      ./deploy.sh update
#   Logs:        ./deploy.sh logs
#   Stop:        ./deploy.sh stop
#   Test:        ./deploy.sh test

BOT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$BOT_DIR"

case "${1:-help}" in

  setup)
    echo "=== FreeGameBot Setup ==="
    echo ""

    # Check Docker
    if ! command -v docker &>/dev/null; then
      echo "Docker not found. Installing..."
      curl -fsSL https://get.docker.com | sh
      sudo usermod -aG docker "$USER"
      echo "Docker installed. You may need to log out and back in."
    fi

    # Create .env if it doesn't exist
    if [ ! -f .env ]; then
      cp .env.example .env
      echo ""
      echo "Created .env from .env.example."
      echo "Edit it now with your webhook URLs:"
      echo ""
      echo "  nano $BOT_DIR/.env"
      echo ""
      echo "Then run: ./deploy.sh update"
      exit 0
    fi

    # Validate WEBHOOK_URLS is set
    if grep -q '<token' .env; then
      echo "ERROR: .env still has placeholder webhook URLs."
      echo "Edit .env and set your real WEBHOOK_URLS first."
      exit 1
    fi

    echo "Building and starting bot..."
    docker compose up -d --build

    echo ""
    echo "Cleaning up unused Docker images..."
    docker image prune -a -f --filter "until=24h" 2>/dev/null || true
    echo "Cleaning up build cache (keeping 2GB)..."
    docker builder prune -f --keep-storage=2GB 2>/dev/null || true

    echo ""
    echo "Bot is running! Check logs with: ./deploy.sh logs"
    ;;

  update)
    echo "=== Updating FreeGameBot ==="
    docker compose up -d --build

    echo "Cleaning up unused Docker images..."
    docker image prune -a -f --filter "until=24h" 2>/dev/null || true
    docker builder prune -f --keep-storage=2GB 2>/dev/null || true

    echo "Done. Check logs: ./deploy.sh logs"
    ;;

  logs)
    docker compose logs -f --tail=50
    ;;

  stop)
    docker compose down
    echo "Bot stopped."
    ;;

  test)
    echo "=== Running test post ==="
    docker compose run --rm freegamebot node dist/index.js --test
    ;;

  restart)
    docker compose restart
    echo "Bot restarted."
    ;;

  status)
    docker compose ps
    ;;

  *)
    echo "FreeGameBot Deploy Script"
    echo ""
    echo "Usage: ./deploy.sh <command>"
    echo ""
    echo "Commands:"
    echo "  setup    First-time setup (install Docker, create .env, build & start)"
    echo "  update   Rebuild and restart the bot"
    echo "  logs     Follow live logs"
    echo "  stop     Stop the bot"
    echo "  start    Start the bot"
    echo "  restart  Restart the bot"
    echo "  status   Show container status"
    echo "  test     Run a test post to verify webhooks work"
    ;;

esac
