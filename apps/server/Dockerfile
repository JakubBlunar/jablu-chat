# ─── Dependencies ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile

# ─── Build shared package ───────────────────────────────────────────
FROM deps AS build-shared
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @chat/shared build

# ─── Generate Prisma client ─────────────────────────────────────────
FROM build-shared AS prisma-generate
COPY apps/server/prisma/ ./apps/server/prisma/
RUN pnpm --filter @chat/server db:generate

# ─── Migration runner (target: migrate) ─────────────────────────────
FROM prisma-generate AS migrate
CMD ["pnpm", "--filter", "@chat/server", "db:migrate:deploy"]

# ─── Build server ───────────────────────────────────────────────────
FROM prisma-generate AS build
COPY apps/server/ ./apps/server/
RUN pnpm --filter @chat/server build

# ─── Production image ───────────────────────────────────────────────
FROM node:22-alpine AS production
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/server/node_modules ./apps/server/node_modules
COPY --from=build /app/apps/server/dist ./apps/server/dist
COPY --from=build /app/apps/server/package.json ./apps/server/
COPY --from=build /app/packages/shared/dist ./packages/shared/dist
COPY --from=build /app/packages/shared/package.json ./packages/shared/
COPY --from=build /app/package.json ./
COPY --from=build /app/pnpm-workspace.yaml ./

RUN mkdir -p /data/uploads

EXPOSE 3001
WORKDIR /app/apps/server
CMD ["node", "dist/main.js"]
