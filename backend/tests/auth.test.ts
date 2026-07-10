import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';
import { clearTestOutbox, getTestOutbox } from '../src/services/mail.service.js';

const app = createApp();

const mailConfig = {
  enabled: true,
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  username: 'mailer',
  password: 'secret',
  fromName: 'LightTickets',
  fromAddress: 'noreply@example.com',
};

describe('POST /api/auth/register', () => {
  it('creates a new user and returns tokens', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'Password123!', username: 'testuser' });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');
    expect(res.body.data.user.email).toBe('test@example.com');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');
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
    expect(res.body.data).toHaveProperty('accessToken');
  });

  it('returns tokens for valid username credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'userlogin@example.com', password: 'Password123!', username: 'userlogin' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'userlogin', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data.user.username).toBe('userlogin');
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
      .send({ refreshToken: reg.body.data.refreshToken });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
  });
});

describe('POST /api/auth/password-reset', () => {
  it('sends a reset email and accepts the token once', async () => {
    clearTestOutbox();
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'reset@example.com', password: 'Password123!', username: 'resetuser' });
    await prisma().appConfig.create({ data: { mailConfig: JSON.stringify(mailConfig) } });

    const requestRes = await request(app)
      .post('/api/auth/password-reset/request')
      .set('Origin', 'http://localhost:5173')
      .send({ emailOrUsername: 'resetuser' });

    expect(requestRes.status).toBe(200);
    expect(requestRes.body.data.accepted).toBe(true);
    expect(getTestOutbox()).toHaveLength(1);
    expect(getTestOutbox()[0].to).toBe('reset@example.com');
    expect(getTestOutbox()[0].html).toContain('border-radius:12px');

    const tokenMatch = getTestOutbox()[0].text.match(/reset-password\?token=([^\s]+)/);
    expect(tokenMatch?.[1]).toBeTruthy();
    const token = decodeURIComponent(tokenMatch![1]);

    const resetRes = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ token, password: 'NewPassword123!' });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.data.reset).toBe(true);

    const oldLogin = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'reset@example.com', password: 'Password123!' });
    expect(oldLogin.status).toBe(401);

    const newLogin = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'reset@example.com', password: 'NewPassword123!' });
    expect(newLogin.status).toBe(200);

    const reuse = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ token, password: 'AnotherPassword123!' });
    expect(reuse.status).toBe(400);
  });

  it('does not send email for unknown accounts', async () => {
    clearTestOutbox();
    await prisma().appConfig.create({ data: { mailConfig: JSON.stringify(mailConfig) } });

    const res = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'missinguser' });

    expect(res.status).toBe(200);
    expect(res.body.data.accepted).toBe(true);
    expect(getTestOutbox()).toHaveLength(0);
  });

  it('limits reset email sends to one per minute for the same account', async () => {
    clearTestOutbox();
    await request(app).post('/api/auth/register').send({
      email: 'limited-reset@example.com',
      password: 'Password123!',
      username: 'limitedreset',
    });
    await prisma().appConfig.create({ data: { mailConfig: JSON.stringify(mailConfig) } });

    const first = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'limitedreset' });
    const second = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'limited-reset@example.com' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(getTestOutbox()).toHaveLength(1);
    await expect(prisma().passwordResetToken.count()).resolves.toBe(1);
  });

  it('rejects reset requests when mail is disabled', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'disabled-reset@example.com',
      password: 'Password123!',
      username: 'disabledreset',
    });

    const existing = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'disabledreset' });
    const missing = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'disabled-missing' });

    expect(existing.status).toBe(400);
    expect(missing.status).toBe(400);
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
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`)
      .send({ code: code.body.data.code });

    expect(res.status).toBe(200);
    expect(res.body.data.uuid).toBe('550e8400-e29b-41d4-a716-446655440030');
    expect(res.body.data.name).toBe('Linker');
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
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`)
      .send({ code: code.body.data.code });

    const res = await request(app)
      .delete('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.minecraftUuid).toBeNull();
    expect(res.body.data.minecraftName).toBeNull();
    expect(res.body.data.username).toBe('unlinkmc');

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
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`);

    expect(res.status).toBe(400);
  });

  it('rejects without auth token', async () => {
    const res = await request(app).delete('/api/auth/link-minecraft');

    expect(res.status).toBe(401);
  });
});
