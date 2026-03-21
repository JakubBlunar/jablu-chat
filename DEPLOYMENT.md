# Nook Deployment Guide — VPS

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
adduser nook
usermod -aG docker nook
su - nook
```

## Step 3: Clone and Configure

```bash
git clone https://github.com/YOUR_REPO/chat.git /opt/nook
cd /opt/nook
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
SMTP_FROM=nook@yourdomain.com

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
cd /opt/nook
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

### Free domain with Let's Encrypt

1. Point a domain (e.g. `nook.example.com`) A record to the VPS IP
2. Update `.env`:

```ini
SERVER_HOST=nook.example.com
TLS_MODE=letsencrypt
LIVEKIT_URL=wss://nook.example.com/livekit
```

3. Restart:

```bash
docker compose down
docker compose up -d
```

Nginx will automatically obtain and renew a Let's Encrypt certificate.

### Self-signed certificate (IP only, no domain)

```bash
./setup.sh   # will detect TLS_MODE=self-signed and generate certs
```

Note: Desktop/mobile clients will show a certificate warning with self-signed certs.

---

## Desktop App Updates

Nook's Electron desktop app supports automatic updates via `electron-updater`.

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
   - **Windows:** `Nook-Setup-1.1.0.exe` + `latest.yml`
   - **Linux:** `Nook-1.1.0.AppImage` + `latest-linux.yml`
   - **macOS:** `Nook-1.1.0.dmg` + `latest-mac.yml`

4. Copy the artifacts to the server:

```bash
scp apps/desktop/release/latest.yml root@YOUR_VPS_IP:/opt/nook/updates/
scp apps/desktop/release/Nook-Setup-1.1.0.exe root@YOUR_VPS_IP:/opt/nook/updates/
```

5. Make sure the `UPDATES_DIR` in `.env` points to the right location and the
   `updates` volume is mounted (or use a host path).

Connected desktop apps will detect the update within 4 hours (or immediately if the
user clicks "Check for updates" in Settings).

---

## Updating Nook (Server)

To deploy a new version of the web app and API:

```bash
cd /opt/nook
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
# The uploads volume is at /var/lib/docker/volumes/nook_uploads/_data
# Or use docker cp:
docker cp $(docker compose ps -q api):/data/uploads ./backup-uploads/
```

### Automated backups (cron)

```bash
crontab -e
```

Add:

```
0 4 * * * cd /opt/nook && docker compose exec -T postgres pg_dump -U chat chat | gzip > /backups/nook_$(date +\%Y\%m\%d).sql.gz
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

## Monthly Cost Summary

| Item | Cost |
|---|---|
| VPS (4 vCPU, 8 GB RAM) | ~$7-10/mo |
| Domain (optional) | ~$1/mo ($10-15/year) |
| Email sending (Mailgun free tier) | $0 |
| **Total** | **~$7-11/mo** |
