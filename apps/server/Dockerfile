# ─── Dependencies ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/server/package.json ./apps/server/

RUN pnpm install --frozen-lockfile

# ─── Build shared package ───────────────────────────────────────────
FROM deps AS build-shared
COPY packages/shared/src/ ./packages/shared/src/
COPY packages/shared/tsconfig.json ./packages/shared/
RUN pnpm --filter @chat/shared build

# ─── Generate Prisma client ─────────────────────────────────────────
FROM build-shared AS prisma-generate
COPY apps/server/prisma/ ./apps/server/prisma/
RUN pnpm --filter @chat/server db:generate

# ─── Build server ───────────────────────────────────────────────────
FROM prisma-generate AS build
COPY apps/server/src/ ./apps/server/src/
COPY apps/server/nest-cli.json apps/server/tsconfig.json ./apps/server/
RUN pnpm --filter @chat/server build

# ─── Production bundle (only server prod deps) ──────────────────────
FROM build AS prod-bundle
RUN pnpm --filter @chat/server deploy --prod /prod && \
    src=$(find /app/node_modules -path '*/.prisma/client' -type d | head -1) && \
    dest=$(find /prod/node_modules -path '*/@prisma/client' -type d | head -1) && \
    nm_dir="$(dirname "$(dirname "$dest")")" && \
    mkdir -p "$nm_dir/.prisma" && \
    cp -r "$src" "$nm_dir/.prisma/client" && \
    # Remove bulky dev/unused artifacts
    rm -rf /prod/node_modules/.pnpm/prisma@* \
           /prod/node_modules/.pnpm/typescript@* \
           /prod/node_modules/.pnpm/@prisma+engines@* \
           /prod/node_modules/.pnpm/effect@* \
           /prod/node_modules/.pnpm/@effect* \
           /prod/node_modules/prisma \
           /prod/node_modules/typescript \
           /prod/node_modules/@types && \
    # Remove Prisma WASM engines for databases we don't use (keep only postgresql)
    find /prod/node_modules -path '*/runtime/query_engine_bg.cockroachdb*' -delete && \
    find /prod/node_modules -path '*/runtime/query_engine_bg.mysql*' -delete && \
    find /prod/node_modules -path '*/runtime/query_engine_bg.sqlserver*' -delete && \
    find /prod/node_modules -path '*/runtime/query_engine_bg.sqlite*' -delete && \
    # Remove ffprobe-static binaries for platforms we don't run on (keep only linux-x64)
    find /prod/node_modules -path '*/ffprobe-static/bin/darwin' -type d -exec rm -rf {} + && \
    find /prod/node_modules -path '*/ffprobe-static/bin/win32' -type d -exec rm -rf {} + && \
    find /prod/node_modules -path '*/ffprobe-static/bin/linux/ia32' -type d -exec rm -rf {} +

# ─── Migration runner (target: migrate) ─────────────────────────────
FROM node:22-alpine AS migrate
RUN npm install -g prisma@6 && npm cache clean --force
WORKDIR /app
COPY --from=prisma-generate /app/apps/server/prisma ./prisma
CMD ["prisma", "migrate", "deploy"]

# ─── Production image ───────────────────────────────────────────────
FROM node:22-alpine AS production
RUN addgroup -S app && adduser -S app -G app && \
    mkdir -p /data/uploads && chown app:app /data/uploads

WORKDIR /app

COPY --from=prod-bundle --chown=app:app /prod/node_modules ./node_modules
COPY --from=prod-bundle --chown=app:app /prod/package.json ./
COPY --from=build --chown=app:app /app/apps/server/dist ./dist

USER app
EXPOSE 3001
CMD ["node", "dist/main.js"]
