FROM node:22-alpine AS build

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json ./
RUN pnpm install

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

# --- Production ---
FROM node:22-alpine

RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json ./
RUN pnpm install --prod
COPY --from=build /app/dist ./dist

RUN mkdir -p /app/data
VOLUME /app/data

ENV DB_PATH=/app/data/bot.db

CMD ["node", "dist/index.js"]
