# ─── Dependencies ────────────────────────────────────────────────────
FROM node:22-alpine AS deps
RUN corepack enable && corepack prepare pnpm@10.32.1 --activate
WORKDIR /app

COPY package.json pnpm-workspace.yaml pnpm-lock.yaml tsconfig.base.json .npmrc ./
COPY packages/shared/package.json ./packages/shared/
COPY apps/web/package.json ./apps/web/

RUN pnpm install --frozen-lockfile

# ─── Build shared package ───────────────────────────────────────────
FROM deps AS build-shared
COPY packages/shared/src/ ./packages/shared/src/
COPY packages/shared/tsconfig.json packages/shared/tsconfig.cjs.json ./packages/shared/
COPY packages/shared/scripts/ ./packages/shared/scripts/
RUN pnpm --filter @chat/shared build

# ─── Build web app ──────────────────────────────────────────────────
FROM build-shared AS build
COPY apps/web/src/ ./apps/web/src/
COPY apps/web/public/ ./apps/web/public/
COPY apps/web/index.html apps/web/vite.config.ts ./apps/web/
COPY apps/web/tsconfig.json apps/web/tsconfig.app.json apps/web/tsconfig.node.json apps/web/tsconfig.test.json ./apps/web/
RUN pnpm --filter @chat/web exec vite build

# ─── Output: copy built files to volume on startup ──────────────────
FROM alpine:3.20
COPY --from=build /app/apps/web/dist /dist
CMD ["sh", "-c", "cp -r /dist/* /output/ && echo 'Web assets copied to /output'"]
