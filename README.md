<div align="center">

<a href="https://github.com/neokoni/LightTickets" target="_blank">
    <img src="banner.png" alt="banner" style="width: 25em"></img>
</a>

[![License: MIT](https://img.shields.io/github/license/neokoni/LightTickets)](LICENSE)
[![Dev Build Artifacts](https://github.com/neokoni/LightTickets/actions/workflows/dev-build.yml/badge.svg)](https://github.com/neokoni/LightTickets/actions/workflows/dev-build.yml)

English • [简体中文](README_ZH.md)

</div>

LightTickets is a self-hosted issue/ticket platform for Minecraft server administration, supporting web-based management as well as interaction with Paper/Folia and Velocity plugins.

## Features

- **Issue management**: created from templates, with configurable labels, assignees, visibility, and more
- **Minecraft server** integration: interacts with LightTickets via API keys and server/proxy plugins
- **Account authentication**: user registration, password recovery, email delivery, and external single sign-on
- **Access restrictions**: per-operation-type rate limits, with built-in Cloudflare Turnstile support
- **Custom site** information: customizable site title, favicon, logo, and other site details
- **File storage**: local storage and S3-compatible storage
- **Email notifications**: SMTP support for issue status changes and new issue assignment alerts
- **Search filters**: filter issues from the search bar with queries such as `from`, `type`, and `status`

## Structure

```text
LightTickets/
    ├─ backend/            # Backend service
    ├─ frontend/           # Web frontend
    ├─ plugin/             # Minecraft plugin integration
    ├─ docs/               # Temporary internal documents, not an official reference
    ├─ scripts/            # Utility scripts
    └─ docker-compose.yml  # Example docker compose file
```

## Requirements

- Node.js 24 and npm
- Java 21 or newer (Minecraft plugins)

## Local development

Install all dependencies:

```bash
npm install
npm install --prefix backend
npm install --prefix frontend
```

Start the services:

```bash
npm run dev
```

Once started, visit `http://localhost:23310`; the first run requires initialization.

The backend API listens on `http://localhost:23320` by default.

Start only the frontend or backend:

```bash
npm run dev:server   # backend only
npm run dev:web      # frontend only
```

## Configuration

`config.yml` holds only platform base settings and lives in the backend data directory. See `backend/src/config.default.yml` for the field definitions.

LightTickets settings are stored in the database.

| Key                          | Description                                                              |
| ---------------------------- | ------------------------------------------------------------------------ |
| `server.port`               | Backend listen port, default `23320`                                      |
| `server.corsOrigins`        | Allowed CORS origins (array)                                              |
| `server.trustedProxyIps`    | Trusted reverse proxy IPs (array); empty means forwarding headers are not trusted |
| `database.provider`         | `sqlite` or `mysql`; when absent, initialization mode is entered          |
| `database.mysql.*`          | MySQL connection info; `host` / `username` / `database` are required, `port` defaults to `3306` |
| `security.jwtSecret`        | Access token signing secret                                               |
| `security.jwtRefreshSecret` | Refresh token signing secret                                              |
| `security.jwtUnsubscribeSecret` | Email unsubscribe JWT secret, generated automatically when upgrading from older versions |
| `security.legacyJwtCutoff`  | Compatibility cutoff timestamp for legacy JWT format                      |
| `security.externalEncryptionKey` | Master key for encrypting external login provider secrets            |

## Quick start

### Docker Compose

```bash
docker compose up -d
```

Compose starts two containers, `server` and `web`: only `web` is published to host port `23310`, while `server` serves on `23320` inside the internal network.

SQLite data, configuration, templates, language resources, and local attachments are stored in the `./data` directory. See the docs for how to adjust ports, images, and data directories.

### Manual setup

Backend:

```bash
cd backend
npm install
npm run build
npm start
```

Frontend:

```bash
cd frontend
npm install
LT_WEB_API_URL=/api npm run build
LT_WEB_HOST=0.0.0.0 LT_WEB_PORT=23310 LT_SERVER_URL=http://127.0.0.1:23320 npm start
```

## Server plugins

Build the plugins in the `plugin` directory:

```bash
cd plugin
./gradlew build
```

Artifacts are `plugin/paper/build/libs/*-all.jar` and `plugin/velocity/build/libs/*-all.jar`.

Set `baseUrl` in the plugin `config.yml` to the public LightTickets address (e.g. `https://tickets.example.com`).

Set `serverKey` to a server key generated in the LightTickets admin console.

Commands (prefix `/lit` or `/lighttickets`):

| Command                             | Description                     |
| ----------------------------------- | ------------------------------- |
| `/lit bind` / `/lit unbind`         | Bind or unbind an account       |
| `/lit account`                      | View account information        |
| `/lit register`                     | Get a web registration link     |
| `/lit ticket create [type]`         | Create an issue                 |
| `/lit ticket list [page]`           | List issues                     |
| `/lit ticket info <id>`             | View issue details              |
| `/lit ticket comment <id>`          | Comment on an issue             |
| `/lit ticket status <id> [status]`  | Change issue status             |
| `/lit ticket search <query>`        | Search issues                   |
| `/lit reload` / `/lit status`       | Reload configuration or view status |

## Documentation

For details, see the [LightTickets documentation](https://projects.neokoni.ink/lighttickets/docs).

## License

[MIT](LICENSE), Copyright (c) 2026 Neokoni.
