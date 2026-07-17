# LightTickets Frontend

## Development

```bash
npm install
npm run dev
```

`BACKEND_URL` controls the Vite development proxy target and defaults to
`http://127.0.0.1:3000`.

## Production Build

```bash
npm ci
VITE_API_URL=/api npm run build
```

The build command writes immutable frontend assets to `dist/`. The production server never
rebuilds or modifies that directory.

## Production Server

```bash
FRONTEND_HOST=0.0.0.0 \
FRONTEND_PORT=4173 \
BACKEND_URL=http://127.0.0.1:3000 \
npm start
```

`npm start` runs the zero-dependency `server.mjs`, which:

- serves files only from `dist/`;
- falls back to `dist/index.html` for Vue Router history routes;
- proxies `/api` to `BACKEND_URL`;
- applies immutable caching to Vite's hashed `dist/assets/` files.

Supported runtime environment variables:

| Variable        | Default                 | Purpose                                 |
| --------------- | ----------------------- | --------------------------------------- |
| `FRONTEND_HOST` | `0.0.0.0`               | HTTP listen address                     |
| `FRONTEND_PORT` | `4173`                  | HTTP listen port                        |
| `BACKEND_URL`   | `http://127.0.0.1:3000` | Backend origin used for `/api` proxying |

`HOST` and `PORT` are accepted as fallbacks for `FRONTEND_HOST` and `FRONTEND_PORT`.

## Minimal Runtime Package

The runtime server imports Node built-in modules only. A deployment artifact therefore needs:

```text
package.json
server.mjs
dist/
```

No `npm install` or `node_modules/` directory is required at runtime. `npm start` still requires
Node and npm to be installed; `node server.mjs` can be used when npm is unavailable. A directory
containing only `dist/` is not enough to start an HTTP server by itself.
