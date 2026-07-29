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

test('the API proxy strips client-supplied forwarding headers', async (t) => {
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
    assert.equal(name.startsWith('x-forwarded-'), false);
  }
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
