# syntax=docker/dockerfile:1
# ─── Dependencies (full workspace package.json set for frozen lockfile) ─
FROM node:24.14.1-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY apps/log-watcher/package.json ./apps/log-watcher/

RUN pnpm install --frozen-lockfile --filter @chat/log-watcher...

# ─── Build ───────────────────────────────────────────────────────────
FROM deps AS build
COPY apps/log-watcher/tsconfig.json ./apps/log-watcher/
COPY apps/log-watcher/src ./apps/log-watcher/src
RUN pnpm --filter @chat/log-watcher build

# ─── Production bundle ───────────────────────────────────────────────
FROM build AS prod-bundle
RUN pnpm --filter @chat/log-watcher deploy --prod /prod

# ─── Runtime (Docker CLI + compose plugin for `docker compose logs`) ─
FROM node:24.14.1-alpine AS production
RUN apk add --no-cache ca-certificates docker-cli docker-cli-compose

WORKDIR /app
COPY --from=prod-bundle /prod/node_modules ./node_modules
COPY --from=prod-bundle /prod/package.json ./
COPY --from=build /app/apps/log-watcher/dist ./dist

ENV LOG_WATCHER_STATE_PATH=/data/state.json
VOLUME /data

USER root
CMD ["node", "dist/index.js"]
