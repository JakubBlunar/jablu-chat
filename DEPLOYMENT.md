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

Consider implementing message/media retention (e.g. 90 days) to cap disk usage.
Without cleanup, media uploads can consume ~6-24 GB/year for images and ~12-60 GB/year
for videos, depending on usage.

## Setup Steps (high level)

1. Order a VPS (4 vCPU, 8 GB RAM) with Ubuntu LTS
2. SSH in, install Docker and Docker Compose
3. Clone the repo and copy `.env.example` to `.env`
4. Run `./setup.sh` to generate secrets
5. Configure `.env` with the VPS public IP as `SERVER_HOST`
6. For production email, set `SMTP_HOST`/`SMTP_PORT`/`SMTP_USER`/`SMTP_PASS` (e.g. Mailgun, Resend, or Gmail SMTP)
7. `docker compose up -d`
8. Run Prisma migrations: `docker compose exec api npx prisma migrate deploy`
9. Access the web app at `http://<VPS_IP>`

## Optional: Domain & TLS

- Point a domain (e.g. `chat.example.com`) A record to the VPS IP
- Set `SERVER_HOST=chat.example.com` and `TLS_MODE=letsencrypt` in `.env`
- Nginx will auto-obtain a Let's Encrypt certificate

## Monthly Cost Summary

| Item | Cost |
|---|---|
| VPS (4 vCPU, 8 GB RAM) | ~$7-10/mo |
| Domain (optional) | ~$1/mo ($10-15/year) |
| Email sending (Mailgun free tier) | $0 |
| **Total** | **~$7-11/mo** |
