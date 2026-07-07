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

describe('GET /api/labels', () => {
  it('returns all labels', async () => {
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
      .send({ name: 'bug', color: '#ef4444', description: 'Bug reports' });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('bug');
    expect(res.body.data.color).toBe('#ef4444');
  });

  it('rejects invalid color format', async () => {
    const token = await createAdminAndGetToken('admin-color@test.com');
    const res = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'test', color: 'red' });

    expect(res.status).toBe(400);
  });

  it('rejects missing name', async () => {
    const token = await createAdminAndGetToken('admin-name@test.com');
    const res = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ color: '#ef4444' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/labels/:id', () => {
  it('updates a label', async () => {
    const token = await createAdminAndGetToken('admin-patch@test.com');
    const created = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ name: 'patch-me', color: '#ef4444', description: 'Original' });

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
      .send({ name: 'delete-me', color: '#ef4444' });

    const res = await request(app)
      .delete(`/api/labels/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });
});
