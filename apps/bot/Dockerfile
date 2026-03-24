FROM node:20-alpine

RUN npm i -g pnpm@9

WORKDIR /app

COPY package.json pnpm-lock.yaml* ./
RUN pnpm install --frozen-lockfile 2>/dev/null || pnpm install

COPY tsconfig.json ./
COPY src ./src
RUN pnpm build

RUN mkdir -p /app/data

ENV DB_PATH=/app/data/bot.db

CMD ["node", "dist/index.js"]
