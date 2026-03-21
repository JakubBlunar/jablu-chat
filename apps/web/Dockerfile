# ─── Dependencies ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# ─── Build shared package ───────────────────────────────────────────
FROM deps AS build-shared
COPY packages/shared/ ./packages/shared/
RUN pnpm --filter @chat/shared build

# ─── Build web app ──────────────────────────────────────────────────
FROM build-shared AS build
COPY apps/web/ ./apps/web/
RUN pnpm --filter @chat/web build

# ─── Output: copy built files to volume on startup ──────────────────
FROM alpine:3.20
COPY --from=build /app/apps/web/dist /dist
CMD ["sh", "-c", "cp -r /dist/* /output/ && echo 'Web assets copied to /output'"]
