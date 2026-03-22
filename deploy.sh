#!/usr/bin/env bash
set -euo pipefail

COMPOSE="docker compose -f docker-compose.yml -f docker-compose.traefik.yml"

echo "╔══════════════════════════════════════════╗"
echo "║         Jablu - Deploy Script            ║"
echo "╚══════════════════════════════════════════╝"
echo ""

echo "→ Pulling latest changes..."
git pull

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
