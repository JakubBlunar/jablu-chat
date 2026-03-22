# Jablu Deployment Guide — VPS

## Recommended Plan

**VPS (4 vCPU, 8 GB RAM)** (~$7-10/mo)

| Spec | Value |
|---|---|
| vCPU | 4 cores |
| RAM | 8 GB |
| Storage | 200 GB NVMe |
| Traffic | 32 TB/month (unlimited inbound) |
| OS | Ubuntu 22.04 or 24.04 LTS |
| Region | EU (Nuremberg/Munich) or US (St. Louis/Seattle) |

This comfortably handles all services for under 20 concurrent users, including voice/video calls.

## Services Running on the VPS

| Service | Port | Purpose |
|---|---|---|
| Nginx | 80 (443 with TLS) | Reverse proxy, serves web frontend |
| Node.js API | 3001 | Backend (NestJS + Socket.io) |
| PostgreSQL | 5432 | Database |
| Redis | 6379 | Cache, presence |
| LiveKit | 7880, 7882/udp, 50000-50100/udp | Voice/video/screen share (WebRTC) |
| Mailpit (dev) / SMTP (prod) | 1025 / 587 | Email for password resets |

## Estimated Resource Usage (20 users)

| Resource | Idle | Active (voice/video) |
|---|---|---|
| CPU | ~5% | ~30-50% (during calls) |
| RAM | ~1.5 GB | ~2-3 GB |
| Disk | ~2-5 GB (base) | Grows with media uploads |
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

## Step 1: Order the VPS

1. Go to [contabo.com](https://contabo.com) and order a **VPS S** (or higher)
2. Select **Ubuntu 22.04** or **24.04 LTS** as the OS
3. Choose the region closest to your community
4. Note the **public IP address** from your order confirmation email

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

# Set a strong superadmin password
SUPERADMIN_PASSWORD=your-strong-admin-password

# Storage cleanup (enable periodic audits)
STORAGE_LIMIT_GB=150
CLEANUP_ENABLED=true
CLEANUP_MIN_AGE_DAYS=90
```

The setup script auto-generates `JWT_SECRET`, `JWT_REFRESH_SECRET`, `POSTGRES_PASSWORD`,
`LIVEKIT_API_KEY`, and `LIVEKIT_API_SECRET` — don't change those unless you know what
you're doing.

## Step 4: Open Firewall Ports

If you have a firewall (e.g. `ufw`), open the required ports:

```bash
ufw allow 22/tcp       # SSH
ufw allow 80/tcp       # HTTP
ufw allow 443/tcp      # HTTPS (if using TLS)
ufw allow 7882/udp     # LiveKit WebRTC
ufw allow 50000:50100/udp  # LiveKit media ports
ufw enable
```

Your provider's default firewall policy allows all traffic, but verify in their control panel
under **Firewall Configuration** that inbound UDP is not blocked.

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

1. Go to `/admin` and log in with your `SUPERADMIN_PASSWORD`
2. Create your first server in the Servers tab
3. If using invite mode, create invite codes in the Invites tab
4. Register your own account and join the server

---

## Optional: Domain & TLS

Jablu supports three TLS modes controlled by the `TLS_MODE` environment variable:

| Mode | Value | Use case |
|---|---|---|
| HTTP only | `off` (default) | Local dev, IP-only access |
| Self-signed | `self-signed` | IP-only with HTTPS (shows browser warning) |
| Let's Encrypt | `letsencrypt` | Production with a real domain |

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

Jablu's Electron desktop app supports automatic updates via `electron-updater`.

### How it works

The desktop app checks `YOUR_SERVER/api/updates/` for new versions. When it finds one,
it downloads in the background and prompts the user to restart.

### Publishing an update

1. Bump the version in `apps/desktop/package.json`:

```json
"version": "1.1.0"
```

2. Build the desktop app on your dev machine:

```bash
pnpm --filter @chat/web build
pnpm --filter @chat/desktop build
pnpm --filter @chat/desktop dist
```

3. The build artifacts appear in `apps/desktop/release/`:
   - **Windows:** `Jablu-Setup-1.1.0.exe` + `latest.yml`
   - **Linux:** `Jablu-1.1.0.AppImage` + `latest-linux.yml`
   - **macOS:** `Jablu-1.1.0.dmg` + `latest-mac.yml`

4. Copy the artifacts to the server:

```bash
scp apps/desktop/release/latest.yml root@YOUR_VPS_IP:/opt/jablu/updates/
scp apps/desktop/release/Jablu-Setup-1.1.0.exe root@YOUR_VPS_IP:/opt/jablu/updates/
```

5. Make sure the `UPDATES_DIR` in `.env` points to the right location and the
   `updates` volume is mounted (or use a host path).

Connected desktop apps will detect the update within 4 hours (or immediately if the
user clicks "Check for updates" in Settings).

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
# Ensure 7882/udp and 50000:50100/udp are ALLOW
```

Also check that Your provider's firewall allows UDP inbound.

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

| Variable | Default | Description |
|---|---|---|
| `SERVER_HOST` | `192.168.1.100` | Public IP or domain |
| `TLS_MODE` | `off` | `off`, `self-signed`, or `letsencrypt` |
| `PORT` | `3001` | Internal API port |
| `POSTGRES_USER` | `chat` | Database user |
| `POSTGRES_PASSWORD` | (generated) | Database password |
| `DATABASE_URL` | (generated) | Full PostgreSQL connection string |
| `REDIS_URL` | `redis://redis:6379` | Redis connection |
| `JWT_SECRET` | (generated) | Access token signing key |
| `JWT_REFRESH_SECRET` | (generated) | Refresh token signing key |
| `LIVEKIT_API_KEY` | (generated) | LiveKit auth key |
| `LIVEKIT_API_SECRET` | (generated) | LiveKit auth secret |
| `LIVEKIT_URL` | `ws://localhost/livekit` | LiveKit WebSocket URL |
| `REGISTRATION_MODE` | `open` | `open` or `invite` |
| `SUPERADMIN_PASSWORD` | (set manually) | Admin panel password |
| `UPLOAD_DIR` | `/data/uploads` | File storage path |
| `MAX_UPLOAD_SIZE_MB` | `50` | Max file upload size |
| `UPDATES_DIR` | `/data/updates` | Desktop app update artifacts |
| `STORAGE_LIMIT_GB` | `100` | Storage warning threshold |
| `CLEANUP_ENABLED` | `false` | Enable periodic storage audits |
| `CLEANUP_CRON` | `0 3 * * *` | Audit schedule (cron syntax) |
| `CLEANUP_MIN_AGE_DAYS` | `30` | Minimum age for cleanup eligibility |
| `CLEANUP_DELETE_MESSAGES` | `false` | Allow deleting entire messages |
| `CLEANUP_ORPHAN_HOURS` | `24` | Age threshold for orphaned uploads |
| `SMTP_HOST` | `mailpit` | SMTP server |
| `SMTP_PORT` | `1025` | SMTP port |
| `SMTP_USER` | (empty) | SMTP username |
| `SMTP_PASS` | (empty) | SMTP password |
| `SMTP_FROM` | `noreply@chat.local` | From address for emails |

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
 chat.example.com  example.com     other.com
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

| Type | Name | Value |
|---|---|---|
| A | `chat.example.com` | `YOUR_VPS_IP` |
| A | `example.com` | `YOUR_VPS_IP` (optional, for landing page) |

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
      - "80:80"
      - "443:443"
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
    address: ":80"
    http:
      redirections:
        entryPoint:
          to: websecure
          scheme: https
  websecure:
    address: ":443"

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
ufw allow 7882/udp         # LiveKit WebRTC
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
SMTP_FROM=jablu@example.com

# Security
REGISTRATION_MODE=invite
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
- Adds Traefik routing labels for `chat.example.com`
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
mkdir -p /opt/jablu-website
cd /opt/jablu-website
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
      - "traefik.enable=true"
      - "traefik.http.routers.website.rule=Host(`example.com`)"
      - "traefik.http.routers.website.entrypoints=websecure"
      - "traefik.http.routers.website.tls.certresolver=letsencrypt"
      - "traefik.http.services.website.loadbalancer.server.port=80"
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

| Path | Purpose |
|---|---|
| `/opt/traefik/` | Traefik edge proxy (shared across all sites) |
| `/opt/jablu/` | Jablu chat application |
| `/opt/jablu-website/` | Landing page or other sites |

---

## Monthly Cost Summary

| Item | Cost |
|---|---|
| VPS (4 vCPU, 8 GB RAM) | ~$7-10/mo |
| Domain (optional) | ~$1/mo ($10-15/year) |
| Email sending (Mailgun free tier) | $0 |
| **Total** | **~$7-11/mo** |
