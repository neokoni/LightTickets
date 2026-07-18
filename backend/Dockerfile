# syntax=docker/dockerfile:1

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS build

WORKDIR /app

COPY package.json ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm install

COPY tsconfig.json prisma.config.ts ./
COPY src ./src
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ENV NODE_ENV=production \
    LT_SERVER_DATA_DIR=/app/data \
    LT_SERVER_PORT=23320

WORKDIR /app

COPY package.json ./
COPY prisma ./prisma
COPY scripts ./scripts
RUN npm install --omit=dev && npm cache clean --force

COPY --from=build /app/dist ./dist
COPY templates ./templates
COPY openapi.json prisma.config.ts ./

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl \
  && rm -rf /var/lib/apt/lists/*

HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD ["node", "-e", "const port = process.env.LT_SERVER_PORT || '23320'; fetch(`http://127.0.0.1:${port}/api/health`).then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "dist/index.js"]
