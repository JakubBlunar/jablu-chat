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
COPY packages/shared/tsconfig.json packages/shared/tsconfig.cjs.json ./packages/shared/
COPY packages/shared/scripts/ ./packages/shared/scripts/
RUN pnpm --filter @chat/shared build

# ─── Generate Prisma client ─────────────────────────────────────────
FROM build-shared AS prisma-generate
COPY apps/server/prisma/ ./apps/server/prisma/
COPY apps/server/prisma.config.ts ./apps/server/prisma.config.ts
# prisma.config.ts requires DATABASE_URL; generate does not connect to the DB
ENV DATABASE_URL=postgresql://build:build@127.0.0.1:5432/build
RUN pnpm --filter @chat/server db:generate

# ─── Build server ───────────────────────────────────────────────────
FROM prisma-generate AS build
COPY apps/server/src/ ./apps/server/src/
COPY apps/server/nest-cli.json apps/server/tsconfig.json apps/server/tsconfig.build.json ./apps/server/
RUN pnpm --filter @chat/server build

# ─── Production bundle (only server prod deps) ──────────────────────
FROM build AS prod-bundle
RUN pnpm --filter @chat/server deploy --prod --no-optional /prod && \
    # Remove bulky dev/unused artifacts
    rm -rf /prod/node_modules/.pnpm/prisma@* \
           /prod/node_modules/.pnpm/typescript@* \
           /prod/node_modules/.pnpm/@prisma+engines@* \
           /prod/node_modules/.pnpm/effect@* \
           /prod/node_modules/.pnpm/@effect* \
           /prod/node_modules/prisma \
           /prod/node_modules/typescript \
           /prod/node_modules/@types && \
    # Prisma 7: optional peer pulls full `prisma` CLI (Studio, PGlite, sqlite) — not used at runtime with driver adapter
    rm -rf /prod/node_modules/.pnpm/@prisma+studio-core@* \
           /prod/node_modules/.pnpm/@prisma+dev@* \
           /prod/node_modules/.pnpm/@electric-sql+pglite@* \
           /prod/node_modules/.pnpm/@electric-sql+pglite-tools@* \
           /prod/node_modules/.pnpm/@electric-sql+pglite-socket@* \
           /prod/node_modules/.pnpm/better-sqlite3@* && \
    # Postgres only: drop non-PostgreSQL query compiler WASM from @prisma/client runtime (v7 file names)
    find /prod/node_modules -path '*/node_modules/@prisma/client/runtime/*' \( \
         -name 'query_compiler_*mysql*' -o \
         -name 'query_compiler_*sqlite*' -o \
         -name 'query_compiler_*sqlserver*' -o \
         -name 'query_compiler_*cockroachdb*' \
       \) -delete && \
    find /prod/node_modules -path '*/node_modules/@prisma/client/runtime/*.map' -delete && \
    # Remove ffprobe-static binaries for platforms we don't run on (keep only linux-x64)
    find /prod/node_modules -path '*/ffprobe-static/bin/darwin' -type d -exec rm -rf {} + && \
    find /prod/node_modules -path '*/ffprobe-static/bin/win32' -type d -exec rm -rf {} + && \
    find /prod/node_modules -path '*/ffprobe-static/bin/linux/ia32' -type d -exec rm -rf {} +

# ─── Migration runner (target: migrate) ─────────────────────────────
FROM node:22-alpine AS migrate
RUN npm install -g prisma@7.7 && npm cache clean --force
WORKDIR /app
COPY --from=prisma-generate /app/apps/server/prisma ./prisma
COPY --from=prisma-generate /app/apps/server/prisma.config.ts ./prisma.config.ts
CMD ["prisma", "migrate", "deploy"]

# ─── Production image ───────────────────────────────────────────────
FROM node:22-alpine AS production
RUN apk add --no-cache su-exec && \
    addgroup -S app && adduser -S app -G app && \
    mkdir -p /data/uploads /data/updates /data/downloads

WORKDIR /app

COPY --from=prod-bundle --chown=app:app /prod/node_modules ./node_modules
COPY --from=prod-bundle --chown=app:app /prod/package.json ./
COPY --from=build --chown=app:app /app/apps/server/dist ./dist

EXPOSE 3001
CMD chown -R app:app /data && exec su-exec app node dist/main.js
