import { afterEach, describe, it, expect, vi } from 'vitest';
import bcrypt from 'bcrypt';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma, serverData } from './setup.js';
import { hashMinecraftSecret } from '../src/utils/minecraft-credential.js';
import { generateAccessToken } from '../src/utils/token.js';
import { clearTestOutbox, getTestOutbox } from '../src/services/mail.service.js';
import * as rateLimitConfigService from '../src/services/rate-limit-config.service.js';

const app = createApp({ enableInitialSetup: true });
let testMinecraftUuidCounter = 0;

afterEach(() => {
  vi.unstubAllEnvs();
});

function createMinecraftUuid(): string {
  testMinecraftUuidCounter += 1;
  return `550e8400-e29b-41d4-a716-${testMinecraftUuidCounter.toString(16).padStart(12, '0')}`;
}

async function createServer(name: string) {
  const apiKey = `${name}-key`;
  const server = await prisma().server.create({ data: serverData(name, apiKey) });
  return { ...server, apiKey };
}

async function createAuthenticatedPlayer(
  server: Awaited<ReturnType<typeof createServer>>,
  name: string,
  role: 'player' | 'staff' | 'admin' = 'player',
) {
  const minecraftUuid = `${name}-minecraft-uuid`;
  const credential = `${name}-player-credential-value`.padEnd(48, 'x');
  const user = await prisma().user.create({
    data: {
      email: `${name}@test.com`,
      passwordHash: await bcrypt.hash('Password123!', 12),
      username: name,
      role,
      minecraftUuid,
      minecraftName: name,
      minecraftPlayerCredential: {
        create: {
          minecraftUuid,
          credentialHash: hashMinecraftSecret(credential),
        },
      },
    },
  });
  const response = await request(app)
    .post('/api/mc/session')
    .set('X-Server-Key', server.apiKey)
    .send({ minecraftUuid, playerCredential: credential });
  expect(response.status).toBe(201);
  return { user, minecraftUuid, credential, sessionToken: response.body.data.sessionToken };
}

describe('POST /api/mc/link-code', () => {
  it('generates a 6-digit link code and independent player credential', async () => {
    const server = await createServer('survival');

    const res = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440010', minecraftName: 'Steve' });

    expect(res.status).toBe(201);
    expect(res.body.data.code).toMatch(/^\d{6}$/);
    expect(res.body.data).toHaveProperty('expiresAt');
    expect(res.body.data.playerCredential.length).toBeGreaterThanOrEqual(32);
    const stored = await prisma().linkCode.findUniqueOrThrow({
      where: { code: res.body.data.code },
    });
    expect(stored.playerCredentialHash).toBe(hashMinecraftSecret(res.body.data.playerCredential));
  });

  it('rejects without server key', async () => {
    const res = await request(app)
      .post('/api/mc/link-code')
      .send({ minecraftUuid: 'link-code-no-key', minecraftName: 'Steve' });

    expect(res.status).toBe(401);
  });

  it('rejects already-linked player with 409', async () => {
    const server = await createServer('survival-bound');
    await prisma().user.create({
      data: {
        email: 'bound@test.com',
        passwordHash: await bcrypt.hash('Password123!', 12),
        username: 'boundplayer',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440011',
        minecraftName: 'BoundSteve',
      },
    });

    const res = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440011', minecraftName: 'BoundSteve' });

    expect(res.status).toBe(409);
  });

  it('rejects invalid Minecraft identity formats', async () => {
    const server = await createServer('survival-format');
    const cases = [
      { minecraftUuid: 'not-a-uuid', minecraftName: 'Steve' },
      { minecraftUuid: '550e8400-e29b-41d4-a716-446655440012', minecraftName: 'ab' },
      { minecraftUuid: '550e8400-e29b-41d4-a716-446655440013', minecraftName: 'Player Name' },
    ];

    for (const payload of cases) {
      const res = await request(app)
        .post('/api/mc/link-code')
        .set('X-Server-Key', server.apiKey)
        .send(payload);
      expect(res.status).toBe(400);
    }
  });

  it('replaces previous code for the same UUID', async () => {
    const server = await createServer('survival-replace');
    const uuid = '550e8400-e29b-41d4-a716-446655440014';

    const first = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: uuid, minecraftName: 'Steve' });
    expect(first.status).toBe(201);
    const firstCode = first.body.data.code;

    const second = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: uuid, minecraftName: 'Steve' });
    expect(second.status).toBe(201);
    expect(second.body.data.code).not.toBe(firstCode);

    // Old code should no longer exist
    const old = await prisma().linkCode.findUnique({ where: { code: firstCode } });
    expect(old).toBeNull();
  });

  it('applies the configured auth rate limit', async () => {
    const server = await createServer('survival-link-limit');
    // Use a distinct window so the authLimiter bucket key differs from other
    // auth-rate-limit tests in this file.
    await rateLimitConfigService.updateRateLimitConfig({
      auth: { windowSeconds: 180, maxRequests: 1 },
    });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');

    const first = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440015', minecraftName: 'Steve' });
    const limited = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440016', minecraftName: 'Alex' });

    expect(first.status).toBe(201);
    expect(limited.status).toBe(429);
  });
});

describe('POST /api/mc/session', () => {
  it('rejects an invalid player credential', async () => {
    const server = await createServer('session-invalid');

    const res = await request(app).post('/api/mc/session').set('X-Server-Key', server.apiKey).send({
      minecraftUuid: 'session-invalid-uuid',
      playerCredential: 'invalid-player-credential-value-000000',
    });

    expect(res.status).toBe(401);
  });

  it('requires a player session in addition to the server key', async () => {
    const server = await createServer('session-required');

    const res = await request(app)
      .get('/api/mc/tickets')
      .set('X-Server-Key', server.apiKey)
      .query({ minecraftUuid: 'any-uuid' });

    expect(res.status).toBe(401);
  });

  it('rejects a request UUID that differs from the session identity', async () => {
    const server = await createServer('session-uuid');
    const player = await createAuthenticatedPlayer(server, 'sessionuuid');

    const res = await request(app)
      .get('/api/mc/user/different-uuid')
      .set('X-Server-Key', server.apiKey)
      .set('X-Player-Session', player.sessionToken);

    expect(res.status).toBe(403);
  });

  it('binds a player session to the server that issued it', async () => {
    const serverA = await createServer('session-server-a');
    const serverB = await createServer('session-server-b');
    const player = await createAuthenticatedPlayer(serverA, 'sessionserver');

    const res = await request(app)
      .get(`/api/mc/user/${player.minecraftUuid}`)
      .set('X-Server-Key', serverB.apiKey)
      .set('X-Player-Session', player.sessionToken);

    expect(res.status).toBe(401);
  });
});

describe('Minecraft ticket access', () => {
  it('creates a ticket from the authenticated account and game context', async () => {
    const server = await createServer('mc-create');
    const player = await createAuthenticatedPlayer(server, 'mccreate');

    const res = await request(app)
      .post('/api/mc/tickets')
      .set('X-Server-Key', server.apiKey)
      .set('X-Player-Session', player.sessionToken)
      .send({
        minecraftUuid: player.minecraftUuid,
        title: 'Block glitch',
        body: 'Blocks disappear when placed',
        template: 'bug_report',
        formData: { description: 'Blocks disappear', reproduce: 'Place a block' },
        context: { world: 'world', x: 100, y: 64, z: -200, gameMode: 'SURVIVAL' },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.authorId).toBe(player.user.id);
    expect(res.body.data.serverId).toBe(server.id);
  });

  it('enforces template required fields, options, and field allowlist', async () => {
    const server = await createServer('mc-template-validation');
    const player = await createAuthenticatedPlayer(server, 'mctemplatevalidation');
    const createTicket = (template: string, formData: Record<string, string>) =>
      request(app)
        .post('/api/mc/tickets')
        .set('X-Server-Key', server.apiKey)
        .set('X-Player-Session', player.sessionToken)
        .send({
          minecraftUuid: player.minecraftUuid,
          title: 'Template validation',
          body: 'Untrusted pre-rendered body',
          template,
          formData,
        });

    const missing = await createTicket('bug_report', { description: 'Missing reproduce' });
    const unknown = await createTicket('bug_report', {
      description: 'Description',
      reproduce: 'Steps',
      marker: 'injected',
    });
    const invalidOption = await createTicket('full_example', {
      priority: 'root',
      reproduction: 'Steps',
      checklist: '我已搜索过现有议题',
    });

    expect(missing.status).toBe(400);
    expect(unknown.status).toBe(400);
    expect(invalidOption.status).toBe(400);
    expect(await prisma().ticket.count()).toBe(0);
  });

  it('rejects a server key without a player session', async () => {
    const server = await createServer('mc-create-no-session');

    const res = await request(app).post('/api/mc/tickets').set('X-Server-Key', server.apiKey).send({
      minecraftUuid: 'unknown-uuid',
      title: 'Test',
      body: 'Body',
      template: 'bug_report',
    });

    expect(res.status).toBe(401);
  });

  it('lists visible tickets only from the current server', async () => {
    const server = await createServer('mc-list');
    const otherServer = await createServer('mc-list-other');
    const player = await createAuthenticatedPlayer(server, 'mclist');
    const local = await prisma().ticket.create({
      data: {
        title: 'Local ticket',
        body: 'Body',
        template: 'bug_report',
        authorId: player.user.id,
        serverId: server.id,
      },
    });
    const remote = await prisma().ticket.create({
      data: {
        title: 'Remote ticket',
        body: 'Body',
        template: 'bug_report',
        authorId: player.user.id,
        serverId: otherServer.id,
      },
    });
    const web = await prisma().ticket.create({
      data: {
        title: 'Web ticket',
        body: 'Body',
        template: 'bug_report',
        authorId: player.user.id,
      },
    });

    const res = await request(app)
      .get('/api/mc/tickets')
      .set('X-Server-Key', server.apiKey)
      .set('X-Player-Session', player.sessionToken)
      .query({ minecraftUuid: player.minecraftUuid });

    expect(res.status).toBe(200);
    const ids = res.body.data.tickets.map((ticket: { id: number }) => ticket.id);
    expect(ids).toContain(local.id);
    expect(ids).not.toContain(remote.id);
    expect(ids).not.toContain(web.id);
  });

  it('requires the compatibility path UUID to match the session', async () => {
    const server = await createServer('mc-list-path');
    const player = await createAuthenticatedPlayer(server, 'mclistpath');

    const res = await request(app)
      .get('/api/mc/tickets/different-uuid')
      .set('X-Server-Key', server.apiKey)
      .set('X-Player-Session', player.sessionToken);

    expect(res.status).toBe(403);
  });

  it('does not read or modify a ticket belonging to another server', async () => {
    const serverA = await createServer('mc-isolation-a');
    const serverB = await createServer('mc-isolation-b');
    const admin = await createAuthenticatedPlayer(serverA, 'mcisolationadmin', 'admin');
    const ticket = await prisma().ticket.create({
      data: {
        title: 'Server B ticket',
        body: 'Body',
        template: 'bug_report',
        authorId: admin.user.id,
        serverId: serverB.id,
      },
    });

    const detail = await request(app)
      .get(`/api/mc/tickets/${ticket.id}/detail`)
      .set('X-Server-Key', serverA.apiKey)
      .set('X-Player-Session', admin.sessionToken)
      .query({ minecraftUuid: admin.minecraftUuid });
    const update = await request(app)
      .post(`/api/mc/tickets/${ticket.id}/status`)
      .set('X-Server-Key', serverA.apiKey)
      .set('X-Player-Session', admin.sessionToken)
      .send({ minecraftUuid: admin.minecraftUuid, status: 'invalid' });

    expect(detail.status).toBe(404);
    expect(update.status).toBe(404);
  });

  it('creates comments using the authenticated account', async () => {
    const server = await createServer('mc-comment');
    const player = await createAuthenticatedPlayer(server, 'mccomment');
    const ticket = await prisma().ticket.create({
      data: {
        title: 'Ticket with comment',
        body: 'Body',
        template: 'bug_report',
        authorId: player.user.id,
        serverId: server.id,
      },
    });

    const res = await request(app)
      .post('/api/mc/comments')
      .set('X-Server-Key', server.apiKey)
      .set('X-Player-Session', player.sessionToken)
      .send({
        minecraftUuid: player.minecraftUuid,
        ticketId: ticket.id,
        body: 'Comment from game',
      });

    expect(res.status).toBe(201);
    expect(res.body.data.authorId).toBe(player.user.id);
  });

  it('allows a player to close their own ticket', async () => {
    const server = await createServer('mc-close');
    const player = await createAuthenticatedPlayer(server, 'mcclose');
    const ticket = await prisma().ticket.create({
      data: {
        title: 'Close me',
        body: 'Body',
        template: 'bug_report',
        authorId: player.user.id,
        serverId: server.id,
      },
    });

    const res = await request(app)
      .post(`/api/mc/tickets/${ticket.id}/close`)
      .set('X-Server-Key', server.apiKey)
      .set('X-Player-Session', player.sessionToken)
      .send({ minecraftUuid: player.minecraftUuid });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('closed');
  });

  it('rejects a player changing their own ticket to invalid', async () => {
    const server = await createServer('mc-status-player');
    const player = await createAuthenticatedPlayer(server, 'mcstatusplayer');
    const ticket = await prisma().ticket.create({
      data: {
        title: 'Player ticket',
        body: 'Body',
        template: 'bug_report',
        authorId: player.user.id,
        serverId: server.id,
      },
    });

    const res = await request(app)
      .post(`/api/mc/tickets/${ticket.id}/status`)
      .set('X-Server-Key', server.apiKey)
      .set('X-Player-Session', player.sessionToken)
      .send({ minecraftUuid: player.minecraftUuid, status: 'invalid' });

    expect(res.status).toBe(403);
  });

  it('inherits admin permissions from the bound API account', async () => {
    const server = await createServer('mc-status-admin');
    const admin = await createAuthenticatedPlayer(server, 'mcstatusadmin');
    await prisma().user.update({ where: { id: admin.user.id }, data: { role: 'admin' } });
    const author = await prisma().user.create({
      data: {
        email: 'mcstatusauthor@test.com',
        passwordHash: await bcrypt.hash('Password123!', 12),
        username: 'mcstatusauthor',
      },
    });
    const hidden = await prisma().ticket.create({
      data: {
        title: 'Hidden ticket',
        body: 'Body',
        template: 'bug_report',
        hidden: true,
        authorId: author.id,
        serverId: server.id,
      },
    });

    const list = await request(app)
      .get('/api/mc/tickets')
      .set('X-Server-Key', server.apiKey)
      .set('X-Player-Session', admin.sessionToken)
      .query({ minecraftUuid: admin.minecraftUuid });
    const update = await request(app)
      .post(`/api/mc/tickets/${hidden.id}/status`)
      .set('X-Server-Key', server.apiKey)
      .set('X-Player-Session', admin.sessionToken)
      .send({ minecraftUuid: admin.minecraftUuid, status: 'invalid' });

    expect(list.body.data.tickets.map((ticket: { id: number }) => ticket.id)).toContain(hidden.id);
    expect(update.status).toBe(200);
    expect(update.body.data.status).toBe('invalid');
  });

  it('rejects a player reopening their own invalid ticket', async () => {
    const server = await createServer('mc-invalid-reopen');
    const player = await createAuthenticatedPlayer(server, 'mcinvalidreopen');
    const ticket = await prisma().ticket.create({
      data: {
        title: 'Invalid ticket',
        body: 'Body',
        template: 'bug_report',
        status: 'invalid',
        authorId: player.user.id,
        serverId: server.id,
      },
    });

    const res = await request(app)
      .post(`/api/mc/tickets/${ticket.id}/status`)
      .set('X-Server-Key', server.apiKey)
      .set('X-Player-Session', player.sessionToken)
      .send({ minecraftUuid: player.minecraftUuid, status: 'open' });

    expect(res.status).toBe(403);
  });
});

describe('POST /api/mc/unlink', () => {
  it('rejects plugin unlink and leaves the binding unchanged', async () => {
    const server = await createServer('mc-unlink');
    const player = await createAuthenticatedPlayer(server, 'mcunlink');

    const res = await request(app)
      .post('/api/mc/unlink')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: player.minecraftUuid });

    expect(res.status).toBe(403);
    const stored = await prisma().user.findUniqueOrThrow({ where: { id: player.user.id } });
    expect(stored.minecraftUuid).toBe(player.minecraftUuid);
  });

  it('rejects an unlinked UUID without changing data', async () => {
    const server = await createServer('mc-unlink-none');

    const res = await request(app)
      .post('/api/mc/unlink')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: 'not-linked' });

    expect(res.status).toBe(403);
  });

  it('rejects without minecraftUuid', async () => {
    const server = await createServer('mc-unlink-noid');

    const res = await request(app)
      .post('/api/mc/unlink')
      .set('X-Server-Key', server.apiKey)
      .send({});

    expect(res.status).toBe(400);
  });

  it('rejects without server key', async () => {
    const res = await request(app).post('/api/mc/unlink').send({ minecraftUuid: 'uuid' });

    expect(res.status).toBe(401);
  });

  it('invalidates existing player sessions after the Web account unlinks', async () => {
    const server = await createServer('mc-web-unlink');
    const player = await createAuthenticatedPlayer(server, 'mcwebunlink');
    const accessToken = generateAccessToken(player.user.id, player.user.role);

    const unlink = await request(app)
      .delete('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${accessToken}`);
    const after = await request(app)
      .get(`/api/mc/user/${player.minecraftUuid}`)
      .set('X-Server-Key', server.apiKey)
      .set('X-Player-Session', player.sessionToken);

    expect(unlink.status).toBe(200);
    expect(after.status).toBe(401);
  });
});

describe('POST /api/mc/register', () => {
  const registration = (suffix: string) => ({
    email: `${suffix}@test.com`,
    password: 'Password123!',
    username: suffix,
    minecraftUuid: createMinecraftUuid(),
    minecraftName: suffix,
  });

  it('creates a bound user and returns only its player credential', async () => {
    const server = await createServer('mc-reg');
    const body = { ...registration('mcreguser'), email: ' MCRegUser@Test.Com ' };

    const res = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send(body);

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('playerCredential');
    expect(res.body.data).not.toHaveProperty('accessToken');
    expect(res.body.data).not.toHaveProperty('refreshToken');
    expect(res.body.data.user.minecraftUuid).toBe(body.minecraftUuid);
    expect(res.body.data.user.email).toBe('mcreguser@test.com');

    const session = await request(app)
      .post('/api/mc/session')
      .set('X-Server-Key', server.apiKey)
      .send({
        minecraftUuid: body.minecraftUuid,
        playerCredential: res.body.data.playerCredential,
      });
    expect(session.status).toBe(201);
  });

  it('requires and consumes an email verification code when SMTP is enabled', async () => {
    clearTestOutbox();
    const server = await createServer('mc-reg-email');
    await prisma().appConfig.create({
      data: {
        id: 'default',
        mailConfig: JSON.stringify({
          enabled: true,
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          username: 'mailer',
          password: 'secret',
          fromName: 'LightTickets',
          fromAddress: 'noreply@example.com',
        }),
      },
    });
    const body = registration('mcregverify');

    const codeRequest = await request(app)
      .post('/api/auth/register/verification-code')
      .send({ email: body.email });
    expect(codeRequest.status).toBe(200);
    const code = getTestOutbox()[0].text.match(/\b\d{6}\b/)?.[0];
    expect(code).toMatch(/^\d{6}$/);

    const missing = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send(body);
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe('请输入邮箱验证码');

    const valid = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({ ...body, emailVerificationCode: code });
    expect(valid.status).toBe(201);
    await expect(prisma().registrationEmailVerification.count()).resolves.toBe(0);
  });

  it('rejects without server key', async () => {
    const res = await request(app).post('/api/mc/register').send(registration('mcregnokey'));
    expect(res.status).toBe(401);
  });

  it('rejects duplicate email', async () => {
    const server = await createServer('mc-reg-dup');
    const first = registration('mcregdup1');
    await request(app).post('/api/mc/register').set('X-Server-Key', server.apiKey).send(first);

    const res = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({ ...registration('mcregdup2'), email: first.email });

    expect(res.status).toBe(409);
  });

  it('rejects duplicate username', async () => {
    const server = await createServer('mc-reg-username');
    const first = registration('mcregshared');
    await request(app).post('/api/mc/register').set('X-Server-Key', server.apiKey).send(first);

    const res = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({ ...registration('mcregother'), username: first.username });

    expect(res.status).toBe(409);
  });

  it('rejects when minecraft uuid is already linked to another account', async () => {
    const server = await createServer('mc-reg-uuid');
    const first = registration('mcreguuid1');
    await request(app).post('/api/mc/register').set('X-Server-Key', server.apiKey).send(first);

    const res = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({ ...registration('mcreguuid2'), minecraftUuid: first.minecraftUuid });

    expect(res.status).toBe(409);
  });

  it('rejects invalid payload', async () => {
    const server = await createServer('mc-reg-invalid');

    const res = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({
        email: 'not-an-email',
        password: 'short',
        username: 'x',
        minecraftUuid: 'invalid-uuid',
        minecraftName: 'Invalid',
      });

    expect([400, 422]).toContain(res.status);
  });

  it('rejects invalid Minecraft identity formats', async () => {
    const server = await createServer('mc-reg-format');
    const base = registration('mcregformat');

    const invalidUuid = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({ ...base, minecraftUuid: 'not-a-uuid' });
    expect(invalidUuid.status).toBe(400);

    const invalidName = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({ ...base, minecraftName: '<click:run_command:/op>' });
    expect(invalidName.status).toBe(400);
  });

  it('applies the configured auth rate limit', async () => {
    const server = await createServer('mc-reg-rate-limit');
    await rateLimitConfigService.updateRateLimitConfig({
      auth: { windowSeconds: 60, maxRequests: 1 },
    });
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');

    const first = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send(registration('mcregrate1'));
    const limited = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send(registration('mcregrate2'));

    expect(first.status).toBe(201);
    expect(limited.status).toBe(429);
  });

  it('rejects when allowMcRegister is disabled', async () => {
    const server = await createServer('mc-reg-disabled');
    const setupRes = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 'mcreg-admin@test.com', password: 'admin123', username: 'mcregadmin' },
      });
    await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${setupRes.body.data.accessToken}`)
      .send({ allowMcRegister: false });

    const res = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send(registration('mcregdisabled'));

    expect(res.status).toBe(403);
  });
});
