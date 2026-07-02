import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

describe('POST /api/mc/link-code', () => {
  it('generates a 6-digit link code', async () => {
    const server = await prisma().server.create({
      data: { name: 'survival', apiKey: 'test-server-key-123', address: 'mc.example.com' },
    });

    const res = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440000', minecraftName: 'Steve' });

    expect(res.status).toBe(201);
    expect(res.body.code).toMatch(/^\d{6}$/);
    expect(res.body).toHaveProperty('expiresAt');
  });

  it('rejects without server key', async () => {
    const res = await request(app)
      .post('/api/mc/link-code')
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440000', minecraftName: 'Steve' });

    expect(res.status).toBe(401);
  });

  it('rejects already-linked player with 409', async () => {
    const server = await prisma().server.create({
      data: { name: 'survival-bound', apiKey: 'test-server-key-bound', address: 'mc.example.com' },
    });
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.default.hash('Password123!', 12);
    await prisma().user.create({
      data: {
        email: 'bound@test.com',
        passwordHash: hash,
        username: 'boundplayer',
        minecraftUuid: '660e8400-e29b-41d4-a716-446655440099',
        minecraftName: 'BoundSteve',
      },
    });

    const res = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: '660e8400-e29b-41d4-a716-446655440099', minecraftName: 'BoundSteve' });

    expect(res.status).toBe(409);
    expect(res.body).toHaveProperty('error');
  });
});

describe('POST /api/mc/tickets', () => {
  it('creates a ticket from game context', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-srv', apiKey: 'mc-key-456' },
    });

    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.default.hash('Password123!', 12);
    await prisma().user.create({
      data: {
        email: 'mcplayer@test.com',
        passwordHash: hash,
        username: 'mcplayer',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440000',
        minecraftName: 'Steve',
      },
    });

    const res = await request(app)
      .post('/api/mc/tickets')
      .set('X-Server-Key', server.apiKey)
      .send({
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440000',
        title: 'Block glitch',
        body: 'Blocks disappear when placed',
        template: 'bug_report',
        context: { world: 'world', x: 100, y: 64, z: -200, gameMode: 'SURVIVAL' },
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Block glitch');
  });

  it('rejects unlinked player', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-srv2', apiKey: 'mc-key-789' },
    });

    const res = await request(app)
      .post('/api/mc/tickets')
      .set('X-Server-Key', server.apiKey)
      .send({
        minecraftUuid: 'unknown-uuid',
        title: 'Test',
        body: 'Body',
        template: 'bug_report',
      });

    expect(res.status).toBe(404);
  });
});

describe('GET /api/mc/tickets/:uuid', () => {
  it('returns tickets for linked player', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-list', apiKey: 'mc-list-key' },
    });
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.default.hash('Password123!', 12);
    await prisma().user.create({
      data: {
        email: 'mclist@test.com',
        passwordHash: hash,
        username: 'mclist',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440001',
        minecraftName: 'Alex',
      },
    });

    await request(app)
      .post('/api/mc/tickets')
      .set('X-Server-Key', server.apiKey)
      .send({
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440001',
        title: 'MC Ticket',
        body: 'From game',
        template: 'bug_report',
      });

    const res = await request(app)
      .get('/api/mc/tickets/550e8400-e29b-41d4-a716-446655440001')
      .set('X-Server-Key', server.apiKey);

    expect(res.status).toBe(200);
    expect(res.body.tickets.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for unknown uuid', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-empty', apiKey: 'mc-empty-key' },
    });

    const res = await request(app)
      .get('/api/mc/tickets/00000000-0000-0000-0000-000000000000')
      .set('X-Server-Key', server.apiKey);

    expect(res.status).toBe(200);
    expect(res.body.tickets).toEqual([]);
  });
});

describe('POST /api/mc/comments', () => {
  it('creates a comment from game', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-comment', apiKey: 'mc-comment-key' },
    });
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.default.hash('Password123!', 12);
    await prisma().user.create({
      data: {
        email: 'mccomment@test.com',
        passwordHash: hash,
        username: 'mccomment',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440002',
        minecraftName: 'Commenter',
      },
    });

    const ticket = await request(app)
      .post('/api/mc/tickets')
      .set('X-Server-Key', server.apiKey)
      .send({
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440002',
        title: 'Ticket with comment',
        body: 'Body',
        template: 'bug_report',
      });

    const res = await request(app)
      .post('/api/mc/comments')
      .set('X-Server-Key', server.apiKey)
      .send({
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440002',
        ticketId: ticket.body.id,
        body: 'Comment from game',
      });

    expect(res.status).toBe(201);
    expect(res.body.body).toBe('Comment from game');
  });
});

describe('POST /api/mc/tickets/:id/close', () => {
  it('allows linked player to close own ticket', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-close', apiKey: 'mc-close-key' },
    });
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.default.hash('Password123!', 12);
    await prisma().user.create({
      data: {
        email: 'mcclose@test.com',
        passwordHash: hash,
        username: 'mcclose',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440003',
        minecraftName: 'Closer',
      },
    });

    const ticket = await request(app)
      .post('/api/mc/tickets')
      .set('X-Server-Key', server.apiKey)
      .send({
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440003',
        title: 'To close from MC',
        body: 'Body',
        template: 'bug_report',
      });

    const res = await request(app)
      .post(`/api/mc/tickets/${ticket.body.id}/close`)
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440003' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('resolved');
  });
});

describe('POST /api/mc/unlink', () => {
  it('unbinds a linked minecraft account', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-unlink', apiKey: 'mc-unlink-key' },
    });
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.default.hash('Password123!', 12);
    await prisma().user.create({
      data: {
        email: 'mcunlink@test.com',
        passwordHash: hash,
        username: 'mcunlink',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440020',
        minecraftName: 'Unlinker',
      },
    });

    const res = await request(app)
      .post('/api/mc/unlink')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440020' });

    expect(res.status).toBe(200);
    expect(res.body.minecraftUuid).toBeNull();
    expect(res.body.minecraftName).toBeNull();
    expect(res.body.username).toBe('mcunlink');

    const dbUser = await prisma().user.findUnique({ where: { email: 'mcunlink@test.com' } });
    expect(dbUser?.minecraftUuid).toBeNull();
    expect(dbUser?.minecraftName).toBeNull();
  });

  it('rejects unlinked player', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-unlink-none', apiKey: 'mc-unlink-none-key' },
    });

    const res = await request(app)
      .post('/api/mc/unlink')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: '00000000-0000-0000-0000-000000000000' });

    expect(res.status).toBe(404);
  });

  it('rejects without minecraftUuid', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-unlink-noid', apiKey: 'mc-unlink-noid-key' },
    });

    const res = await request(app)
      .post('/api/mc/unlink')
      .set('X-Server-Key', server.apiKey)
      .send({});

    expect(res.status).toBe(400);
  });

  it('rejects without server key', async () => {
    const res = await request(app)
      .post('/api/mc/unlink')
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440020' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/mc/register', () => {
  it('creates a user and binds the minecraft account directly', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-reg', apiKey: 'mc-reg-key' },
    });

    const res = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({
        email: 'mcreg@test.com',
        password: 'Password123!',
        username: 'mcreguser',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440010',
        minecraftName: 'RegPlayer',
      });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe('mcreg@test.com');
    expect(res.body.user.minecraftUuid).toBe('550e8400-e29b-41d4-a716-446655440010');
    expect(res.body.user.minecraftName).toBe('RegPlayer');
    expect(res.body.user).not.toHaveProperty('passwordHash');

    // Registered player is directly bound and can create tickets
    const ticket = await request(app)
      .post('/api/mc/tickets')
      .set('X-Server-Key', server.apiKey)
      .send({
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440010',
        title: 'From registered player',
        body: 'Body',
        template: 'bug_report',
      });
    expect(ticket.status).toBe(201);
  });

  it('rejects without server key', async () => {
    const res = await request(app)
      .post('/api/mc/register')
      .send({
        email: 'nokey@test.com',
        password: 'Password123!',
        username: 'nokeyuser',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440011',
        minecraftName: 'NoKey',
      });

    expect(res.status).toBe(401);
  });

  it('rejects duplicate email', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-reg-dup', apiKey: 'mc-reg-dup-key' },
    });

    await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({
        email: 'mcregdup@test.com',
        password: 'Password123!',
        username: 'mcregdup1',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440012',
        minecraftName: 'Dup1',
      });

    const res = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({
        email: 'mcregdup@test.com',
        password: 'Password123!',
        username: 'mcregdup2',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440013',
        minecraftName: 'Dup2',
      });

    expect(res.status).toBe(409);
  });

  it('rejects duplicate username', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-reg-username', apiKey: 'mc-reg-username-key' },
    });

    await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({
        email: 'mcregun1@test.com',
        password: 'Password123!',
        username: 'sharedname',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440014',
        minecraftName: 'Shared1',
      });

    const res = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({
        email: 'mcregun2@test.com',
        password: 'Password123!',
        username: 'sharedname',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440015',
        minecraftName: 'Shared2',
      });

    expect(res.status).toBe(409);
  });

  it('rejects when minecraft uuid already linked to another account', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-reg-uuid', apiKey: 'mc-reg-uuid-key' },
    });

    await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({
        email: 'mcuuid1@test.com',
        password: 'Password123!',
        username: 'mcuuid1',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440016',
        minecraftName: 'Uuid1',
      });

    const res = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({
        email: 'mcuuid2@test.com',
        password: 'Password123!',
        username: 'mcuuid2',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440016',
        minecraftName: 'Uuid1Again',
      });

    expect(res.status).toBe(409);
  });

  it('rejects invalid payload', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-reg-invalid', apiKey: 'mc-reg-invalid-key' },
    });

    const res = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({
        email: 'not-an-email',
        password: 'short',
        username: 'x',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440017',
        minecraftName: 'Invalid',
      });

    expect([400, 422]).toContain(res.status);
  });

  it('rejects when allowMcRegister is disabled', async () => {
    const server = await prisma().server.create({
      data: { name: 'mc-reg-disabled', apiKey: 'mc-reg-disabled-key' },
    });

    // Initialize setup so we can update settings (use token from setup response
    // directly, since /api/auth/login is gated behind platformOnlyMiddleware)
    const setupRes = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite', databaseUrl: 'file:./dev.db' },
        admin: { email: 'mcreg-admin@test.com', password: 'admin123', username: 'mcregadmin' },
      });

    await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${setupRes.body.accessToken}`)
      .send({ allowMcRegister: false });

    const res = await request(app)
      .post('/api/mc/register')
      .set('X-Server-Key', server.apiKey)
      .send({
        email: 'mcregdis@test.com',
        password: 'Password123!',
        username: 'mcregdis',
        minecraftUuid: '550e8400-e29b-41d4-a716-446655440018',
        minecraftName: 'Disabled',
      });

    expect(res.status).toBe(403);
  });
});
