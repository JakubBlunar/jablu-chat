# ─── Dependencies ────────────────────────────────────────────────────
FROM node:24.14.1-alpine AS deps
RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY packages/sdk/package.json ./packages/sdk/
COPY apps/bot/package.json ./apps/bot/

RUN pnpm install --frozen-lockfile

# ─── Build shared package ───────────────────────────────────────────
FROM deps AS build-shared
COPY packages/shared/src/ ./packages/shared/src/
COPY packages/shared/tsconfig.json packages/shared/tsconfig.cjs.json ./packages/shared/
COPY packages/shared/scripts/ ./packages/shared/scripts/
RUN pnpm --filter @chat/shared build

# ─── Build SDK ───────────────────────────────────────────────────────
FROM build-shared AS build-sdk
COPY packages/sdk/src/ ./packages/sdk/src/
COPY packages/sdk/tsconfig.json packages/sdk/tsup.config.ts ./packages/sdk/
RUN pnpm --filter @chat/sdk build

# ─── Build bot ───────────────────────────────────────────────────────
FROM build-sdk AS build
COPY apps/bot/src/ ./apps/bot/src/
COPY apps/bot/tsconfig.json ./apps/bot/
RUN pnpm --filter @chat/bot build

# ─── Production bundle ──────────────────────────────────────────────
FROM build AS prod-bundle
RUN pnpm --filter @chat/bot deploy --prod /prod

# ─── Production image ───────────────────────────────────────────────
FROM node:24.14.1-alpine
WORKDIR /app
COPY --from=prod-bundle /prod/node_modules ./node_modules
COPY --from=prod-bundle /prod/package.json ./
COPY --from=build /app/apps/bot/dist ./dist

RUN mkdir -p /app/data
VOLUME /app/data

ENV DB_PATH=/app/data/bot.db
CMD ["node", "dist/index.js"]
