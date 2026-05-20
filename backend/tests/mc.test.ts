import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

describe('POST /api/mc/link-code', () => {
  it('generates a 6-digit link code', async () => {
    const server = await prisma.server.create({
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
});

describe('POST /api/mc/tickets', () => {
  it('creates a ticket from game context', async () => {
    const server = await prisma.server.create({
      data: { name: 'mc-srv', apiKey: 'mc-key-456' },
    });

    // Create user directly in DB with MC UUID already linked
    const bcrypt = await import('bcrypt');
    const hash = await bcrypt.default.hash('Password123!', 12);
    await prisma.user.create({
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
        type: 'bug_report',
        context: { world: 'world', x: 100, y: 64, z: -200, gameMode: 'SURVIVAL' },
      });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Block glitch');
  });

  it('rejects unlinked player', async () => {
    const server = await prisma.server.create({
      data: { name: 'mc-srv2', apiKey: 'mc-key-789' },
    });

    const res = await request(app)
      .post('/api/mc/tickets')
      .set('X-Server-Key', server.apiKey)
      .send({
        minecraftUuid: 'unknown-uuid',
        title: 'Test',
        body: 'Body',
        type: 'bug_report',
      });

    expect(res.status).toBe(404);
  });
});
