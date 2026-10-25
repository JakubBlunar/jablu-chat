# Jablu Deployment Guide

Part of the [Jablu documentation](./README.md).

## Recommended VPS Specs

Any VPS provider (Hetzner, Contabo, DigitalOcean, Linode, etc.) with these minimum specs will work:

| Spec    | Minimum               |
| ------- | --------------------- |
| vCPU    | 2+ cores              |
| RAM     | 4+ GB                 |
| Storage | 40+ GB SSD/NVMe       |
| OS      | Ubuntu 22.04 or 24.04 |

For 20+ concurrent users with voice/video, 4 cores and 8 GB RAM is recommended.

## Services Running on the VPS

| Service                     | Port                            | Purpose                            |
| --------------------------- | ------------------------------- | ---------------------------------- |
| Nginx                       | 80 (443 with TLS)               | Reverse proxy, serves web frontend |
| Node.js API                 | 3001                            | Backend (NestJS + Socket.io)       |
| PostgreSQL                  | 5432                            | Database                           |
| Redis                       | 6379                            | Cache, presence                    |
| LiveKit                     | 7880, 7881/tcp, 50000-50100/udp | Voice/video/screen share (WebRTC)  |
| Mailpit (dev) / SMTP (prod) | 1025 / 587                      | Email for password resets          |
| LibreTranslate              | internal only (5000 in network) | On-demand message translation      |

## Estimated Resource Usage (20 users)

| Resource  | Idle                 | Active (voice/video)           |
| --------- | -------------------- | ------------------------------ |
| CPU       | ~5%                  | ~30-50% (during calls)         |
| RAM       | ~1.5 GB              | ~2-3 GB                        |
| Disk      | ~2-5 GB (base)       | Grows with media uploads       |
| Bandwidth | ~1-5 GB/month (text) | ~200-500 GB/month (with video) |

## Disk Management

The built-in Storage Audit & Cleanup system (Admin Panel > Storage tab) lets you monitor
disk usage and selectively delete old attachments. Configure the storage limit via
`STORAGE_LIMIT_GB` in `.env`. Enable automatic periodic audits with `CLEANUP_ENABLED=true`.

Without cleanup, media uploads can consume ~6-24 GB/year for images and ~12-60 GB/year
for videos, depending on usage. The 200 GB NVMe on the VPS S plan provides plenty of
headroom for a small community.

---

## Prerequisites

On your **local machine** (for building the desktop app):

- Node.js 22+
- pnpm 10+

On the **VPS**:

- SSH access (root or sudo user)
- Docker Engine 24+ and Docker Compose v2

---

## Step 1: Provision a VPS

1. Order a VPS from your preferred provider (Hetzner, Contabo, DigitalOcean, etc.)
2. Select **Ubuntu 22.04** or **24.04 LTS** as the OS
3. Choose the region closest to your community
4. Note the **public IP address** from your provider's dashboard

## Step 2: Initial Server Setup

SSH into the VPS:

```bash
ssh root@YOUR_VPS_IP
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

Verify Docker is running:

```bash
docker --version
docker compose version
```

Create a non-root user (optional but recommended):

```bash
adduser jablu
usermod -aG docker jablu
su - jablu
```

## Step 3: Clone and Configure

```bash
git clone https://github.com/YOUR_REPO/chat.git /opt/jablu
cd /opt/jablu
```

Run the setup script to generate secrets:

```bash
chmod +x setup.sh
./setup.sh
```

Edit the `.env` file:

```bash
nano .env
```

**Required changes:**

```ini
# Set to your VPS public IP (or domain if you have one)
SERVER_HOST=YOUR_VPS_IP

# For production email (password resets), replace Mailpit with real SMTP:
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.yourdomain.com
SMTP_PASS=your-mailgun-password
SMTP_FROM=jablu@yourdomain.com

# Registration mode (start with invite-only for a private community)
REGISTRATION_MODE=invite

# Set strong superadmin credentials
SUPERADMIN_USERNAME=your-admin-username
SUPERADMIN_PASSWORD=your-strong-admin-password

# Storage cleanup (enable periodic audits)
STORAGE_LIMIT_GB=150
CLEANUP_ENABLED=true
CLEANUP_MIN_AGE_DAYS=90
```

The setup script auto-generates `JWT_SECRET`, `JWT_REFRESH_SECRET`, `POSTGRES_PASSWORD`,
`LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` — don't change those unless you know what
you're doing.

### Optional: message translation (self-hosted LibreTranslate)

On-demand "Translate" on any message is powered by a self-hosted
[LibreTranslate](https://libretranslate.com) container — no API key, no third
party ever sees your messages. It ships with the compose file and is
**enabled by default** for `en`, `cs`, `sk` (the languages of the built-in UI).

- To **disable** it, set `TRANSLATE_URL=` (empty) in `.env` — the UI hides the
  action entirely and the container is simply not contacted.
- To change languages, edit both `TRANSLATE_LANGUAGES` (e.g. `en,de,fr`) in
  `.env` and restart — the container's `LT_LOAD_ONLY` follows it, and unknown
  codes make LibreTranslate fail to start (codes, not pairs!).
- Resource budget for a small, occasional-use server: `LT_THREADS=1` and
  `mem_limit: 1.2g` (measured ~235 MiB idle, ~0.9 GB under a 300-request
  burst). Models (~0.3 GB) persist in the `lt-models` volume across rebuilds.
- Bump `LT_THREADS` (gunicorn workers; each worker loads all models) only if
  you see real queueing — at 1 worker a 300-request burst still clears in
  ~23 s, far beyond a chat's on-demand load.

## Step 4: Open Firewall Ports

If you have a firewall (e.g. `ufw`), open the required ports:

```bash
ufw allow 22/tcp       # SSH
ufw allow 80/tcp       # HTTP
ufw allow 443/tcp      # HTTPS (if using TLS)
ufw allow 7881/tcp     # LiveKit TCP fallback (direct to media server)
ufw allow 50000:50100/udp  # LiveKit media ports
ufw enable
```

Some providers block UDP by default. Check your provider's firewall/security group
settings to ensure inbound UDP is not blocked.

## Step 5: Deploy

```bash
cd /opt/jablu
docker compose up -d
```

This builds and starts all services. The first run takes a few minutes (building images,
pulling dependencies, running database migrations).

Check that everything is running:

```bash
docker compose ps
```

You should see `nginx`, `api`, `postgres`, `redis`, `livekit`, and `web` all in a
healthy/running state. The `migrate` and `web` containers will show as exited (they're
one-shot tasks).

Check API health:

```bash
curl http://localhost/api/health
```

## Step 6: Access the App

Open a browser and navigate to:

```
http://YOUR_VPS_IP
```

1. Go to `/admin` and log in with your `SUPERADMIN_USERNAME` and `SUPERADMIN_PASSWORD`
2. Create your first server in the Servers tab
3. If using invite mode, create invite codes in the Invites tab
4. Register your own account and join the server

---

## Optional: Domain & TLS

Jablu supports three TLS modes controlled by the `TLS_MODE` environment variable:

| Mode          | Value           | Use case                                   |
| ------------- | --------------- | ------------------------------------------ |
| HTTP only     | `off` (default) | Local dev, IP-only access                  |
| Self-signed   | `self-signed`   | IP-only with HTTPS (shows browser warning) |
| Let's Encrypt | `letsencrypt`   | Production with a real domain              |

### Let's Encrypt (recommended for production)

1. Point your domain's **A record** to the VPS IP (e.g. `chat.example.com → 123.45.67.89`)
2. Make sure port 80 is open (needed for certificate verification)
3. Update `.env`:

```ini
SERVER_HOST=chat.example.com
TLS_MODE=letsencrypt
LIVEKIT_URL=wss://chat.example.com/livekit
```

4. Rebuild and start:

```bash
docker compose down
docker compose build nginx
docker compose up -d
```

On first start, the Nginx container will:

1. Start a temporary HTTP server for the ACME challenge
2. Obtain a Let's Encrypt certificate via certbot
3. Switch to HTTPS with automatic HTTP → HTTPS redirect
4. Run a background renewal check every 12 hours

All HTTP requests to `http://chat.example.com` will be automatically redirected to
`https://chat.example.com`. No manual certbot commands needed.

### Using a subdomain

You can run Jablu on any subdomain (e.g. `chat.example.com`) while keeping the root
domain (`example.com`) free for a landing page or other services. Just set the subdomain
as `SERVER_HOST` — the TLS setup works the same way.

### Self-signed certificate (IP only, no domain)

If you don't have a domain but want HTTPS anyway:

```ini
TLS_MODE=self-signed
```

```bash
docker compose down
docker compose build nginx
docker compose up -d
```

The Nginx container will generate a self-signed certificate on first start.
Browsers and desktop clients will show a certificate warning — this is expected.

### Verifying HTTPS

After deployment, verify the redirect works:

```bash
# Should return a 301 redirect to https://
curl -I http://chat.example.com

# Should return 200
curl -I https://chat.example.com/api/health
```

---

## Desktop App Updates

Jablu's desktop app is a **Tauri v2** shell around the web SPA and supports automatic signed updates.

### How it works

The **server URL is baked into the installer at build time** (from `UPDATE_PUBLIC_URL`),
so each build points at exactly one server — there is no in-app server switching. The
app checks `YOUR_SERVER/api/updates/latest.json`, downloads signed updates in the
background, and prompts the user to restart. Connected apps detect an update within 4
hours (or immediately via "Check for updates" in Settings).

If you fork/self-host Jablu, you must build your own installer with your own
`UPDATE_PUBLIC_URL` so the app connects to (and updates from) your server.

### Publishing an update

The full flow (versioning, signing, building, staging, uploading) lives in
[desktop release guide](./RELEASING.md). In short, from the repo root:

```bash
$env:UPDATE_PUBLIC_URL = "https://chat.example.com"   # required: baked-in server URL
$env:TAURI_SIGNING_PRIVATE_KEY = Get-Content -Raw tauri-signing.key
node apps/desktop/scripts/release.mjs --bump patch --notes "What changed"
```

This bumps the version, builds the web + Tauri NSIS installer, and stages
`Jablu_<v>_x64-setup.exe`, its `.sig`, and `latest.json` into
`apps/desktop/release-artifacts/`. Upload those to the server's `DOWNLOADS_DIR` /
`UPDATES_DIR` (see the [release guide](./RELEASING.md)), and make sure `UPDATES_DIR` in `.env` points at the
right location.

---

## Updating Jablu (Server)

To deploy a new version of the web app and API:

```bash
cd /opt/jablu
git pull origin main

# Rebuild and restart
docker compose build
docker compose up -d
```

The `migrate` service runs automatically on startup and applies any new database
migrations.

### Sidebar index migration

The `20261017130000_server_sidebar_indexes` migration adds
`(server_id, position)` indexes to `channels` and `channel_categories`. These
support server-scoped list queries; the existing member and message indexes are
unchanged.

It uses PostgreSQL `CREATE INDEX CONCURRENTLY` to avoid blocking ordinary writes
while building the indexes. Run it through the normal Prisma migrate service,
**not inside an explicit transaction**. Large tables may take longer to index;
allow the migration to finish before starting the new API.

If a concurrent build fails or is interrupted, inspect `pg_index.indisvalid` and
the failed migration before retrying. A failed build can leave an invalid index;
do not mark the migration applied or use `IF NOT EXISTS` to skip it without
checking that both new indexes are valid.

### Zero-downtime update

```bash
docker compose build api web
docker compose up -d --no-deps api nginx
```

---

## Backups

### Database

```bash
# Dump the database
docker compose exec postgres pg_dump -U chat chat > backup_$(date +%Y%m%d).sql

# Restore
cat backup_20260321.sql | docker compose exec -T postgres psql -U chat chat
```

### Uploads

```bash
# The uploads volume is at /var/lib/docker/volumes/jablu_uploads/_data
# Or use docker cp:
docker cp $(docker compose ps -q api):/data/uploads ./backup-uploads/
```

### Automated backups (cron)

```bash
crontab -e
```

Add:

```
0 4 * * * cd /opt/jablu && docker compose exec -T postgres pg_dump -U chat chat | gzip > /backups/jablu_$(date +\%Y\%m\%d).sql.gz
```

---

## Monitoring

### View logs

```bash
# All services
docker compose logs -f

# Specific service
docker compose logs -f api
docker compose logs -f nginx
docker compose logs -f livekit
```

### Email alerts on log errors (optional)

The **log-watcher** service polls `docker compose logs` for matching lines (by default Nest `ERROR [` and `WARN [` plus `Exception`, `Unhandled`, `FATAL`; override with `LOG_WATCHER_PATTERNS`) and emails a summary. It uses Docker Compose **profile** `log-watcher` and the same root `.env` as the API for SMTP.

1. Add `LOG_WATCHER_ALERT_TO` (and reuse your existing `SMTP_*` values) to the repo `.env`. See [`apps/log-watcher/.env.example`](../apps/log-watcher/.env.example).
2. From the machine where the repo lives, run:

```bash
bash apps/log-watcher/deploy.sh setup
```

Updates and day-two commands match the bot pattern:

```bash
bash apps/log-watcher/deploy.sh update
bash apps/log-watcher/deploy.sh logs
bash apps/log-watcher/deploy.sh stop
bash apps/log-watcher/deploy.sh warnings   # security / ops caveats only
```

`deploy.sh setup` and `deploy.sh update` print **warnings** about the Docker socket mount and `COMPOSE_PROJECT_NAME` before changing anything. `stop` stops only log-watcher, not the rest of the stack.

### Check resource usage

```bash
docker stats
```

### Health check

```bash
curl -s http://localhost/api/health
```

---

## Troubleshooting

### "502 Bad Gateway" from Nginx

The API container isn't ready yet. Check:

```bash
docker compose logs api
docker compose ps
```

Wait for the API health check to pass, or restart:

```bash
docker compose restart api
```

### Voice/video not connecting

LiveKit requires UDP ports to be open. Verify:

```bash
ufw status
# Ensure 7881/tcp and 50000:50100/udp are ALLOW
```

Also check that your provider's firewall/security group allows UDP inbound.

### TURN for restrictive networks

The Compose files pin LiveKit server `v1.13.10`, locally verified with `livekit-client`
`2.23.0` and `livekit-server-sdk` `2.19.2`. Upgrade the server image along with the
SDKs: `docker compose pull livekit && docker compose up -d livekit`. With the
Traefik deployment, include `-f docker-compose.yml -f docker-compose.traefik.yml`
in both commands so the selected TURN configuration and port mappings are used.

The LiveKit configurations set top-level `enable_data_tracks: true` to accept the
optional `_data_track` channel opened by the JavaScript SDK during voice joins.
Without it, LiveKit v1.10.0 closes that channel and the SDK may log
`DATA_TRACK_LOSSY closed unexpectedly` even while microphone audio remains
connected. This setting is separate from TURN and applies to direct calls too.
When upgrading an existing deployment, add it to the actual LiveKit config
(including the gitignored `livekit.turn.yaml` if selected) and restart LiveKit.

UDP remains the preferred media transport. The included configuration exposes
`7881/tcp` for clients whose networks block UDP. Open it in both the host firewall
and your VPS provider's firewall; it must go directly to LiveKit, outside the HTTP
reverse proxy. The current configuration uses UDP ports `50000–50100`; the mapped
`7882/udp` is unused unless you explicitly switch to `rtc.udp_port`.

Networks that permit only HTTPS may also require TURN/TLS on public port 443.
For an existing Traefik installation, an opt-in configuration is included:

1. Create a DNS-only A record such as `turn.example.com` pointing to your VPS
   (disable any HTTP CDN proxy for this record). Add these settings to `.env`:

   ```ini
   TURN_HOST=turn.example.com
   TURN_ENABLED=true
   LIVEKIT_CONFIG_FILE=./docker/livekit/livekit.turn.yaml
   ```

2. Copy `docker/livekit/livekit.turn.example.yaml` to
   `docker/livekit/livekit.turn.yaml` and set `turn.domain` to the same hostname.
   Keep `turn.relay_range_start: 50101` and `turn.relay_range_end: 50200` aligned
   with the `50101-50200/udp` mapping in `docker-compose.traefik.yml`. Allow this
   additional UDP range in the host/provider firewall. These are server-side
   relay sockets: clients on restrictive networks still connect over TCP 443.
3. Use the existing Traefik `web` Docker network, `websecure` entrypoint and
   `letsencrypt` certificate resolver described below. The existing Traefik
   override includes the TURN router; use the normal deployment command:

   ```bash
   docker compose -f docker-compose.yml -f docker-compose.traefik.yml config --quiet
   docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d
   ```

Traefik routes the TURN hostname using TCP SNI, terminates TLS on public port 443,
and forwards raw TURN to LiveKit's internal port 5349. Do not publish this plaintext
5349 listener to the internet or route it through an HTTP router. LiveKit advertises
TURN/TLS on port 443 when `external_tls` is enabled. The web hostname continues
using the existing HTTP router. TURN routing is disabled by default and enabled
by `TURN_ENABLED=true` in the existing Traefik override. `LIVEKIT_CONFIG_FILE`
selects the matching LiveKit server configuration. `deploy.sh` uses this same
two-file Compose command. The `docker/livekit/livekit.turn.yaml` file is
deployment-specific and gitignored: create or copy it on the VPS as part of the
initial TURN setup. To disable TURN, set `TURN_ENABLED=false` and remove
`LIVEKIT_CONFIG_FILE` so LiveKit returns to its standard configuration.

TURN allocations use a separate UDP range from `rtc.port_range_start/end`. In
Docker bridge mode, publishing only the SFU range is insufficient: return packets
to a TURN allocation's advertised public address must also reach its container
socket. The template uses `50101–50200/udp` for this purpose instead of LiveKit
v1.10.0's default TURN relay range of `30000–40000`. If upgrading an existing
deployment, update the gitignored `livekit.turn.yaml` on the VPS as well as the
Compose override, then recreate LiveKit to apply the port mapping. A successful
TLS handshake or unauthenticated TURN challenge does not verify this relay path.

An A record points the TURN hostname to the VPS's public IPv4 address. Add an AAAA
record only when that IPv6 address reaches the same Traefik instance on TCP 443;
otherwise leave AAAA absent. Existing wildcard DNS records may resolve a new
subdomain to a different hosting server, so verify the returned address against
the VPS before relying on it. TURN does not require an HTTP website at this hostname.

Without Traefik, use a separate TURN endpoint/public IP or an L4 TLS router. For
direct TLS termination in LiveKit, set `external_tls: false`, use `tls_port: 443`,
provide a trusted certificate and private key through read-only mounts, and ensure
the listener does not conflict with your HTTPS server. Domain names, certificates,
and firewall rules are deployment-specific; the optional TURN configuration is not
enabled by default.

After deploying, test calls from a network with UDP blocked, then from a network
allowing only TCP 443. Expand **Call quality** in the call UI to inspect the selected
transport. The LiveKit SDK's `force-tcp` and `force-tls` simulation scenarios can
also validate the fallback paths in a controlled test. A localhost test cannot
verify your VPS's public firewall, DNS, or certificates.

Reference: [LiveKit deployment and TURN guidance](https://docs.livekit.io/transport/self-hosting/deployment/).

### Using LiveKit Cloud instead of self-hosted

If you prefer not to self-host LiveKit (or need better scalability), you can use
[LiveKit Cloud](https://livekit.io/cloud) by updating three env vars in `.env`:

```ini
LIVEKIT_API_KEY=<your-cloud-api-key>
LIVEKIT_API_SECRET=<your-cloud-api-secret>
LIVEKIT_URL=wss://<your-project>.livekit.cloud
```

Then stop the self-hosted LiveKit container:

```bash
docker compose stop livekit
```

No code changes needed — the app connects to whatever `LIVEKIT_URL` points to.

### Database connection errors

```bash
docker compose logs postgres
docker compose exec postgres pg_isready -U chat
```

### Out of disk space

1. Go to Admin Panel > Storage tab to audit and clean up old attachments
2. Prune unused Docker images:

```bash
docker system prune -a
```

3. Check disk usage:

```bash
df -h
du -sh /var/lib/docker/volumes/*
```

---

## Environment Variables Reference

| Variable                  | Default                  | Description                            |
| ------------------------- | ------------------------ | -------------------------------------- |
| `SERVER_HOST`             | `192.168.1.100`          | Public IP or domain                    |
| `TLS_MODE`                | `off`                    | `off`, `self-signed`, or `letsencrypt` |
| `PORT`                    | `3001`                   | Internal API port                      |
| `POSTGRES_USER`           | `chat`                   | Database user                          |
| `POSTGRES_PASSWORD`       | (generated)              | Database password                      |
| `DATABASE_URL`            | (generated)              | Full PostgreSQL connection string      |
| `REDIS_URL`               | `redis://redis:6379`     | Redis connection                       |
| `JWT_SECRET`              | (generated)              | Access token signing key               |
| `JWT_REFRESH_SECRET`      | (generated)              | Refresh token signing key              |
| `LIVEKIT_API_KEY`         | (generated)              | LiveKit auth key                       |
| `LIVEKIT_API_SECRET`      | (generated)              | LiveKit auth secret                    |
| `LIVEKIT_URL`             | `ws://localhost/livekit` | LiveKit WebSocket URL                  |
| `REGISTRATION_MODE`       | `open`                   | `open` or `invite`                     |
| `SUPERADMIN_USERNAME`     | (set manually)           | Admin panel username                   |
| `SUPERADMIN_PASSWORD`     | (set manually)           | Admin panel password                   |
| `UPLOAD_DIR`              | `/data/uploads`          | File storage path                      |
| `MAX_UPLOAD_SIZE_MB`      | `50`                     | Max file upload size                   |
| `UPDATES_DIR`             | `/data/updates`          | Desktop app update artifacts           |
| `STORAGE_LIMIT_GB`        | `100`                    | Storage warning threshold              |
| `CLEANUP_ENABLED`         | `false`                  | Enable periodic storage audits         |
| `CLEANUP_CRON`            | `0 3 * * *`              | Audit schedule (cron syntax)           |
| `CLEANUP_MIN_AGE_DAYS`    | `30`                     | Minimum age for cleanup eligibility    |
| `CLEANUP_DELETE_MESSAGES` | `false`                  | Allow deleting entire messages         |
| `CLEANUP_ORPHAN_HOURS`    | `24`                     | Age threshold for orphaned uploads     |
| `SMTP_HOST`               | `mailpit`                | SMTP server                            |
| `SMTP_PORT`               | `1025`                   | SMTP port                              |
| `SMTP_USER`               | (empty)                  | SMTP username                          |
| `SMTP_PASS`               | (empty)                  | SMTP password                          |
| `SMTP_FROM`               | `noreply@chat.local`     | From address for emails                |

---

## Multi-Site Deployment with Traefik

If you want to run Jablu alongside other websites on the same VPS (each on its own
domain/subdomain), use **Traefik** as the edge proxy instead of letting Jablu handle
TLS directly. Traefik sits in front of everything, terminates TLS for all domains, and
routes traffic based on the hostname.

```
Internet
   │
   ▼
┌─────────────────────────────────────┐
│  Traefik (ports 80 + 443)          │
│  Let's Encrypt for all domains     │
│  Routes by Host header             │
└──┬──────────────┬──────────────┬───┘
   │              │              │
   ▼              ▼              ▼
 Jablu        Website A      Website B
 chat.example  example.com  other.com
  .com
```

### Step 1: Initial VPS Setup

SSH into your fresh VPS:

```bash
ssh root@YOUR_VPS_IP
```

Install Docker:

```bash
curl -fsSL https://get.docker.com | sh
```

Create a non-root user:

```bash
adduser jablu
usermod -aG docker jablu
su - jablu
```

### Step 2: Set Up DNS

In your domain registrar's DNS settings, add **A records** pointing to the VPS IP:

| Type | Name               | Value                                      |
| ---- | ------------------ | ------------------------------------------ |
| A    | `chat.example.com` | `YOUR_VPS_IP`                              |
| A    | `example.com`      | `YOUR_VPS_IP` (optional, for landing page) |

DNS propagation typically takes 5–30 minutes. Verify with:

```bash
dig chat.example.com +short
# Should return YOUR_VPS_IP
```

### Step 3: Set Up Traefik

Create the Traefik directory:

```bash
mkdir -p /opt/traefik
cd /opt/traefik
```

Create the shared Docker network that all services will join:

```bash
docker network create web
```

Create `docker-compose.yml`:

```yaml
services:
  traefik:
    image: traefik:v3.3
    environment:
      - DOCKER_API_VERSION=1.45
    ports:
      - '80:80'
      - '443:443'
    volumes:
      - /var/run/docker.sock:/var/run/docker.sock:ro
      - ./traefik.yml:/etc/traefik/traefik.yml:ro
      - ./acme.json:/acme.json
    networks:
      - web
    restart: unless-stopped

networks:
  web:
    external: true
```

Create `traefik.yml`:

```yaml
entryPoints:
  web:
    address: ':80'
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ':443'

providers:
  docker:
    exposedByDefault: false
    network: web

certificatesResolvers:
  letsencrypt:
    acme:
      email: admin@example.com
      storage: /acme.json
      httpChallenge:
        entryPoint: web
```

Create the cert storage file with correct permissions:

```bash
touch acme.json
chmod 600 acme.json
```

Start Traefik:

```bash
docker compose up -d
```

Verify it's running:

```bash
docker compose logs -f
# Should show "Configuration loaded from file: /etc/traefik/traefik.yml"
```

### Step 4: Open Firewall Ports

```bash
ufw allow 22/tcp           # SSH
ufw allow 80/tcp           # HTTP (Traefik redirects to HTTPS)
ufw allow 443/tcp          # HTTPS (Traefik)
ufw allow 7881/tcp         # LiveKit TCP fallback
ufw allow 50000:50100/udp  # LiveKit media ports
ufw enable
```

### Step 5: Deploy Jablu

Clone the repo:

```bash
git clone https://github.com/YOUR_REPO/chat.git /opt/jablu
cd /opt/jablu
```

Generate secrets:

```bash
chmod +x setup.sh
./setup.sh
```

Edit `.env`:

```bash
nano .env
```

Set these values:

```ini
# Domain — must match the DNS record from Step 2
SERVER_HOST=chat.example.com

# TLS is handled by Traefik, keep this off
TLS_MODE=off

# LiveKit needs the full WSS URL through Traefik
LIVEKIT_URL=wss://chat.example.com/livekit

# Production email
SMTP_HOST=smtp.mailgun.org
SMTP_PORT=587
SMTP_USER=postmaster@mg.example.com
SMTP_PASS=your-mailgun-password
SMTP_FROM=noreply@example.com

# Security
REGISTRATION_MODE=invite
SUPERADMIN_USERNAME=your-admin-username
SUPERADMIN_PASSWORD=your-strong-admin-password

# Storage
STORAGE_LIMIT_GB=150
CLEANUP_ENABLED=true
CLEANUP_MIN_AGE_DAYS=90
```

Start Jablu with the Traefik override:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d
```

This uses the `docker-compose.traefik.yml` override which:

- Removes ports 80/443 from Jablu's nginx (Traefik owns those)
- Adds Traefik routing labels for your domain
- Connects to the shared `web` network
- Applies a Traefik `rateLimit` middleware to `/api/admin` routes (10 req/s average, burst 20) to protect the admin panel from brute-force attacks at the edge — before traffic reaches Nginx or Node.js

### Step 6: Verify

Check all containers are running:

```bash
docker compose -f docker-compose.yml -f docker-compose.traefik.yml ps
```

Test HTTPS (Traefik auto-obtains the Let's Encrypt cert on first request):

```bash
# Should redirect to HTTPS
curl -I http://chat.example.com

# Should return 200 with valid TLS
curl -I https://chat.example.com/api/health
```

Open `https://chat.example.com` in your browser, go to `/admin`, log in, and create
your first server + invite codes.

### Adding Another Website

To add another site (e.g. a landing page at `example.com`), create its own directory:

```bash
mkdir -p /opt/my-website
cd /opt/my-website
```

Create a `docker-compose.yml` with Traefik labels:

```yaml
services:
  website:
    image: nginx:alpine
    volumes:
      - ./html:/usr/share/nginx/html:ro
    networks:
      - web
    labels:
      - 'traefik.enable=true'
      - 'traefik.http.routers.website.rule=Host(`example.com`)'
      - 'traefik.http.routers.website.entrypoints=websecure'
      - 'traefik.http.routers.website.tls.certresolver=letsencrypt'
      - 'traefik.http.services.website.loadbalancer.server.port=80'
    restart: unless-stopped

networks:
  web:
    external: true
```

```bash
mkdir html
echo "<h1>Welcome to Jablu</h1>" > html/index.html
docker compose up -d
```

Traefik auto-discovers the new service and obtains a cert for `example.com`. Each site
is fully independent — you can start/stop/update them without affecting others.

### Updating Jablu (behind Traefik)

```bash
cd /opt/jablu
git pull origin main
docker compose -f docker-compose.yml -f docker-compose.traefik.yml build
docker compose -f docker-compose.yml -f docker-compose.traefik.yml up -d
```

### Quick Reference: File Locations on VPS

| Path                  | Purpose                                      |
| --------------------- | -------------------------------------------- |
| `/opt/traefik/`       | Traefik edge proxy (shared across all sites) |
| `/opt/jablu/`         | Jablu chat application                       |
| `/opt/jablu-website/` | Landing page or other sites                  |

---

## Monthly Cost Summary

| Item                              | Cost                 |
| --------------------------------- | -------------------- |
| VPS (4 vCPU, 8 GB RAM)            | ~$7-15/mo            |
| Domain (optional)                 | ~$1/mo ($10-15/year) |
| Email sending (Mailgun free tier) | $0                   |
| **Total**                         | **~$7-11/mo**        |
