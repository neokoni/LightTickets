import { describe, it, expect } from 'vitest';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { getConfig } from '../src/config.js';
import { prisma } from './setup.js';
import { createUnsubscribeToken } from '../src/services/ticket-notification.service.js';
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

async function configureEmailChangeMail() {
  const setupStatus = await prisma().setupStatus.findFirst();
  if (setupStatus) {
    await prisma().setupStatus.update({
      where: { id: setupStatus.id },
      data: { isSetup: true, siteUrl: 'https://tickets.example.com', defaultLanguage: 'zh-CN' },
    });
  } else {
    await prisma().setupStatus.create({
      data: {
        isSetup: true,
        siteUrl: 'https://tickets.example.com',
        defaultLanguage: 'zh-CN',
      },
    });
  }
  const appConfig = await prisma().appConfig.findFirst();
  if (appConfig) {
    await prisma().appConfig.update({
      where: { id: appConfig.id },
      data: { mailConfig: JSON.stringify(mailConfig) },
    });
  } else {
    await prisma().appConfig.create({ data: { mailConfig: JSON.stringify(mailConfig) } });
  }
}

function getRefreshCookie(setCookies: string[] | undefined): string {
  const value = setCookies?.find((item) => item.startsWith('lt_refresh_token='));
  if (!value) throw new Error('refresh cookie missing');
  return value.split(';', 1)[0];
}

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
  return {
    token: res.body.data.accessToken,
    refreshToken: decodeURIComponent(
      getRefreshCookie(res.headers['set-cookie']).slice('lt_refresh_token='.length),
    ),
    refreshCookie: getRefreshCookie(res.headers['set-cookie']),
    user: res.body.data.user,
  };
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

describe('email notification preferences', () => {
  it('defaults to enabled and lets the user update the preference', async () => {
    const { token, user } = await createUserAndGetToken('notifications@test.com');
    expect(user.receiveEmailNotifications).toBe(true);

    const res = await request(app)
      .patch('/api/users/me/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({ receiveEmailNotifications: false });

    expect(res.status).toBe(200);
    expect(res.body.data.receiveEmailNotifications).toBe(false);
    expect(
      await prisma().user.findUnique({
        where: { id: user.id },
        select: { receiveEmailNotifications: true },
      }),
    ).toEqual({ receiveEmailNotifications: false });
  });

  it('requires a boolean preference value', async () => {
    const { token } = await createUserAndGetToken('notifications-invalid@test.com');
    const res = await request(app)
      .patch('/api/users/me/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({ receiveEmailNotifications: 'yes' });
    expect(res.status).toBe(400);
  });

  it('unsubscribes with a signed public token', async () => {
    const { user } = await createUserAndGetToken('unsubscribe@test.com');
    const res = await request(app)
      .post('/api/users/email-notifications/unsubscribe')
      .send({ token: createUnsubscribeToken(user.id) });

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual({ unsubscribed: true });
    const updated = await prisma().user.findUnique({ where: { id: user.id } });
    expect(updated?.receiveEmailNotifications).toBe(false);
  });

  it('rejects an invalid unsubscribe token', async () => {
    const res = await request(app)
      .post('/api/users/email-notifications/unsubscribe')
      .send({ token: 'invalid' });
    expect(res.status).toBe(400);
  });

  it('rejects an unsubscribe token used as a Bearer token', async () => {
    const { user } = await createUserAndGetToken('unsubscribe-bearer@test.com');
    const unsubscribeToken = createUnsubscribeToken(user.id);

    const res = await request(app)
      .patch('/api/users/me/email')
      .set('Authorization', `Bearer ${unsubscribeToken}`)
      .send({ email: 'attacker-controlled@test.com' });

    expect(res.status).toBe(401);
    expect(res.body).toMatchObject({ success: false, statusCode: 401 });
    const unchanged = await prisma().user.findUnique({ where: { id: user.id } });
    expect(unchanged?.email).toBe('unsubscribe-bearer@test.com');
  });

  it('keeps a legacy unsubscribe token inside the unsubscribe boundary', async () => {
    const { user } = await createUserAndGetToken('legacy-unsubscribe@test.com');
    const config = getConfig();
    const originalCutoff = config.security.legacyJwtCutoff;
    const cutoff = Math.floor(Date.now() / 1000);
    config.security.legacyJwtCutoff = cutoff;

    try {
      const legacyToken = jwt.sign(
        { userId: user.id, purpose: 'ticket-email-unsubscribe', iat: cutoff },
        config.security.jwtSecret,
        { algorithm: 'HS256', expiresIn: '30d' },
      );
      const bearerRes = await request(app)
        .patch('/api/users/me/email')
        .set('Authorization', `Bearer ${legacyToken}`)
        .send({ email: 'legacy-attacker@test.com' });
      expect(bearerRes.status).toBe(401);

      const unsubscribeRes = await request(app)
        .post('/api/users/email-notifications/unsubscribe')
        .send({ token: legacyToken });
      expect(unsubscribeRes.status).toBe(200);

      const unchanged = await prisma().user.findUnique({ where: { id: user.id } });
      expect(unchanged?.email).toBe('legacy-unsubscribe@test.com');
      expect(unchanged?.receiveEmailNotifications).toBe(false);
    } finally {
      config.security.legacyJwtCutoff = originalCutoff;
    }
  });

  it('rejects access and refresh tokens at the unsubscribe endpoint', async () => {
    const { token, refreshToken, user } = await createUserAndGetToken(
      'unsubscribe-boundary@test.com',
    );

    for (const wrongToken of [token, refreshToken]) {
      const res = await request(app)
        .post('/api/users/email-notifications/unsubscribe')
        .send({ token: wrongToken });
      expect(res.status).toBe(400);
    }

    const unchanged = await prisma().user.findUnique({ where: { id: user.id } });
    expect(unchanged?.receiveEmailNotifications).toBe(true);
  });

  it('rejects a refresh token used as a Bearer token', async () => {
    const { refreshToken } = await createUserAndGetToken('refresh-bearer@test.com');

    const res = await request(app)
      .patch('/api/users/me/notifications')
      .set('Authorization', `Bearer ${refreshToken}`)
      .send({ receiveEmailNotifications: false });

    expect(res.status).toBe(401);
  });
});

describe('PATCH /api/users/:id/role', () => {
  it('allows admin to change user role', async () => {
    const adminToken = await createAdminAndGetToken('admin-role@test.com');
    const { user, refreshCookie } = await createUserAndGetToken('target-role@test.com');

    const res = await request(app)
      .patch(`/api/users/${user.id}/role`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ role: 'staff' });

    expect(res.status).toBe(200);
    expect(res.body.data.role).toBe('staff');

    const refresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .send({});
    expect(refresh.status).toBe(401);
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

  it('uses the current role instead of an old admin token after demotion', async () => {
    const controllingAdminToken = await createAdminAndGetToken('role-controller@test.com');
    const demotedAdminToken = await createAdminAndGetToken('role-demoted@test.com');
    const demotedAdmin = await prisma().user.findUniqueOrThrow({
      where: { email: 'role-demoted@test.com' },
    });

    const demotion = await request(app)
      .patch(`/api/users/${demotedAdmin.id}/role`)
      .set('Authorization', `Bearer ${controllingAdminToken}`)
      .send({ role: 'player' });
    expect(demotion.status).toBe(200);

    const staleTokenRequest = await request(app)
      .patch(`/api/users/${demotedAdmin.id}/role`)
      .set('Authorization', `Bearer ${demotedAdminToken}`)
      .send({ role: 'admin' });

    expect(staleTokenRequest.status).toBe(401);
    expect(
      await prisma().user.findUnique({
        where: { id: demotedAdmin.id },
        select: { role: true },
      }),
    ).toEqual({ role: 'player' });
  });
});

describe('PATCH /api/users/me/password', () => {
  it('revokes old refresh sessions and issues a replacement cookie', async () => {
    const { token, refreshCookie, user } = await createUserAndGetToken('password-change@test.com');
    await prisma().user.update({
      where: { id: user.id },
      data: { pendingEmail: 'password-change-pending@test.com' },
    });
    await prisma().emailChangeRequest.create({
      data: {
        userId: user.id,
        newEmail: 'password-change-pending@test.com',
        codeHash: 'code-hash',
        cancelTokenHash: 'cancel-token-hash',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const changed = await request(app)
      .patch('/api/users/me/password')
      .set('Authorization', `Bearer ${token}`)
      .send({ currentPassword: 'Password123!', newPassword: 'NewPassword123!' });

    expect(changed.status).toBe(200);
    const staleAccess = await request(app)
      .patch('/api/users/me/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({ receiveEmailNotifications: false });
    expect(staleAccess.status).toBe(401);
    const replacementCookie = getRefreshCookie(changed.headers['set-cookie']);
    expect(replacementCookie).not.toBe(refreshCookie);
    await expect(
      prisma().user.findUniqueOrThrow({ where: { id: user.id }, select: { pendingEmail: true } }),
    ).resolves.toEqual({ pendingEmail: null });
    await expect(prisma().emailChangeRequest.count({ where: { userId: user.id } })).resolves.toBe(
      0,
    );

    const oldRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .send({});
    expect(oldRefresh.status).toBe(401);

    const replacementRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', replacementCookie)
      .send({});
    expect(replacementRefresh.status).toBe(200);
  });
});

describe('email change verification', () => {
  it('requires the current password and keeps the current email pending verification', async () => {
    clearTestOutbox();
    const { token, user } = await createUserAndGetToken('email-change-request@test.com');
    await configureEmailChangeMail();

    const missingPassword = await request(app)
      .patch('/api/users/me/email')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'email-change-new@test.com' });
    expect(missingPassword.status).toBe(400);

    const wrongPassword = await request(app)
      .patch('/api/users/me/email')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'email-change-new@test.com', currentPassword: 'wrong-password' });
    expect(wrongPassword.status).toBe(400);
    expect(wrongPassword.body.message).toBe('当前密码错误');

    const requested = await request(app)
      .patch('/api/users/me/email')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'Email-Change-New@test.com', currentPassword: 'Password123!' });
    expect(requested.status, JSON.stringify(requested.body)).toBe(200);
    expect(requested.body.data).toMatchObject({
      accepted: true,
      pendingEmail: 'email-change-new@test.com',
      retryAfterSeconds: 60,
    });

    const unchanged = await prisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.email).toBe('email-change-request@test.com');
    expect(unchanged.pendingEmail).toBe('email-change-new@test.com');
    expect(getTestOutbox()).toHaveLength(2);
    expect(getTestOutbox().map((mail) => mail.to)).toEqual([
      'email-change-new@test.com',
      'email-change-request@test.com',
    ]);
    expect(getTestOutbox()[1].text).toContain('https://tickets.example.com/cancel-email-change');

    const cancelled = await request(app)
      .delete('/api/users/me/email')
      .set('Authorization', `Bearer ${token}`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data).toEqual({ cancelled: true });
    await expect(
      prisma().user.findUniqueOrThrow({ where: { id: user.id }, select: { pendingEmail: true } }),
    ).resolves.toEqual({ pendingEmail: null });
    await expect(prisma().emailChangeRequest.count({ where: { userId: user.id } })).resolves.toBe(
      0,
    );
  });

  it('atomically verifies the new email and replaces refresh sessions', async () => {
    clearTestOutbox();
    const { token, refreshCookie, user } = await createUserAndGetToken(
      'email-change-verify@test.com',
    );
    await configureEmailChangeMail();

    await request(app)
      .patch('/api/users/me/email')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'email-change-verified@test.com', currentPassword: 'Password123!' });
    const code = getTestOutbox()[0].text.match(/\b\d{6}\b/)?.[0];
    expect(code).toMatch(/^\d{6}$/);

    const invalid = await request(app)
      .post('/api/users/me/email/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '000000' });
    expect(invalid.status).toBe(400);
    expect((await prisma().user.findUniqueOrThrow({ where: { id: user.id } })).email).toBe(
      'email-change-verify@test.com',
    );

    const verified = await request(app)
      .post('/api/users/me/email/verify')
      .set('Authorization', `Bearer ${token}`)
      .send({ code });
    expect(verified.status).toBe(200);
    expect(verified.body.data.email).toBe('email-change-verified@test.com');
    expect(verified.body.data.pendingEmail).toBeNull();
    const staleAccess = await request(app)
      .patch('/api/users/me/notifications')
      .set('Authorization', `Bearer ${token}`)
      .send({ receiveEmailNotifications: false });
    expect(staleAccess.status).toBe(401);
    const replacementCookie = getRefreshCookie(verified.headers['set-cookie']);
    expect(replacementCookie).not.toBe(refreshCookie);

    const persisted = await prisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(persisted.email).toBe('email-change-verified@test.com');
    expect(persisted.pendingEmail).toBeNull();
    await expect(prisma().emailChangeRequest.count({ where: { userId: user.id } })).resolves.toBe(
      0,
    );

    const oldRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', refreshCookie)
      .send({});
    expect(oldRefresh.status).toBe(401);
    const replacementRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', replacementCookie)
      .send({});
    expect(replacementRefresh.status).toBe(200);
  });

  it('allows the old address to cancel a pending email change with its one-time token', async () => {
    clearTestOutbox();
    const { token, user } = await createUserAndGetToken('email-change-cancel@test.com');
    await configureEmailChangeMail();

    await request(app)
      .patch('/api/users/me/email')
      .set('Authorization', `Bearer ${token}`)
      .send({ email: 'email-change-cancelled@test.com', currentPassword: 'Password123!' });
    const oldAddressMail = getTestOutbox().find(
      (mail) => mail.to === 'email-change-cancel@test.com',
    );
    const cancelUrl = oldAddressMail?.text.split('\n').find((line) => line.startsWith('https://'));
    expect(cancelUrl).toBeTruthy();
    const cancelToken = new URL(cancelUrl!).searchParams.get('token');

    const cancelled = await request(app)
      .post('/api/users/email-change/cancel')
      .send({ token: cancelToken });
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.data).toEqual({ cancelled: true });

    const unchanged = await prisma().user.findUniqueOrThrow({ where: { id: user.id } });
    expect(unchanged.email).toBe('email-change-cancel@test.com');
    expect(unchanged.pendingEmail).toBeNull();
    await expect(prisma().emailChangeRequest.count({ where: { userId: user.id } })).resolves.toBe(
      0,
    );

    const reused = await request(app)
      .post('/api/users/email-change/cancel')
      .send({ token: cancelToken });
    expect(reused.status).toBe(400);
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

  it('rejects an old access token immediately after the user is deleted', async () => {
    const controllingAdminToken = await createAdminAndGetToken('delete-controller@test.com');
    const deletedAdminToken = await createAdminAndGetToken('delete-revoked@test.com');
    const deletedAdmin = await prisma().user.findUniqueOrThrow({
      where: { email: 'delete-revoked@test.com' },
    });

    const deletion = await request(app)
      .delete(`/api/users/${deletedAdmin.id}`)
      .set('Authorization', `Bearer ${controllingAdminToken}`);
    expect(deletion.status).toBe(204);

    const staleTokenRequest = await request(app)
      .get('/api/users')
      .set('Authorization', `Bearer ${deletedAdminToken}`);

    expect(staleTokenRequest.status).toBe(401);
    expect(staleTokenRequest.body).toMatchObject({ success: false, statusCode: 401 });
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
