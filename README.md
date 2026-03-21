# Jablu

A self-hosted Discord alternative for small communities. Text chat, voice/video calls, screen sharing — all running on your own server.

## Quick Start (Docker)

```bash
# 1. Generate secrets
./setup.sh

# 2. Edit .env — set SERVER_HOST to your server's IP
nano .env

# 3. Start everything
docker compose --profile dev up -d

# Web app:    http://<SERVER_HOST>
# Mailpit:    http://<SERVER_HOST>:8025 (dev email viewer)
```

## Local Development

```bash
# 1. Start infrastructure (PostgreSQL, Redis, Mailpit)
docker compose -f docker-compose.dev.yml up -d

# 2. Run database migrations
pnpm db:migrate:dev

# 3. Start all apps in dev mode
pnpm dev
```

The API runs on `http://localhost:3001` and the web app on `http://localhost:5173` (Vite proxies `/api` to the backend).

## Project Structure

```
chat/
├── apps/
│   ├── server/          # NestJS backend (REST API + WebSocket)
│   ├── web/             # React web app (Vite + TailwindCSS)
│   ├── desktop/         # Electron desktop app (Phase 5)
│   └── mobile/          # React Native mobile app (Phase 6)
├── packages/
│   └── shared/          # Shared types, validation schemas (Zod)
├── docker/
│   ├── nginx/           # Reverse proxy config
│   └── livekit/         # LiveKit media server config
├── docker-compose.yml       # Production stack
├── docker-compose.dev.yml   # Dev infrastructure only
└── setup.sh                 # Secret generation script
```

## Tech Stack

- **Backend:** NestJS, Prisma, PostgreSQL, Redis, Socket.io
- **Frontend:** React 19, Vite, TailwindCSS, Zustand, React Router
- **Voice/Video:** LiveKit (self-hosted WebRTC SFU)
- **Desktop:** Electron (Phase 5)
- **Mobile:** React Native + Expo (Phase 6 -- deferred)

## Phase 6: Mobile App (Deferred)

Phase 6 (React Native mobile app with Expo) is deferred for now. The planned scope includes:

- Shared API client and types from the web app
- Push notifications via FCM/APNs
- Voice/video calls via LiveKit React Native SDK
- Offline message caching
- Mobile-optimized UI with tab-based navigation

The web app is fully responsive and works well on mobile browsers in the meantime.
