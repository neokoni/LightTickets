import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

async function createAdminAndGetToken(email = 'admin@test.com') {
  const username = email.split('@')[0];
  await request(app).post('/api/auth/register').send({ email, password: 'Password123!', username });
  const user = await prisma().user.findUnique({ where: { email } });
  if (user) await prisma().user.update({ where: { id: user.id }, data: { role: 'admin' } });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: email, password: 'Password123!' });
  return loginRes.body.data.accessToken;
}

async function createUserAndGetToken(email = 'user@test.com') {
  const username = email.split('@')[0];
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username });
  return { token: res.body.data.accessToken, user: res.body.data.user };
}

describe('GET /api/users', () => {
  it('returns paginated user list for admin', async () => {
    const token = await createAdminAndGetToken('admin-users@test.com');
    await createUserAndGetToken('user1-users@test.com');

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.users).toBeInstanceOf(Array);
    expect(res.body.data.users.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('page');
  });

  it('rejects non-admin user', async () => {
    const { token } = await createUserAndGetToken('player-users@test.com');

    const res = await request(app).get('/api/users').set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/users/me/avatar', () => {
  it('updates own avatar', async () => {
    const { token } = await createUserAndGetToken('avatar@test.com');

    const res = await request(app)
      .patch('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: 'https://example.com/avatar.png' });

    expect(res.status).toBe(200);
    expect(res.body.data.avatarUrl).toBe('https://example.com/avatar.png');
  });

  it('clears avatar with empty string', async () => {
    const { token } = await createUserAndGetToken('avatar-clear@test.com');
    await request(app)
      .patch('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: 'https://example.com/avatar.png' });

    const res = await request(app)
      .patch('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: '' });

    expect(res.status).toBe(200);
    expect(res.body.data.avatarUrl).toBeNull();
  });

  it('rejects invalid URL', async () => {
    const { token } = await createUserAndGetToken('avatar-bad@test.com');

    const res = await request(app)
      .patch('/api/users/me/avatar')
      .set('Authorization', `Bearer ${token}`)
      .send({ avatarUrl: 'not-a-url' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/users/:id/role', () => {
  it('allows admin to change user role', async () => {
    const adminToken = await createAdminAndGetToken('admin-role@test.com');
    const { user } = await createUserAndGetToken('target-role@test.com');

    const res = await request(app)
      .patch(`/api/users/${user.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'staff' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('staff');
  });

  it('rejects invalid role', async () => {
    const adminToken = await createAdminAndGetToken('admin-role-bad@test.com');
    const { user } = await createUserAndGetToken('target-role-bad@test.com');

    const res = await request(app)
      .patch(`/api/users/${user.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'superadmin' });

    expect(res.status).toBe(400);
  });
});

describe('DELETE /api/users/:id', () => {
  it('allows admin to delete another user', async () => {
    const adminToken = await createAdminAndGetToken('admin-del@test.com');
    const { user } = await createUserAndGetToken('target-del@test.com');

    const res = await request(app)
      .delete(`/api/users/${user.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);

    const check = await prisma().user.findUnique({ where: { id: user.id } });
    expect(check).toBeNull();
  });

  it('rejects self-deletion', async () => {
    const adminToken = await createAdminAndGetToken('admin-self-del@test.com');
    const admin = await prisma().user.findUnique({ where: { email: 'admin-self-del@test.com' } });

    const res = await request(app)
      .delete(`/api/users/${admin!.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/users/me/username', () => {
  it('updates own username', async () => {
    const { token } = await createUserAndGetToken('uname@test.com');

    const res = await request(app)
      .patch('/api/users/me/username')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'newname' });

    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('newname');
  });

  it('rejects duplicate username', async () => {
    await createUserAndGetToken('taken@test.com');
    const { token } = await createUserAndGetToken('other@test.com');

    const res = await request(app)
      .patch('/api/users/me/username')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'taken' });

    expect(res.status).toBe(409);
  });

  it('rejects username that is too short', async () => {
    const { token } = await createUserAndGetToken('short@test.com');

    const res = await request(app)
      .patch('/api/users/me/username')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'a' });

    expect(res.status).toBe(400);
  });

  it('allows changing to a new unique username', async () => {
    const { token, user } = await createUserAndGetToken('change@test.com');

    const res = await request(app)
      .patch('/api/users/me/username')
      .set('Authorization', `Bearer ${token}`)
      .send({ username: 'changed' });

    expect(res.status).toBe(200);
    expect(res.body.data.username).toBe('changed');
    expect(res.body.data.id).toBe(user.id);
  });
});
