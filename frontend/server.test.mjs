import assert from 'node:assert/strict';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import http from 'node:http';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { createFrontendServer } from './server.mjs';

async function listen(server) {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert(address && typeof address === 'object');
  return address.port;
}

async function close(server) {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
  });
}

async function requestPath(port, requestPath) {
  return new Promise((resolve, reject) => {
    const request = http.request(
      {
        host: '127.0.0.1',
        port,
        path: requestPath,
      },
      (response) => {
        response.resume();
        response.once('end', () => resolve(response));
      },
    );
    request.once('error', reject);
    request.end();
  });
}

async function upgradeWebSocket(port, requestPath, extraHeaders = {}) {
  return new Promise((resolve, reject) => {
    const request = http.request({
      host: '127.0.0.1',
      port,
      path: requestPath,
      headers: {
        Connection: 'Upgrade',
        Upgrade: 'websocket',
        'Sec-WebSocket-Key': 'bGlnaHR0aWNrZXRzLXRlc3Q=',
        'Sec-WebSocket-Version': '13',
        ...extraHeaders,
      },
    });
    request.once('upgrade', (response, socket, head) => {
      resolve({ response, socket, head });
    });
    request.once('response', (response) => {
      response.resume();
      response.once('end', () => resolve({ response, socket: null, head: Buffer.alloc(0) }));
    });
    request.once('error', reject);
    request.end();
  });
}

async function withTimeout(promise, message) {
  let timeout;
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => {
        timeout = setTimeout(() => reject(new Error(message)), 3_000);
      }),
    ]);
  } finally {
    clearTimeout(timeout);
  }
}

test('static responses enforce the production content security policy', async (t) => {
  const distDir = await mkdtemp(path.join(tmpdir(), 'lighttickets-web-'));
  await writeFile(path.join(distDir, 'index.html'), '<!doctype html>', 'utf8');
  t.after(() => rm(distDir, { recursive: true, force: true }));

  const frontend = createFrontendServer({ distDir });
  const frontendPort = await listen(frontend);
  t.after(() => close(frontend));

  for (const routePath of ['/', '/tickets/123']) {
    const response = await requestPath(frontendPort, routePath);
    assert.equal(response.statusCode, 200);
    assert.equal(
      response.headers['content-security-policy'],
      "default-src 'self'; " +
        "script-src 'self' https://challenges.cloudflare.com; " +
        "style-src 'self' 'unsafe-inline'; " +
        "img-src 'self' data: blob: https:; " +
        "font-src 'self' data:; " +
        "connect-src 'self' https://api.iconify.design https://api.simplesvg.com https://api.unisvg.com https://challenges.cloudflare.com; " +
        'frame-src https://challenges.cloudflare.com; ' +
        "object-src 'none'; " +
        "base-uri 'self'; " +
        "form-action 'self'; " +
        "frame-ancestors 'self'",
    );
  }
});

test('the API proxy replaces client-supplied forwarding headers with the socket address', async (t) => {
  const distDir = await mkdtemp(path.join(tmpdir(), 'lighttickets-web-'));
  await writeFile(path.join(distDir, 'index.html'), '<!doctype html>', 'utf8');
  t.after(() => rm(distDir, { recursive: true, force: true }));

  const backend = http.createServer((request, response) => {
    response.setHeader('Content-Type', 'application/json');
    response.end(JSON.stringify(request.headers));
  });
  const backendPort = await listen(backend);
  t.after(() => close(backend));

  const frontend = createFrontendServer({
    distDir,
    serverUrl: `http://127.0.0.1:${backendPort}`,
  });
  const frontendPort = await listen(frontend);
  t.after(() => close(frontend));

  const response = await fetch(`http://127.0.0.1:${frontendPort}/api/header-probe`, {
    headers: {
      Authorization: 'Bearer test-token',
      Forwarded: 'for=192.0.2.1;host=attacker.example;proto=https',
      'X-Forwarded-For': '192.0.2.1',
      'X-Forwarded-Host': 'attacker.example',
      'X-Forwarded-Port': '443',
      'X-Forwarded-Prefix': '/attacker',
      'X-Forwarded-Probe': 'must-not-pass',
      'X-Forwarded-Proto': 'https',
      'X-Request-Id': 'trace-123',
    },
  });
  assert.equal(response.status, 200);

  const headers = await response.json();
  for (const name of Object.keys(headers)) {
    assert.notEqual(name, 'forwarded');
    if (name.startsWith('x-forwarded-')) assert.equal(name, 'x-forwarded-for');
  }
  assert.equal(headers['x-forwarded-for'], '127.0.0.1');
  assert.equal(headers.authorization, 'Bearer test-token');
  assert.equal(headers['x-request-id'], 'trace-123');
  assert.equal(headers.host, `127.0.0.1:${backendPort}`);
});

test('the API proxy rejects request targets that can override the backend origin', async (t) => {
  const distDir = await mkdtemp(path.join(tmpdir(), 'lighttickets-web-'));
  await writeFile(path.join(distDir, 'index.html'), '<!doctype html>', 'utf8');
  t.after(() => rm(distDir, { recursive: true, force: true }));

  let attackerRequests = 0;
  const attacker = http.createServer((_request, response) => {
    attackerRequests += 1;
    response.end('attacker');
  });
  const attackerPort = await listen(attacker);
  t.after(() => close(attacker));

  const backendRequestUrls = [];
  const backend = http.createServer((request, response) => {
    backendRequestUrls.push(request.url);
    response.writeHead(302, {
      Location: `http://127.0.0.1:${attackerPort}/api/redirect-target`,
    });
    response.end();
  });
  const backendPort = await listen(backend);
  t.after(() => close(backend));

  const frontend = createFrontendServer({
    distDir,
    serverUrl: `http://127.0.0.1:${backendPort}`,
  });
  const frontendPort = await listen(frontend);
  t.after(() => close(frontend));

  const unsafeTargets = [
    `//127.0.0.1:${attackerPort}/api/audit-probe`,
    `http://127.0.0.1:${attackerPort}/api/audit-probe`,
    `/\\127.0.0.1:${attackerPort}/api/audit-probe`,
    '/api/audit-probe#',
  ];

  for (const target of unsafeTargets) {
    const response = await requestPath(frontendPort, target);
    assert.equal(response.statusCode, 400, target);
  }
  assert.deepEqual(backendRequestUrls, []);
  assert.equal(attackerRequests, 0);

  const redirectResponse = await requestPath(
    frontendPort,
    '/api/redirect-probe?returnTo=%2Fdashboard',
  );
  assert.equal(redirectResponse.statusCode, 302);
  assert.equal(
    redirectResponse.headers.location,
    `http://127.0.0.1:${attackerPort}/api/redirect-target`,
  );
  assert.deepEqual(backendRequestUrls, ['/api/redirect-probe?returnTo=%2Fdashboard']);
  assert.equal(attackerRequests, 0);
});

test('the WebSocket proxy tunnels only /socket.io upgrades to the backend', async (t) => {
  const distDir = await mkdtemp(path.join(tmpdir(), 'lighttickets-web-'));
  await writeFile(path.join(distDir, 'index.html'), '<!doctype html>', 'utf8');
  t.after(() => rm(distDir, { recursive: true, force: true }));

  let backendUpgrade;
  let backendSocket;
  const backend = http.createServer();
  backend.on('upgrade', (request, socket) => {
    backendUpgrade = { url: request.url, headers: request.headers };
    backendSocket = socket;
    socket.write(
      'HTTP/1.1 101 Switching Protocols\r\n' +
        'Connection: Upgrade\r\n' +
        'Upgrade: websocket\r\n\r\n',
    );
    socket.on('data', (chunk) => socket.write(chunk));
  });
  const backendPort = await listen(backend);

  const frontend = createFrontendServer({
    distDir,
    serverUrl: `http://127.0.0.1:${backendPort}`,
  });
  const frontendPort = await listen(frontend);
  t.after(async () => {
    backendSocket?.destroy();
    await Promise.all([close(frontend), close(backend)]);
  });

  const rejected = await withTimeout(
    upgradeWebSocket(frontendPort, '/api/not-a-websocket'),
    'non-Socket.IO upgrade rejection timed out',
  );
  assert.equal(rejected.response.statusCode, 404);
  assert.equal(backendUpgrade, undefined);

  const upgraded = await withTimeout(
    upgradeWebSocket(frontendPort, '/socket.io/?EIO=4&transport=websocket', {
      Forwarded: 'for=192.0.2.1;host=attacker.example',
      'X-Forwarded-For': '192.0.2.1',
      'X-Forwarded-Host': 'attacker.example',
    }),
    'Socket.IO upgrade timed out',
  );
  assert.equal(upgraded.response.statusCode, 101);
  assert(upgraded.socket);
  assert.equal(backendUpgrade.url, '/socket.io/?EIO=4&transport=websocket');
  assert.equal(backendUpgrade.headers.host, `127.0.0.1:${backendPort}`);
  assert.equal(backendUpgrade.headers['x-forwarded-for'], '127.0.0.1');
  assert.equal(backendUpgrade.headers.forwarded, undefined);
  assert.equal(backendUpgrade.headers['x-forwarded-host'], undefined);

  const echo = new Promise((resolve) => upgraded.socket.once('data', resolve));
  upgraded.socket.write('socket-probe');
  assert.equal(
    (await withTimeout(echo, 'WebSocket tunnel echo timed out')).toString(),
    'socket-probe',
  );
  const closed = new Promise((resolve) => upgraded.socket.once('close', resolve));
  upgraded.socket.destroy();
  await withTimeout(closed, 'WebSocket client close timed out');
});
