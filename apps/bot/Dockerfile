FROM node:22-alpine AS build

RUN apk add --no-cache python3 make g++
RUN corepack enable && corepack prepare pnpm@latest --activate

WORKDIR /app
COPY package.json ./

RUN pnpm install
COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

RUN rm -rf node_modules
RUN pnpm install --prod

# --- Production (clean, no build tools) ---
FROM node:22-alpine

WORKDIR /app
COPY --from=build /app/dist ./dist
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./

RUN mkdir -p /app/data
VOLUME /app/data

ENV DB_PATH=/app/data/bot.db

CMD ["node", "dist/index.js"]
