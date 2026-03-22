#!/usr/bin/env bash
set -euo pipefail

ENV_FILE=".env"
ENV_EXAMPLE=".env.example"

echo "╔══════════════════════════════════════════╗"
echo "║        Jablu - Setup Script              ║"
echo "╚══════════════════════════════════════════╝"
echo ""

# Generate a random string
random_string() {
  openssl rand -hex "$1" 2>/dev/null || head -c "$1" /dev/urandom | xxd -p | tr -d '\n'
}

# Copy .env.example if .env doesn't exist
if [ ! -f "$ENV_FILE" ]; then
  echo "→ Creating .env from .env.example..."
  cp "$ENV_EXAMPLE" "$ENV_FILE"
else
  echo "→ .env already exists, updating secrets only..."
fi

# Generate secrets
POSTGRES_PASSWORD=$(random_string 16)
JWT_SECRET=$(random_string 32)
JWT_REFRESH_SECRET=$(random_string 32)
LIVEKIT_API_KEY="API$(random_string 8)"
LIVEKIT_API_SECRET=$(random_string 24)

# Update secrets in .env (cross-platform sed)
update_env() {
  local key="$1"
  local value="$2"
  if grep -q "^${key}=" "$ENV_FILE"; then
    # Only replace if it's still the default placeholder value
    if grep -q "^${key}=changeme" "$ENV_FILE"; then
      if [[ "$OSTYPE" == "darwin"* ]]; then
        sed -i '' "s|^${key}=changeme.*|${key}=${value}|" "$ENV_FILE"
      else
        sed -i "s|^${key}=changeme.*|${key}=${value}|" "$ENV_FILE"
      fi
      echo "  ✓ Generated ${key}"
    else
      echo "  ○ ${key} already set, skipping"
    fi
  fi
}

SUPERADMIN_USERNAME="admin_$(random_string 4)"
SUPERADMIN_PASSWORD=$(random_string 16)

echo ""
echo "→ Generating secrets..."
update_env "POSTGRES_PASSWORD" "$POSTGRES_PASSWORD"
update_env "JWT_SECRET" "$JWT_SECRET"
update_env "JWT_REFRESH_SECRET" "$JWT_REFRESH_SECRET"
update_env "LIVEKIT_API_KEY" "$LIVEKIT_API_KEY"
update_env "LIVEKIT_API_SECRET" "$LIVEKIT_API_SECRET"
update_env "SUPERADMIN_USERNAME" "$SUPERADMIN_USERNAME"
update_env "SUPERADMIN_PASSWORD" "$SUPERADMIN_PASSWORD"

# Update DATABASE_URL with the new password
if grep -q "^DATABASE_URL=postgresql://chat:changeme" "$ENV_FILE"; then
  if [[ "$OSTYPE" == "darwin"* ]]; then
    sed -i '' "s|^DATABASE_URL=postgresql://chat:changeme|DATABASE_URL=postgresql://chat:${POSTGRES_PASSWORD}|" "$ENV_FILE"
  else
    sed -i "s|^DATABASE_URL=postgresql://chat:changeme|DATABASE_URL=postgresql://chat:${POSTGRES_PASSWORD}|" "$ENV_FILE"
  fi
  echo "  ✓ Updated DATABASE_URL"
fi

echo ""
echo "╔══════════════════════════════════════════╗"
echo "║            Setup Complete!               ║"
echo "╚══════════════════════════════════════════╝"
echo ""
echo "Next steps:"
echo "  1. Edit .env and set SERVER_HOST to your server's IP"
echo "  2. Review SUPERADMIN_USERNAME and SUPERADMIN_PASSWORD in .env"
echo "  3. Run: docker compose --profile dev up -d"
echo "     (use --profile dev to include Mailpit for email testing)"
echo ""
echo "  Web app:     http://\${SERVER_HOST}"
echo "  Admin panel: http://\${SERVER_HOST}/admin"
echo "  Mailpit UI:  http://\${SERVER_HOST}:8025  (dev only)"
echo ""
