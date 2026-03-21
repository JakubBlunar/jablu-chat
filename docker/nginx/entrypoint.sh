#!/bin/bash
set -e

TLS_MODE="${TLS_MODE:-off}"
SERVER_HOST="${SERVER_HOST:-localhost}"
LE_DIR="/etc/letsencrypt/live/${SERVER_HOST}"
SELF_DIR="/etc/nginx/certs"

case "$TLS_MODE" in
  off)
    echo "[nginx] TLS_MODE=off — HTTP only"
    cp /etc/nginx/templates/http.conf /etc/nginx/nginx.conf
    ;;

  self-signed)
    echo "[nginx] TLS_MODE=self-signed"
    if [ ! -f "${SELF_DIR}/server.crt" ]; then
      echo "[nginx] Generating self-signed certificate for ${SERVER_HOST}..."
      mkdir -p "$SELF_DIR"
      openssl req -x509 -nodes -days 365 -newkey rsa:2048 \
        -keyout "${SELF_DIR}/server.key" \
        -out "${SELF_DIR}/server.crt" \
        -subj "/CN=${SERVER_HOST}" 2>/dev/null
    fi
    sed -e "s|__SSL_CERT__|${SELF_DIR}/server.crt|g" \
        -e "s|__SSL_KEY__|${SELF_DIR}/server.key|g" \
        -e "s|__SERVER_HOST__|${SERVER_HOST}|g" \
        /etc/nginx/templates/https.conf > /etc/nginx/nginx.conf
    ;;

  letsencrypt)
    echo "[nginx] TLS_MODE=letsencrypt for ${SERVER_HOST}"
    if [ ! -f "${LE_DIR}/fullchain.pem" ]; then
      echo "[nginx] No certificate found — obtaining from Let's Encrypt..."
      cp /etc/nginx/templates/acme.conf /etc/nginx/nginx.conf
      nginx &
      NGINX_PID=$!
      sleep 2

      certbot certonly --webroot -w /var/www/certbot \
        -d "${SERVER_HOST}" \
        --non-interactive --agree-tos \
        --email "admin@${SERVER_HOST}" --no-eff-email

      nginx -s stop 2>/dev/null || true
      wait $NGINX_PID 2>/dev/null || true
      echo "[nginx] Certificate obtained successfully"
    fi

    sed -e "s|__SSL_CERT__|${LE_DIR}/fullchain.pem|g" \
        -e "s|__SSL_KEY__|${LE_DIR}/privkey.pem|g" \
        -e "s|__SERVER_HOST__|${SERVER_HOST}|g" \
        /etc/nginx/templates/https.conf > /etc/nginx/nginx.conf

    # Background renewal loop (every 12 hours)
    (while true; do
      sleep 43200
      certbot renew --quiet --deploy-hook "nginx -s reload"
    done) &
    ;;

  *)
    echo "[nginx] Unknown TLS_MODE=${TLS_MODE}, falling back to HTTP"
    cp /etc/nginx/templates/http.conf /etc/nginx/nginx.conf
    ;;
esac

echo "[nginx] Starting nginx..."
exec nginx -g "daemon off;"
