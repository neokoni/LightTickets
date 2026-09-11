import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';
import { hashServerApiKey } from '../src/utils/server-key.js';
import { migrateLegacyServerApiKeys } from '../src/services/server.service.js';

const app = createApp();

async function createAdminAndGetToken(email: string) {
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  const user = await prisma().user.findUniqueOrThrow({ where: { email } });
  await prisma().user.update({ where: { id: user.id }, data: { role: 'admin' } });
  const login = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: email, password: 'Password123!' });
  return login.body.data.accessToken as string;
}

async function createServer(token: string, serverId: string, alias?: string, identifyId?: string) {
  return request(app)
    .post('/api/servers')
    .set('Authorization', `Bearer ${token}`)
    .send({ serverId, alias, identifyId });
}

describe('server management', () => {
  it('creates and updates a server without creating an API key', async () => {
    const token = await createAdminAndGetToken('server-create@test.com');
    const created = await createServer(token, 'survival-1', '生存服');

    expect(created.status).toBe(201);
    expect(created.body.data).toMatchObject({
      serverId: 'survival-1',
      alias: '生存服',
      identifyId: null,
    });
    expect(created.body.data).not.toHaveProperty('apiKey');

    const updated = await request(app)
      .patch(`/api/servers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ serverId: 'survival-main', identifyId: '生存服-主世界', alias: null });
    expect(updated.status).toBe(200);
    expect(updated.body.data).toMatchObject({
      serverId: 'survival-main',
      identifyId: '生存服-主世界',
      alias: null,
      name: 'survival-main',
    });
  });

  it('requires a unique valid server ID', async () => {
    const token = await createAdminAndGetToken('server-id@test.com');
    expect((await createServer(token, 'invalid id')).status).toBe(400);
    expect((await createServer(token, 'lobby')).status).toBe(201);
    expect((await createServer(token, 'lobby')).status).toBe(409);
  });

  it('keeps identify IDs unique, including implicit server IDs', async () => {
    const token = await createAdminAndGetToken('server-identify@test.com');
    const named = (await createServer(token, 'identify-named', undefined, '世界一')).body.data;

    // An explicit identify ID collides with the same value on another server.
    expect((await createServer(token, 'identify-other', undefined, '世界一')).status).toBe(409);

    // A server without an identify ID claims its own server ID, so another server
    // may not adopt that server ID as its identify ID.
    expect((await createServer(token, 'identify-plain')).status).toBe(201);
    expect(
      (await createServer(token, 'identify-conflict', undefined, 'identify-plain')).status,
    ).toBe(409);

    // Release the value before reusing it.
    const cleared = await request(app)
      .patch(`/api/servers/${named.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ identifyId: null });
    expect(cleared.status).toBe(200);
    expect(cleared.body.data.identifyId).toBeNull();
    expect((await createServer(token, 'identify-reuse', undefined, '世界一')).status).toBe(201);

    // Reject control characters.
    expect((await createServer(token, 'identify-control', undefined, 'bad\nid')).status).toBe(400);
  });
});

describe('server API key management', () => {
  it('creates a Paper/Folia key with exactly one server', async () => {
    const token = await createAdminAndGetToken('paper-key@test.com');
    const server = (await createServer(token, 'paper-1')).body.data;
    const invalid = await request(app)
      .post('/api/servers/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'paper_folia', serverIds: [] });
    expect(invalid.status).toBe(400);

    const created = await request(app)
      .post('/api/servers/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'paper_folia', serverIds: [server.id] });
    expect(created.status).toBe(201);
    expect(created.body.data.apiKey).toMatch(/^lt_/);
    expect(created.body.data.servers).toHaveLength(1);
    expect(created.body.data).not.toHaveProperty('keyHash');
    const stored = await prisma().serverApiKey.findUniqueOrThrow({
      where: { id: created.body.data.id },
    });
    expect(stored.keyHash).toBe(hashServerApiKey(created.body.data.apiKey));
    expect(stored.keyHash).not.toBe(created.body.data.apiKey);
  });

  it('creates and updates a Velocity key with multiple authorized servers', async () => {
    const token = await createAdminAndGetToken('velocity-key@test.com');
    const first = (await createServer(token, 'lobby')).body.data;
    const second = (await createServer(token, 'survival')).body.data;
    const created = await request(app)
      .post('/api/servers/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'velocity', serverIds: [first.id, second.id] });

    expect(created.status).toBe(201);
    expect(
      created.body.data.servers.map((server: { serverId: string }) => server.serverId),
    ).toEqual(['lobby', 'survival']);

    const updated = await request(app)
      .patch(`/api/servers/api-keys/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'velocity', serverIds: [second.id] });
    expect(updated.status).toBe(200);
    expect(updated.body.data.servers).toHaveLength(1);
  });

  it('regenerates and deletes an API key independently of servers', async () => {
    const token = await createAdminAndGetToken('key-lifecycle@test.com');
    const server = (await createServer(token, 'key-server')).body.data;
    const created = await request(app)
      .post('/api/servers/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'paper_folia', serverIds: [server.id] });
    const regenerated = await request(app)
      .post(`/api/servers/api-keys/${created.body.data.id}/regenerate`)
      .set('Authorization', `Bearer ${token}`);
    expect(regenerated.status).toBe(200);
    expect(regenerated.body.data.apiKey).not.toBe(created.body.data.apiKey);

    const blockedDelete = await request(app)
      .delete(`/api/servers/${server.id}`)
      .set('Authorization', `Bearer ${token}`);
    expect(blockedDelete.status).toBe(409);

    expect(
      (
        await request(app)
          .delete(`/api/servers/api-keys/${created.body.data.id}`)
          .set('Authorization', `Bearer ${token}`)
      ).status,
    ).toBe(204);
    expect(
      (
        await request(app)
          .delete(`/api/servers/${server.id}`)
          .set('Authorization', `Bearer ${token}`)
      ).status,
    ).toBe(204);
  });

  it('resolves Paper directly and Velocity from the request body server ID', async () => {
    const token = await createAdminAndGetToken('key-auth@test.com');
    const first = (await createServer(token, 'velocity-a')).body.data;
    const second = (await createServer(token, 'velocity-b')).body.data;
    const paper = await request(app)
      .post('/api/servers/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'paper_folia', serverIds: [first.id] });
    const velocity = await request(app)
      .post('/api/servers/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ type: 'velocity', serverIds: [first.id] });

    const paperRequest = await request(app)
      .post('/api/mc/unlink')
      .set('X-Server-Key', paper.body.data.apiKey)
      .send({ minecraftUuid: 'player' });
    expect(paperRequest.status).toBe(403);

    const missingId = await request(app)
      .post('/api/mc/unlink')
      .set('X-Server-Key', velocity.body.data.apiKey)
      .send({ minecraftUuid: 'player' });
    expect(missingId.status).toBe(401);

    const unauthorized = await request(app)
      .post('/api/mc/unlink')
      .set('X-Server-Key', velocity.body.data.apiKey)
      .send({ minecraftUuid: 'player', serverId: second.serverId });
    expect(unauthorized.status).toBe(401);

    const authorized = await request(app)
      .post('/api/mc/unlink')
      .set('X-Server-Key', velocity.body.data.apiKey)
      .send({ minecraftUuid: 'player', serverId: first.serverId });
    expect(authorized.status).toBe(403);

    const bodyQuery = await request(app)
      .post('/api/mc/tickets/search')
      .set('X-Server-Key', velocity.body.data.apiKey)
      .send({ minecraftUuid: 'player', serverId: first.serverId });
    expect(bodyQuery.status).toBe(200);
  });

  it('matches Velocity server IDs against the identify ID and keeps the title', async () => {
    const token = await createAdminAndGetToken('velocity-identify@test.com');
    const server = (await createServer(token, 'velocity-identify', undefined, '生存服-主世界')).body
      .data;
    const created = await request(app)
      .post('/api/servers/api-keys')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '主服 Velocity', type: 'velocity', serverIds: [server.id] });

    expect(created.status).toBe(201);
    expect(created.body.data.title).toBe('主服 Velocity');

    const byIdentifyId = await request(app)
      .post('/api/mc/unlink')
      .set('X-Server-Key', created.body.data.apiKey)
      .send({ minecraftUuid: 'player', serverId: '生存服-主世界' });
    expect(byIdentifyId.status).toBe(403);

    // The platform server ID is no longer a valid plugin identifier once an
    // identify ID is set.
    const byServerId = await request(app)
      .post('/api/mc/unlink')
      .set('X-Server-Key', created.body.data.apiKey)
      .send({ minecraftUuid: 'player', serverId: 'velocity-identify' });
    expect(byServerId.status).toBe(401);

    const titleUpdate = await request(app)
      .patch(`/api/servers/api-keys/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: null, type: 'velocity', serverIds: [server.id] });
    expect(titleUpdate.status).toBe(200);
    expect(titleUpdate.body.data.title).toBeNull();

    const listed = await request(app)
      .get('/api/servers/api-keys')
      .set('Authorization', `Bearer ${token}`);
    expect(listed.body.data[0]).toMatchObject({
      title: null,
      servers: [{ identifyId: '生存服-主世界' }],
    });
  });
});

describe('legacy server API keys', () => {
  it('hashes plaintext keys and migrates them to Paper/Folia bindings idempotently', async () => {
    const legacyKey = 'legacy-server-key';
    const server = await prisma().server.create({
      data: { name: 'legacy-server', legacyApiKeyHash: legacyKey },
    });

    await migrateLegacyServerApiKeys();
    await migrateLegacyServerApiKeys();

    const migrated = await prisma().server.findUniqueOrThrow({ where: { id: server.id } });
    expect(migrated.legacyApiKeyHash).toBe(hashServerApiKey(legacyKey));
    const keys = await prisma().serverApiKey.findMany({
      where: { bindings: { some: { serverId: server.id } } },
      include: { bindings: true },
    });
    expect(keys).toHaveLength(1);
    expect(keys[0].type).toBe('paper_folia');
  });
});
