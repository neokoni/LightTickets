import { createReadStream, statSync } from 'node:fs';
import { stat } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DEFAULT_BACKEND_URL } from './runtime-config.mjs';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_DIST_DIR = path.join(SERVER_DIR, 'dist');
const DEFAULT_PROXY_TIMEOUT_MS = 30_000;

const MIME_TYPES = new Map([
  ['.css', 'text/css; charset=utf-8'],
  ['.gif', 'image/gif'],
  ['.html', 'text/html; charset=utf-8'],
  ['.ico', 'image/x-icon'],
  ['.jpeg', 'image/jpeg'],
  ['.jpg', 'image/jpeg'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.map', 'application/json; charset=utf-8'],
  ['.png', 'image/png'],
  ['.svg', 'image/svg+xml'],
  ['.ttf', 'font/ttf'],
  ['.txt', 'text/plain; charset=utf-8'],
  ['.wasm', 'application/wasm'],
  ['.webp', 'image/webp'],
  ['.woff', 'font/woff'],
  ['.woff2', 'font/woff2'],
  ['.xml', 'application/xml; charset=utf-8'],
]);

const HOP_BY_HOP_HEADERS = new Set([
  'connection',
  'keep-alive',
  'proxy-authenticate',
  'proxy-authorization',
  'te',
  'trailer',
  'transfer-encoding',
  'upgrade',
]);

function parsePort(value) {
  if (!/^\d+$/.test(value)) throw new Error(`Invalid frontend port: ${value}`);
  const port = Number(value);
  if (port < 1 || port > 65_535) throw new Error(`Invalid frontend port: ${value}`);
  return port;
}

function parseBackendUrl(value) {
  const url = new URL(value);
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error('BACKEND_URL must use http or https');
  }
  if (url.username || url.password) throw new Error('BACKEND_URL must not contain credentials');
  if (url.pathname !== '/' || url.search || url.hash) {
    throw new Error('BACKEND_URL must be an origin without a path, query, or hash');
  }
  return url;
}

function copyHeaders(headers) {
  const copied = {};
  for (const [name, value] of Object.entries(headers)) {
    if (value !== undefined && !HOP_BY_HOP_HEADERS.has(name.toLowerCase())) copied[name] = value;
  }
  return copied;
}

function writeSecurityHeaders(response) {
  response.setHeader('Referrer-Policy', 'same-origin');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'SAMEORIGIN');
}

function sendText(response, statusCode, message, extraHeaders = {}) {
  const body = `${message}\n`;
  writeSecurityHeaders(response);
  response.writeHead(statusCode, {
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    ...extraHeaders,
  });
  response.end(body);
}

function sendProxyError(response) {
  if (response.headersSent) {
    response.destroy();
    return;
  }
  const body = JSON.stringify({
    success: false,
    statusCode: 502,
    message: 'Backend service unavailable',
  });
  writeSecurityHeaders(response);
  response.writeHead(502, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
  });
  response.end(body);
}

function proxyApiRequest(request, response, backendUrl, timeoutMs) {
  const target = new URL(request.url || '/api', backendUrl);
  const transport = target.protocol === 'https:' ? https : http;
  const headers = copyHeaders(request.headers);
  headers.host = target.host;

  const proxyRequest = transport.request(
    target,
    { method: request.method, headers },
    (proxyResponse) => {
      const responseHeaders = copyHeaders(proxyResponse.headers);
      response.writeHead(proxyResponse.statusCode || 502, responseHeaders);
      proxyResponse.pipe(response);
    },
  );

  proxyRequest.setTimeout(timeoutMs, () => {
    proxyRequest.destroy(new Error('Backend request timed out'));
  });
  proxyRequest.on('error', (error) => {
    console.error('[frontend] API proxy error:', error.message);
    sendProxyError(response);
  });
  request.on('aborted', () => proxyRequest.destroy());
  request.pipe(proxyRequest);
}

function isPathInside(root, candidate) {
  const relative = path.relative(root, candidate);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

async function regularFileStats(filePath) {
  try {
    const fileStats = await stat(filePath);
    return fileStats.isFile() ? fileStats : null;
  } catch (error) {
    if (error?.code === 'ENOENT' || error?.code === 'ENOTDIR') return null;
    throw error;
  }
}

function cacheControlFor(relativePath, isHistoryFallback) {
  if (isHistoryFallback || relativePath === 'index.html') return 'no-cache';
  if (relativePath.startsWith('assets/')) return 'public, max-age=31536000, immutable';
  return 'public, max-age=3600';
}

function streamFile(request, response, filePath, fileStats, relativePath, isHistoryFallback) {
  const etag = `W/"${fileStats.size.toString(16)}-${Math.trunc(fileStats.mtimeMs).toString(16)}"`;
  writeSecurityHeaders(response);
  response.setHeader('Cache-Control', cacheControlFor(relativePath, isHistoryFallback));
  response.setHeader('Content-Length', fileStats.size);
  response.setHeader(
    'Content-Type',
    MIME_TYPES.get(path.extname(filePath).toLowerCase()) || 'application/octet-stream',
  );
  response.setHeader('ETag', etag);

  if (request.headers['if-none-match'] === etag) {
    response.writeHead(304);
    response.end();
    return;
  }

  response.writeHead(200);
  if (request.method === 'HEAD') {
    response.end();
    return;
  }

  const fileStream = createReadStream(filePath);
  fileStream.on('error', () => {
    if (!response.headersSent) sendText(response, 500, 'Internal Server Error');
    else response.destroy();
  });
  fileStream.pipe(response);
}

async function serveDistRequest(request, response, url, distDir, indexPath) {
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    sendText(response, 405, 'Method Not Allowed', { Allow: 'GET, HEAD' });
    return;
  }

  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    sendText(response, 400, 'Bad Request');
    return;
  }

  const relativePath = pathname.replace(/^\/+/, '') || 'index.html';
  const requestedPath = path.resolve(distDir, relativePath);
  if (!isPathInside(distDir, requestedPath)) {
    sendText(response, 403, 'Forbidden');
    return;
  }

  let filePath = requestedPath;
  let fileStats = await regularFileStats(filePath);
  let isHistoryFallback = false;

  if (!fileStats) {
    const acceptsHtml = request.headers.accept?.includes('text/html') === true;
    if (!acceptsHtml && path.extname(relativePath)) {
      sendText(response, 404, 'Not Found');
      return;
    }
    filePath = indexPath;
    fileStats = await regularFileStats(filePath);
    isHistoryFallback = true;
  }

  if (!fileStats) {
    sendText(response, 500, 'Frontend build is incomplete: dist/index.html is missing');
    return;
  }

  streamFile(request, response, filePath, fileStats, relativePath, isHistoryFallback);
}

export function createFrontendServer({
  distDir = DEFAULT_DIST_DIR,
  backendUrl = DEFAULT_BACKEND_URL,
  proxyTimeoutMs = DEFAULT_PROXY_TIMEOUT_MS,
} = {}) {
  const resolvedDistDir = path.resolve(distDir);
  let distStats;
  try {
    distStats = statSync(resolvedDistDir);
  } catch {
    throw new Error(`Frontend dist directory does not exist: ${resolvedDistDir}`);
  }
  if (!distStats.isDirectory()) {
    throw new Error(`Frontend dist path is not a directory: ${resolvedDistDir}`);
  }

  const parsedBackendUrl = parseBackendUrl(String(backendUrl));
  const indexPath = path.join(resolvedDistDir, 'index.html');

  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url || '/', 'http://frontend.local');
      if (url.pathname === '/api' || url.pathname.startsWith('/api/')) {
        proxyApiRequest(request, response, parsedBackendUrl, proxyTimeoutMs);
        return;
      }
      await serveDistRequest(request, response, url, resolvedDistDir, indexPath);
    } catch (error) {
      console.error('[frontend] Request failed:', error instanceof Error ? error.message : error);
      if (!response.headersSent) sendText(response, 500, 'Internal Server Error');
      else response.destroy();
    }
  });
}

function startFromEnvironment() {
  const host = process.env.FRONTEND_HOST || process.env.HOST || '0.0.0.0';
  const port = parsePort(process.env.FRONTEND_PORT || process.env.PORT || '4173');
  const backendUrl = process.env.BACKEND_URL || DEFAULT_BACKEND_URL;
  const server = createFrontendServer({ backendUrl });

  server.once('error', (error) => {
    console.error('[frontend] Failed to start:', error.message);
    process.exitCode = 1;
  });
  server.listen(port, host, () => {
    const backendOrigin = parseBackendUrl(backendUrl).origin;
    console.log(`[frontend] Serving ${DEFAULT_DIST_DIR} on http://${host}:${port}`);
    console.log(`[frontend] Proxying /api to ${backendOrigin}`);
  });
}

const entryPath = process.argv[1] ? pathToFileURL(path.resolve(process.argv[1])).href : '';
if (import.meta.url === entryPath) {
  try {
    startFromEnvironment();
  } catch (error) {
    console.error('[frontend] Failed to start:', error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
