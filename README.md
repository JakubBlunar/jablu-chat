# Jablu

A fully self-hosted Discord alternative for small communities. Text chat, voice/video calls, screen sharing, threads, reactions, polls, events — all running on your own server with zero third-party dependencies.

## Features

### Messaging
- **Text channels** organized in categories with drag-and-drop reordering
- **Direct messages** and **group DMs**
- **Threads** for focused conversations within channels
- **Replies**, **reactions**, and **polls**
- **Pinned messages** and **bookmarks** (saved messages)
- **Message search** with `has:` and `from:` filters
- **Markdown** with syntax-highlighted code blocks
- **File attachments** (images, videos, documents) with lightbox preview
- **Link previews** with OpenGraph metadata
- **GIF picker** (via Giphy API, optional)
- **Typing indicators** and **read receipts**
- **Webhooks** for external integrations

### Bot Support
- **First-class bot users** with full messaging capabilities
- **Slash commands** with autocomplete in the message input
- **Permission-gated commands** — restrict bot commands to users with specific permissions
- **Bot SDK** (`@chat/sdk`) — TypeScript library for building bots with event handling, slash commands, and local storage
- **Bot management UI** — create bots, generate tokens, add/remove bots from servers
- **FreeGameBot** — built-in example bot that monitors free game deals

### Voice & Video
- **Voice channels** powered by [LiveKit](https://livekit.io/) (self-hosted WebRTC SFU)
- **Video calls** with camera controls
- **Screen sharing** (including native picker on the desktop app)
- Works out of the box with the bundled self-hosted LiveKit, or swap in [LiveKit Cloud](https://livekit.io/cloud) by changing three env vars

### Servers & Permissions
- **Servers** with categories, text channels, and voice channels
- **Role-based permissions** with granular bitfield system (manage channels, messages, kick, ban, roles, webhooks, events, and more)
- **Channel permission overrides** — allow/deny specific permissions per role per channel
- **Invite system** with configurable codes

### Moderation
- **AutoMod** — word filter (block/flag), link filter, spam detection
- **Ban** and **kick** members
- **Audit log** for tracking moderation actions
- **Server-level** and **instance-level** moderation tools

### Events
- **Server events** — create, schedule, and manage community events
- **Interest tracking** so members can mark attendance

### Notifications
- **Per-channel notification preferences** (all, mentions only, muted)
- **Web Push notifications** (VAPID)
- **Desktop notifications** with tray badge and window flash

### Customization
- **Accent color picker** for personalized theming
- **User status** (online, idle, DND) with custom status messages
- **Profile** settings with avatar upload

### Admin Panel (`/admin`)
- **Dashboard** with instance statistics
- **Server management** — create, edit, delete servers
- **User management** — view, edit, ban users
- **Invite management** — create and revoke invite codes
- **Storage auditing** — monitor disk usage, clean up old attachments
- **Moderation tools** — browse and delete messages across the instance
- **Audit log** — instance-wide action history
- **Push notification** management
- **Webhook** management

### Desktop App
- **Electron** app that connects to any Jablu instance
- **Auto-updates** via the built-in update server
- **Tray support** with unread count
- **Auto-launch** at OS startup
- **Native screen capture** for screen sharing

### Mobile
- The web app is **fully responsive** and works well on mobile browsers
- **PWA support** — installable from the browser with offline capabilities

---

## Quick Start (Docker)

```bash
# 1. Clone the repo
git clone https://github.com/YOUR_USERNAME/jablu-chat.git
cd jablu-chat

# 2. Generate secrets
./setup.sh

# 3. Edit .env — set SERVER_HOST to your server's IP or domain
nano .env

# 4. Start everything
docker compose up -d

# Web app:    http://<SERVER_HOST>
# Admin:      http://<SERVER_HOST>/admin
# Mailpit:    http://<SERVER_HOST>:8025 (dev email viewer)
```

## Local Development

```bash
# 1. Install dependencies
pnpm install

# 2. Start infrastructure (PostgreSQL, Redis, Mailpit)
docker compose -f docker-compose.dev.yml up -d

# 3. Run database migrations
pnpm db:migrate:dev

# 4. Start all apps in dev mode
pnpm dev
```

The API runs on `http://localhost:3001` and the web app on `http://localhost:5173` (Vite proxies `/api` to the backend).

---

## Project Structure

```
jablu-chat/
├── apps/
│   ├── server/          # NestJS backend (REST API + WebSocket gateway)
│   ├── web/             # React SPA (Vite + Tailwind CSS)
│   ├── desktop/         # Electron desktop app
│   └── bot/             # FreeGameBot — example bot built with the SDK
├── packages/
│   ├── shared/          # Shared types, validation schemas (Zod), permissions
│   └── sdk/             # Bot SDK — TypeScript library for building Jablu bots
├── docker/
│   ├── nginx/           # Reverse proxy + TLS termination
│   └── livekit/         # LiveKit media server config
├── docker-compose.yml           # Production stack
├── docker-compose.dev.yml       # Dev infrastructure only
├── docker-compose.traefik.yml   # Override for multi-site Traefik setup
├── deploy.sh                    # One-command deploy script
└── setup.sh                     # Secret generation script
```

## Tech Stack

| Layer        | Technology                                       |
| ------------ | ------------------------------------------------ |
| **Backend**  | NestJS 11, Prisma, PostgreSQL, Redis, Socket.IO  |
| **Frontend** | React 19, TypeScript, Vite 8, Tailwind CSS v4, Zustand |
| **Voice**    | LiveKit (self-hosted WebRTC SFU)                 |
| **Desktop**  | Electron with auto-updates                       |
| **Bots**     | `@chat/sdk`, Socket.IO, better-sqlite3           |
| **Tooling**  | pnpm workspaces, Turborepo                       |

---

## Deployment

See [DEPLOYMENT.md](./DEPLOYMENT.md) for a complete step-by-step guide covering:

- VPS provisioning and requirements
- Docker setup and configuration
- Domain and TLS (Let's Encrypt or self-signed)
- Multi-site deployment with Traefik
- Desktop app builds and updates
- Backups, monitoring, and troubleshooting
- Full environment variable reference

### Minimum VPS Requirements

| Spec    | Minimum               |
| ------- | --------------------- |
| vCPU    | 2+ cores              |
| RAM     | 4+ GB                 |
| Storage | 40+ GB SSD/NVMe       |
| OS      | Ubuntu 22.04 or 24.04 |

---

## Environment Variables

All configuration is done through a single `.env` file. Run `./setup.sh` to generate secrets automatically. See [`.env.example`](./.env.example) for all available options with descriptions.

Key variables:

| Variable            | Description                                         |
| ------------------- | --------------------------------------------------- |
| `SERVER_HOST`       | Public IP or domain                                 |
| `TLS_MODE`          | `off`, `self-signed`, or `letsencrypt`              |
| `REGISTRATION_MODE` | `open` or `invite`                                  |
| `LIVEKIT_URL`       | WebSocket URL for voice/video                       |
| `SMTP_*`            | Email settings for password resets                   |
| `VAPID_*`           | Web Push notification keys                           |
| `GIPHY_API_KEY`     | Optional — enables GIF picker                        |
| `STORAGE_LIMIT_GB`  | Disk usage warning threshold                         |
| `CLEANUP_ENABLED`   | Enable automatic old attachment cleanup               |

---

## Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/my-feature`)
3. Make your changes and ensure `pnpm typecheck` passes
4. Commit and push
5. Open a pull request

---

## License

This project is licensed under the [Elastic License 2.0 (ELv2)](./LICENSE). You are free to use, modify, and distribute it — the only restriction is you cannot offer it as a hosted/managed service to third parties.
