#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   bash deploy.sh                        # uses stored credentials
#   bash deploy.sh <github-token>         # uses token for this pull
#
# One-time setup to avoid passing token every time:
#   git config credential.helper store
#   git pull   (enter username + token once, it's saved for future pulls)

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.traefik.yml"
GITHUB_TOKEN="${1:-}"

echo "╔══════════════════════════════════════════╗"
echo "║         Jablu - Deploy Script            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

echo "→ Pulling latest changes..."
if [ -n "$GITHUB_TOKEN" ]; then
  REPO_URL=$(git remote get-url origin | sed 's|https://.*@|https://|' | sed 's|https://|https://'"$GITHUB_TOKEN"'@|')
  git pull "$REPO_URL" "$(git branch --show-current)"
else
  git pull
fi

echo ""
echo "→ Building and starting containers..."
$COMPOSE up -d --build

echo ""
echo "→ Waiting for API to be healthy..."
timeout=60
elapsed=0
until $COMPOSE exec -T api wget -q --spider http://localhost:3001/api/health 2>/dev/null; do
  sleep 2
  elapsed=$((elapsed + 2))
  if [ $elapsed -ge $timeout ]; then
    echo "  ✗ API did not become healthy within ${timeout}s"
    echo "  Check logs: $COMPOSE logs api --tail 30"
    exit 1
  fi
done
echo "  ✓ API is healthy"

echo ""
echo "→ Restarting Nginx (pick up new DNS)..."
$COMPOSE restart nginx
sleep 2

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║         Deploy Complete!                 ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "  Services:"
$COMPOSE ps --format "table {{.Name}}\t{{.Status}}"
echo ""
