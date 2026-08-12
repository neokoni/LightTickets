import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

async function createAdminAndGetToken(email = 'admin@test.com') {
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  // Upgrade to admin in DB and re-login
  const user = await prisma().user.findUnique({ where: { email } });
  if (user) {
    await prisma().user.update({
      where: { id: user.id },
      data: { role: 'admin' },
    });
  }
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: email, password: 'Password123!' });
  return loginRes.body.data.accessToken;
}

async function createUserAndGetToken(email = 'user@test.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  return res.body.data.accessToken;
}

async function configurePrivateSite() {
  await prisma().setupStatus.create({ data: { isSetup: true, requireLogin: true } });
  await prisma().appConfig.create({ data: {} });
}

describe('GET /api/labels', () => {
  it('allows unauthenticated requests when requireLogin is false', async () => {
    const res = await request(app).get('/api/labels');

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });

  it('rejects unauthenticated requests when requireLogin is true', async () => {
    await configurePrivateSite();

    const res = await request(app).get('/api/labels');

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({
      success: false,
      statusCode: 401,
      message: '缺少认证令牌或格式不正确',
    });
  });

  it('allows authenticated requests when requireLogin is true', async () => {
    await configurePrivateSite();
    const token = await createUserAndGetToken();

    const res = await request(app).get('/api/labels').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });
});

describe('POST /api/labels', () => {
  it('allows admin to create a label', async () => {
    const token = await createAdminAndGetToken('admin-create@test.com');
    const res = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'bug', name: 'Bug', color: '#ef4444', description: 'Bug reports' });

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBe('bug');
    expect(res.body.data.name).toBe('Bug');
    expect(res.body.data.color).toBe('#ef4444');
  });

  it('rejects invalid color format', async () => {
    const token = await createAdminAndGetToken('admin-color@test.com');
    const res = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'test', name: 'test', color: 'red' });

    expect(res.status).toBe(400);
  });

  it('rejects missing name', async () => {
    const token = await createAdminAndGetToken('admin-name@test.com');
    const res = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'test', color: '#ef4444' });

    expect(res.status).toBe(400);
  });

  it('rejects missing identifier', async () => {
    const token = await createAdminAndGetToken('admin-identifier@test.com');
    const res = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'Test', color: '#ef4444' });

    expect(res.status).toBe(400);
  });

  it('rejects an invalid identifier', async () => {
    const token = await createAdminAndGetToken('admin-invalid-identifier@test.com');
    const res = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'invalid identifier', name: 'Test', color: '#ef4444' });

    expect(res.status).toBe(400);
  });

  it('rejects a duplicate identifier', async () => {
    const token = await createAdminAndGetToken('admin-duplicate-identifier@test.com');
    await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'duplicate', name: 'First', color: '#ef4444' });
    const res = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'duplicate', name: 'Second', color: '#22c55e' });

    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/labels/:id', () => {
  it('updates a label', async () => {
    const token = await createAdminAndGetToken('admin-patch@test.com');
    const created = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'patch-me',
        name: 'Patch me',
        color: '#ef4444',
        description: 'Original',
      });

    const res = await request(app)
      .patch(`/api/labels/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Updated desc' });

    expect(res.status).toBe(200);
  });
});

describe('DELETE /api/labels/:id', () => {
  it('deletes a label', async () => {
    const token = await createAdminAndGetToken('admin-delete@test.com');
    const created = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'delete-me', name: 'Delete me', color: '#ef4444' });

    const res = await request(app)
      .delete(`/api/labels/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });
});
