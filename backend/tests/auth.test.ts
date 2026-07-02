import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

describe('POST /api/auth/register', () => {
  it('creates a new user and returns tokens', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'Password123!', username: 'testuser' });

    expect(res.status).toBe(201);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');
    expect(res.body.user.email).toBe('test@example.com');
    expect(res.body.user).not.toHaveProperty('passwordHash');
  });

  it('rejects duplicate email', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'Password123!', username: 'user1' });

    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'Password123!', username: 'user2' });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('returns tokens for valid email credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@example.com', password: 'Password123!', username: 'loginuser' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'login@example.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });

  it('returns tokens for valid username credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'userlogin@example.com', password: 'Password123!', username: 'userlogin' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'userlogin', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body.user.username).toBe('userlogin');
  });

  it('rejects invalid password', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'login@example.com', password: 'wrong' });

    expect(res.status).toBe(401);
  });

  it('rejects non-existent username', async () => {
    const res = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'nonexistent', password: 'Password123!' });

    expect(res.status).toBe(401);
  });
});

describe('POST /api/auth/refresh', () => {
  it('returns new access token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'refresh@example.com', password: 'Password123!', username: 'refreshuser' });

    const res = await request(app)
      .post('/api/auth/refresh')
      .send({ refreshToken: reg.body.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('accessToken');
  });
});

describe('POST /api/auth/link-minecraft', () => {
  it('binds a minecraft account using a link code', async () => {
    const server = await prisma().server.create({
      data: { name: 'link-srv', apiKey: 'link-srv-key' },
    });
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'linkmc@test.com', password: 'Password123!', username: 'linkmc' });

    const code = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440030', minecraftName: 'Linker' });

    const res = await request(app)
      .post('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ code: code.body.code });

    expect(res.status).toBe(200);
    expect(res.body.uuid).toBe('550e8400-e29b-41d4-a716-446655440030');
    expect(res.body.name).toBe('Linker');
  });
});

describe('DELETE /api/auth/link-minecraft', () => {
  it('unbinds the current user minecraft account', async () => {
    const server = await prisma().server.create({
      data: { name: 'unlink-srv', apiKey: 'unlink-srv-key' },
    });
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'unlinkmc@test.com', password: 'Password123!', username: 'unlinkmc' });

    const code = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', server.apiKey)
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440031', minecraftName: 'Unlinker' });

    await request(app)
      .post('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${reg.body.accessToken}`)
      .send({ code: code.body.code });

    const res = await request(app)
      .delete('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.minecraftUuid).toBeNull();
    expect(res.body.minecraftName).toBeNull();
    expect(res.body.username).toBe('unlinkmc');

    const dbUser = await prisma().user.findUnique({ where: { email: 'unlinkmc@test.com' } });
    expect(dbUser?.minecraftUuid).toBeNull();
    expect(dbUser?.minecraftName).toBeNull();
  });

  it('rejects unbind when not bound', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'notbound@test.com', password: 'Password123!', username: 'notbound' });

    const res = await request(app)
      .delete('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${reg.body.accessToken}`);

    expect(res.status).toBe(400);
  });

  it('rejects without auth token', async () => {
    const res = await request(app)
      .delete('/api/auth/link-minecraft');

    expect(res.status).toBe(401);
  });
});
