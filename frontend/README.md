# LightTickets Frontend

## Development

```bash
npm install
npm run dev
```

`LT_SERVER_URL` controls the Vite development proxy target and defaults to
`http://127.0.0.1:3000`.

## Production Build

```bash
npm ci
LT_WEB_API_URL=/api npm run build
```

The build command writes immutable frontend assets to `dist/`. The production server never
rebuilds or modifies that directory.

## Production Server

```bash
LT_WEB_HOST=0.0.0.0 \
LT_WEB_PORT=4173 \
LT_SERVER_URL=http://127.0.0.1:3000 \
npm start
```

`npm start` runs the zero-dependency `server.mjs`, which:

- serves files only from `dist/`;
- falls back to `dist/index.html` for Vue Router history routes;
- proxies `/api` to `LT_SERVER_URL`;
- applies immutable caching to Vite's hashed `dist/assets/` files.

Supported runtime environment variables:

| Variable        | Default                 | Purpose                                |
| --------------- | ----------------------- | -------------------------------------- |
| `LT_WEB_HOST`   | `0.0.0.0`               | HTTP listen address                    |
| `LT_WEB_PORT`   | `4173`                  | HTTP listen port                       |
| `LT_SERVER_URL` | `http://127.0.0.1:3000` | Server origin used for `/api` proxying |

## Minimal Runtime Package

The runtime server imports Node built-in modules only. A deployment artifact therefore needs:

```text
package.json
runtime-config.mjs
server.mjs
dist/
```

No `npm install` or `node_modules/` directory is required at runtime. `npm start` still requires
Node and npm to be installed; `node server.mjs` can be used when npm is unavailable. A directory
containing only `dist/` is not enough to start an HTTP server by itself.
