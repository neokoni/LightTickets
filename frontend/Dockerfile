# syntax=docker/dockerfile:1

ARG NODE_VERSION=24

FROM node:${NODE_VERSION}-bookworm-slim AS build

WORKDIR /app

COPY package.json ./
RUN npm install

COPY . .
ARG LT_WEB_API_URL=/api
ARG LT_GIT_COMMIT=unknow
ENV LT_WEB_API_URL=${LT_WEB_API_URL}
ENV LT_GIT_COMMIT=${LT_GIT_COMMIT}
RUN npm run build

FROM node:${NODE_VERSION}-bookworm-slim AS runtime

ENV NODE_ENV=production \
    LT_WEB_HOST=0.0.0.0 \
    LT_WEB_PORT=23310

WORKDIR /app

COPY --from=build /app/dist ./dist
COPY runtime-config.mjs server.mjs ./

USER node

EXPOSE 23310

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["node", "-e", "const port = process.env.LT_WEB_PORT || '23310'; fetch(`http://127.0.0.1:${port}/`).then(r => { if (!r.ok) process.exit(1) }).catch(() => process.exit(1))"]

CMD ["node", "server.mjs"]
