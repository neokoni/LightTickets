import { afterEach, describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma, serverData } from './setup.js';
import { clearTestOutbox, getTestOutbox } from '../src/services/mail.service.js';
import { createUnsubscribeToken } from '../src/services/ticket-notification.service.js';
import * as refreshSessionService from '../src/services/refresh-session.service.js';
import * as rateLimitConfigService from '../src/services/rate-limit-config.service.js';
import crypto from 'crypto';

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

const turnstileConfig = {
  enabled: true,
  siteKey: 'site-key',
  secretKey: 'secret-key',
};
const PASSWORD_RESET_SITE_ORIGIN = 'https://tickets.example.com';

function getRefreshCookie(setCookies: string[] | undefined): string {
  const value = setCookies?.find((item) => item.startsWith('lt_refresh_token='));
  if (!value) throw new Error('refresh cookie missing');
  return value.split(';', 1)[0];
}

function refreshTokenFromCookie(cookie: string): string {
  return decodeURIComponent(cookie.slice(cookie.indexOf('=') + 1));
}

async function configureApp(
  data: Parameters<ReturnType<typeof prisma>['appConfig']['create']>[0]['data'],
  siteUrl?: string | null,
) {
  const status = await prisma().setupStatus.findFirst();
  if (status) {
    await prisma().setupStatus.update({
      where: { id: status.id },
      data: { isSetup: true, ...(siteUrl !== undefined && { siteUrl }) },
    });
  } else {
    await prisma().setupStatus.create({ data: { isSetup: true, siteUrl: siteUrl ?? null } });
  }

  const appConfig = await prisma().appConfig.findFirst();
  if (appConfig) {
    await prisma().appConfig.update({
      where: { id: appConfig.id },
      data,
    });
  } else {
    await prisma().appConfig.create({ data });
  }
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('POST /api/auth/register', () => {
  it('rejects verification-code requests when SMTP is disabled', async () => {
    clearTestOutbox();
    const res = await request(app)
      .post('/api/auth/register/verification-code')
      .send({ email: 'mail-disabled@example.com' });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('邮件服务尚未启用');
    expect(getTestOutbox()).toHaveLength(0);
  });

  it('creates a new user and returns the refresh token only as an HttpOnly cookie', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'test@example.com', password: 'Password123!', username: 'testuser' });

    expect(res.status).toBe(201);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).not.toHaveProperty('refreshToken');
    expect(res.body.data.user.email).toBe('test@example.com');
    expect(res.body.data.user).not.toHaveProperty('passwordHash');

    const cookie = getRefreshCookie(res.headers['set-cookie']);
    expect(res.headers['set-cookie'].join(';')).toContain('HttpOnly');
    const rawToken = refreshTokenFromCookie(cookie);
    expect(rawToken).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const session = await prisma().refreshSession.findFirstOrThrow();
    expect(session.tokenHash).toBe(crypto.createHash('sha256').update(rawToken).digest('hex'));
    expect(session.tokenHash).not.toContain(rawToken);
  });

  it('does not reveal whether the email or username is already registered', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'Password123!', username: 'user1' });

    const duplicateEmail = await request(app)
      .post('/api/auth/register')
      .send({ email: 'dup@example.com', password: 'Password123!', username: 'user2' });
    const duplicateUsername = await request(app)
      .post('/api/auth/register')
      .send({ email: 'other@example.com', password: 'Password123!', username: 'user1' });

    for (const response of [duplicateEmail, duplicateUsername]) {
      expect(response.status).toBe(400);
      expect(response.body).toMatchObject({
        success: false,
        statusCode: 400,
        message: '用户名或邮箱已被使用',
      });
    }
  });

  it('uses the same registration response for an email pending verification', async () => {
    const registration = await request(app).post('/api/auth/register').send({
      email: 'pending-owner@example.com',
      password: 'Password123!',
      username: 'pendingowner',
    });
    const userId = registration.body.data.user.id;
    await prisma().user.update({
      where: { id: userId },
      data: { pendingEmail: 'pending-registration@example.com' },
    });
    await prisma().emailChangeRequest.create({
      data: {
        userId,
        newEmail: 'pending-registration@example.com',
        codeHash: 'pending-code-hash',
        cancelTokenHash: 'pending-cancel-token-hash',
        expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      },
    });

    const response = await request(app).post('/api/auth/register').send({
      email: 'pending-registration@example.com',
      password: 'Password123!',
      username: 'pendingcandidate',
    });

    expect(response.status).toBe(400);
    expect(response.body).toMatchObject({
      success: false,
      statusCode: 400,
      message: '用户名或邮箱已被使用',
    });
  });

  it('requires turnstile token when turnstile is enabled', async () => {
    await configureApp({ turnstileConfig: JSON.stringify(turnstileConfig) });

    const missing = await request(app).post('/api/auth/register').send({
      email: 'turnstile-register@example.com',
      password: 'Password123!',
      username: 'tregister',
    });

    expect(missing.status).toBe(400);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const valid = await request(app).post('/api/auth/register').send({
      email: 'turnstile-register@example.com',
      password: 'Password123!',
      username: 'tregister',
      turnstileToken: 'valid-token',
    });

    expect(valid.status).toBe(201);
    expect(fetchMock).toHaveBeenCalledOnce();
  });

  it('requires and consumes an email verification code when SMTP is enabled', async () => {
    clearTestOutbox();
    await configureApp({ mailConfig: JSON.stringify(mailConfig) });

    const codeResponse = await request(app)
      .post('/api/auth/register/verification-code')
      .send({ email: 'Verify-Register@example.com' });

    expect(codeResponse.status).toBe(200);
    expect(codeResponse.body.data).toEqual({ accepted: true, retryAfterSeconds: 60 });
    expect(getTestOutbox()).toHaveLength(1);
    expect(getTestOutbox()[0].to).toBe('verify-register@example.com');
    expect(getTestOutbox()[0].subject).toBe('你的 LightTickets 注册验证码');
    const code = getTestOutbox()[0].text.match(/\b\d{6}\b/)?.[0];
    expect(code).toMatch(/^\d{6}$/);

    const missing = await request(app).post('/api/auth/register').send({
      email: 'verify-register@example.com',
      password: 'Password123!',
      username: 'verifyregister',
    });
    expect(missing.status).toBe(400);
    expect(missing.body.message).toBe('请输入邮箱验证码');

    const invalid = await request(app).post('/api/auth/register').send({
      email: 'verify-register@example.com',
      password: 'Password123!',
      username: 'verifyregister',
      emailVerificationCode: '000000',
    });
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toBe('邮箱验证码错误或已失效，请重新获取');

    const valid = await request(app).post('/api/auth/register').send({
      email: 'Verify-Register@example.com',
      password: 'Password123!',
      username: 'verifyregister',
      emailVerificationCode: code,
    });
    expect(valid.status).toBe(201);
    expect(valid.body.data.user.email).toBe('verify-register@example.com');
    await expect(prisma().registrationEmailVerification.count()).resolves.toBe(0);
  });

  it('does not reveal registered or pending email addresses through verification requests', async () => {
    clearTestOutbox();
    await configureApp({ mailConfig: JSON.stringify(mailConfig) });
    await prisma().user.create({
      data: {
        email: 'registered@example.com',
        username: 'registered-user',
        passwordHash: 'hash',
      },
    });
    const changingUser = await prisma().user.create({
      data: {
        email: 'changing@example.com',
        pendingEmail: 'pending@example.com',
        username: 'changing-user',
        passwordHash: 'hash',
      },
    });
    await prisma().emailChangeRequest.create({
      data: {
        userId: changingUser.id,
        newEmail: 'pending@example.com',
        codeHash: 'code-hash',
        cancelTokenHash: 'cancel-token-hash',
        expiresAt: new Date(Date.now() + 60_000),
      },
    });

    const available = await request(app)
      .post('/api/auth/register/verification-code')
      .send({ email: 'available@example.com' });
    const registered = await request(app)
      .post('/api/auth/register/verification-code')
      .send({ email: 'registered@example.com' });
    const pending = await request(app)
      .post('/api/auth/register/verification-code')
      .send({ email: 'pending@example.com' });

    expect(available.status).toBe(200);
    expect(registered.status).toBe(200);
    expect(pending.status).toBe(200);
    expect(registered.body.data).toEqual(available.body.data);
    expect(pending.body.data).toEqual(available.body.data);
    expect(getTestOutbox()).toHaveLength(1);
    expect(getTestOutbox()[0].to).toBe('available@example.com');
    await expect(
      prisma().registrationEmailVerification.findUnique({
        where: { email: 'registered@example.com' },
      }),
    ).resolves.toBeNull();
    await expect(
      prisma().registrationEmailVerification.findUnique({
        where: { email: 'pending@example.com' },
      }),
    ).resolves.toBeNull();
  });

  it('limits registration verification emails to once per minute per address', async () => {
    clearTestOutbox();
    await configureApp({ mailConfig: JSON.stringify(mailConfig) });

    const first = await request(app)
      .post('/api/auth/register/verification-code')
      .send({ email: 'rate-limit@example.com' });
    const second = await request(app)
      .post('/api/auth/register/verification-code')
      .send({ email: 'RATE-LIMIT@example.com' });

    expect(first.status).toBe(200);
    expect(second.status).toBe(429);
    expect(second.body.message).toBe('验证码发送过于频繁，请稍后再试');
    expect(getTestOutbox()).toHaveLength(1);
  });

  it('uses the configured registration email cooldown', async () => {
    clearTestOutbox();
    await configureApp({
      mailConfig: JSON.stringify(mailConfig),
      rateLimitConfig: JSON.stringify({
        email: { cooldownSeconds: 120 },
      }),
    });

    const first = await request(app)
      .post('/api/auth/register/verification-code')
      .send({ email: 'configured-rate-limit@example.com' });
    const second = await request(app)
      .post('/api/auth/register/verification-code')
      .send({ email: 'configured-rate-limit@example.com' });

    expect(first.status).toBe(200);
    expect(first.body.data.retryAfterSeconds).toBe(120);
    expect(second.status).toBe(429);
  });

  it('rejects a registration code after five failed attempts', async () => {
    clearTestOutbox();
    await configureApp({ mailConfig: JSON.stringify(mailConfig) });
    await request(app)
      .post('/api/auth/register/verification-code')
      .send({ email: 'attempt-limit@example.com' });
    const code = getTestOutbox()[0].text.match(/\b\d{6}\b/)?.[0];

    for (let attempt = 0; attempt < 5; attempt += 1) {
      const invalid = await request(app).post('/api/auth/register').send({
        email: 'attempt-limit@example.com',
        password: 'Password123!',
        username: 'attemptlimit',
        emailVerificationCode: '000000',
      });
      expect(invalid.status).toBe(400);
    }

    const locked = await request(app).post('/api/auth/register').send({
      email: 'attempt-limit@example.com',
      password: 'Password123!',
      username: 'attemptlimit',
      emailVerificationCode: code,
    });
    expect(locked.status).toBe(400);
    expect(locked.body.message).toBe('邮箱验证码错误或已失效，请重新获取');
  });

  it('requires turnstile before sending a registration verification email', async () => {
    clearTestOutbox();
    await configureApp({
      mailConfig: JSON.stringify(mailConfig),
      turnstileConfig: JSON.stringify(turnstileConfig),
    });

    const missing = await request(app)
      .post('/api/auth/register/verification-code')
      .send({ email: 'turnstile-code@example.com' });
    expect(missing.status).toBe(400);
    expect(getTestOutbox()).toHaveLength(0);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);
    const valid = await request(app).post('/api/auth/register/verification-code').send({
      email: 'turnstile-code@example.com',
      turnstileToken: 'valid-token',
    });

    expect(valid.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    expect(getTestOutbox()).toHaveLength(1);
  });
});

describe('POST /api/auth/login', () => {
  it('rate limits password verification with the configured per-IP quota', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    await rateLimitConfigService.updateRateLimitConfig({
      auth: { windowSeconds: 120, maxRequests: 1 },
      loginPassword: { enabled: true, windowSeconds: 120, maxRequests: 2 },
    });

    const attempt = () =>
      request(app)
        .post('/api/auth/login')
        .send({ emailOrUsername: 'login-limit-missing', password: 'wrong-password' });

    expect((await attempt()).status).toBe(401);
    expect((await attempt()).status).toBe(401);
    const limited = await attempt();
    expect(limited.status).toBe(429);
    expect(limited.headers['ratelimit-policy']).toBe('2;w=120');
  });

  it('does not apply the login password quota when the setting is disabled', async () => {
    vi.stubEnv('NODE_ENV', 'production');
    vi.stubEnv('VITEST', '');
    await rateLimitConfigService.updateRateLimitConfig({
      auth: { windowSeconds: 60, maxRequests: 1 },
      loginPassword: { enabled: false, windowSeconds: 60, maxRequests: 1 },
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      const response = await request(app)
        .post('/api/auth/login')
        .send({ emailOrUsername: 'login-limit-disabled-missing', password: 'wrong-password' });
      expect(response.status).toBe(401);
    }
  });

  it('returns tokens for valid email credentials', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'login@example.com', password: 'Password123!', username: 'loginuser' });

    const res = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'login@example.com', password: 'Password123!' });

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).not.toHaveProperty('refreshToken');
    expect(getRefreshCookie(res.headers['set-cookie'])).toBeTruthy();
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

  it('requires turnstile token when turnstile is enabled', async () => {
    await request(app)
      .post('/api/auth/register')
      .send({ email: 'turnstile-login@example.com', password: 'Password123!', username: 'tlogin' });
    await configureApp({ turnstileConfig: JSON.stringify(turnstileConfig) });

    const missing = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'turnstile-login@example.com', password: 'Password123!' });

    expect(missing.status).toBe(400);

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ success: true }),
    });
    vi.stubGlobal('fetch', fetchMock);

    const valid = await request(app).post('/api/auth/login').send({
      emailOrUsername: 'turnstile-login@example.com',
      password: 'Password123!',
      turnstileToken: 'valid-token',
    });

    expect(valid.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledOnce();
    const requestBody = fetchMock.mock.calls[0]?.[1]?.body;
    expect(requestBody).toBeInstanceOf(URLSearchParams);
    expect((requestBody as URLSearchParams).get('idempotency_key')).toMatch(/^[0-9a-f-]{36}$/);
  });

  it('retries a transient turnstile validation failure with the same idempotency key', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'turnstile-retry@example.com',
      password: 'Password123!',
      username: 'tretry',
    });
    await configureApp({ turnstileConfig: JSON.stringify(turnstileConfig) });

    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error('temporary network failure'))
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true }),
      });
    vi.stubGlobal('fetch', fetchMock);

    const res = await request(app).post('/api/auth/login').send({
      emailOrUsername: 'turnstile-retry@example.com',
      password: 'Password123!',
      turnstileToken: 'retry-token',
    });

    expect(res.status).toBe(200);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const firstBody = fetchMock.mock.calls[0]?.[1]?.body as URLSearchParams;
    const secondBody = fetchMock.mock.calls[1]?.[1]?.body as URLSearchParams;
    expect(firstBody.get('idempotency_key')).toBe(secondBody.get('idempotency_key'));
  });

  it('returns a standard service-unavailable response when turnstile cannot be reached', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'turnstile-unavailable@example.com',
      password: 'Password123!',
      username: 'tunavailable',
    });
    await configureApp({ turnstileConfig: JSON.stringify(turnstileConfig) });
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network unavailable')));

    const res = await request(app).post('/api/auth/login').send({
      emailOrUsername: 'turnstile-unavailable@example.com',
      password: 'Password123!',
      turnstileToken: 'unavailable-token',
    });

    expect(res.status).toBe(503);
    expect(res.body).toEqual({
      success: false,
      statusCode: 503,
      message: '人机验证服务暂时不可用，请稍后重试',
    });
  });

  it('asks for a new challenge when the turnstile token has expired', async () => {
    await request(app).post('/api/auth/register').send({
      email: 'turnstile-expired@example.com',
      password: 'Password123!',
      username: 'texpired',
    });
    await configureApp({ turnstileConfig: JSON.stringify(turnstileConfig) });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: false, 'error-codes': ['timeout-or-duplicate'] }),
      }),
    );

    const res = await request(app).post('/api/auth/login').send({
      emailOrUsername: 'turnstile-expired@example.com',
      password: 'Password123!',
      turnstileToken: 'expired-token',
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('人机验证已过期或无效，请重新验证');
  });
});

describe('POST /api/auth/refresh', () => {
  it('rotates a cookie token once and detects reuse of the old token', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'refresh@example.com', password: 'Password123!', username: 'refreshuser' });

    const oldCookie = getRefreshCookie(reg.headers['set-cookie']);
    const res = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie).send({});

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).not.toHaveProperty('refreshToken');
    const newCookie = getRefreshCookie(res.headers['set-cookie']);
    expect(newCookie).not.toBe(oldCookie);

    const authenticated = await request(app)
      .patch('/api/users/me/notifications')
      .set('Authorization', `Bearer ${res.body.data.accessToken}`)
      .send({ receiveEmailNotifications: false });
    expect(authenticated.status).toBe(200);

    const reuse = await request(app).post('/api/auth/refresh').set('Cookie', oldCookie).send({});
    expect(reuse.status).toBe(401);

    const revokedFamily = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', newCookie)
      .send({});
    expect(revokedFamily.status).toBe(401);
  });

  it('does not accept refresh tokens from the request body', async () => {
    const reg = await request(app).post('/api/auth/register').send({
      email: 'refresh-boundary@example.com',
      password: 'Password123!',
      username: 'refreshboundary',
    });
    const unsubscribeToken = createUnsubscribeToken(reg.body.data.user.id);

    for (const wrongToken of [reg.body.data.accessToken, unsubscribeToken]) {
      const res = await request(app).post('/api/auth/refresh').send({ refreshToken: wrongToken });
      expect(res.status).toBe(400);
      expect(res.body).toMatchObject({ success: false, statusCode: 400 });
    }
  });

  it('idempotently clears and revokes the cookie session without a valid access token', async () => {
    const login = await request(app).post('/api/auth/register').send({
      email: 'logout@example.com',
      password: 'Password123!',
      username: 'logoutuser',
    });
    const cookie = getRefreshCookie(login.headers['set-cookie']);

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Authorization', 'Bearer expired-or-invalid')
      .set('Cookie', cookie);
    expect(logout.status).toBe(204);
    expect(logout.headers['set-cookie']?.join(';')).toContain('lt_refresh_token=;');

    const refresh = await request(app).post('/api/auth/refresh').set('Cookie', cookie).send({});
    expect(refresh.status).toBe(401);

    const repeated = await request(app).post('/api/auth/logout').set('Cookie', cookie);
    expect(repeated.status).toBe(204);
    expect(repeated.headers['set-cookie']?.join(';')).toContain('lt_refresh_token=;');
  });

  it('clears the refresh cookie even when server-side revocation fails', async () => {
    const revoke = vi
      .spyOn(refreshSessionService, 'revokeRefreshSession')
      .mockRejectedValueOnce(new Error('simulated database failure'));

    const logout = await request(app)
      .post('/api/auth/logout')
      .set('Cookie', 'lt_refresh_token=unrevoked-token');

    expect(logout.status).toBe(500);
    expect(logout.headers['set-cookie']?.join(';')).toContain('lt_refresh_token=;');
    expect(revoke).toHaveBeenCalledWith('unrevoked-token');
  });
});

describe('POST /api/auth/password-reset', () => {
  it('sends a reset email and accepts the token once', async () => {
    clearTestOutbox();
    const registration = await request(app)
      .post('/api/auth/register')
      .send({ email: 'reset@example.com', password: 'Password123!', username: 'resetuser' });
    const oldRefreshCookie = getRefreshCookie(registration.headers['set-cookie']);
    const oldAccessToken = registration.body.data.accessToken;
    await configureApp({ mailConfig: JSON.stringify(mailConfig) }, PASSWORD_RESET_SITE_ORIGIN);

    const requestRes = await request(app)
      .post('/api/auth/password-reset/request')
      .set('Origin', 'http://localhost:5173')
      .set('Referer', 'https://referer-attacker.example/reset')
      .set('Host', 'host-attacker.example')
      .set('Forwarded', 'host=forwarded-attacker.example;proto=https')
      .set('X-Forwarded-Host', 'reset-capture.example.invalid')
      .set('X-Forwarded-Proto', 'https')
      .send({ emailOrUsername: 'resetuser' });

    expect(requestRes.status).toBe(200);
    expect(requestRes.body.data.accepted).toBe(true);
    expect(getTestOutbox()).toHaveLength(1);
    expect(getTestOutbox()[0].to).toBe('reset@example.com');
    expect(getTestOutbox()[0].subject).toBe('重置你的 LightTickets 密码');
    expect(getTestOutbox()[0].text).toContain('你好，resetuser');
    expect(getTestOutbox()[0].text).not.toContain('mail.passwordReset.');
    expect(getTestOutbox()[0].html).toContain('border-radius:12px');

    const resetUrlValue = getTestOutbox()[0]
      .text.split('\n')
      .find((line) => line.includes('/reset-password?token='));
    expect(resetUrlValue).toBeTruthy();
    const resetUrl = new URL(resetUrlValue!);
    expect(resetUrl.origin).toBe(PASSWORD_RESET_SITE_ORIGIN);
    expect(resetUrl.pathname).toBe('/reset-password');
    expect([...resetUrl.searchParams.keys()]).toEqual(['token']);
    expect(resetUrl.searchParams.get('token')).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(getTestOutbox()[0].text).not.toContain('attacker');
    expect(getTestOutbox()[0].text).not.toContain('reset-capture.example.invalid');
    const token = resetUrl.searchParams.get('token')!;

    const resetRes = await request(app)
      .post('/api/auth/password-reset/confirm')
      .send({ token, password: 'NewPassword123!' });

    expect(resetRes.status).toBe(200);
    expect(resetRes.body.data.reset).toBe(true);

    const staleAccess = await request(app)
      .patch('/api/users/me/notifications')
      .set('Authorization', `Bearer ${oldAccessToken}`)
      .send({ receiveEmailNotifications: false });
    expect(staleAccess.status).toBe(401);

    const oldRefresh = await request(app)
      .post('/api/auth/refresh')
      .set('Cookie', oldRefreshCookie)
      .send({});
    expect(oldRefresh.status).toBe(401);

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

  it('fails closed without a configured HTTPS site URL', async () => {
    clearTestOutbox();
    await request(app).post('/api/auth/register').send({
      email: 'unsafe-origin-reset@example.com',
      password: 'Password123!',
      username: 'unsafeoriginreset',
    });
    await configureApp({ mailConfig: JSON.stringify(mailConfig) }, null);

    const res = await request(app)
      .post('/api/auth/password-reset/request')
      .set('X-Forwarded-Host', 'reset-capture.example.invalid')
      .set('X-Forwarded-Proto', 'https')
      .send({ emailOrUsername: 'unsafeoriginreset' });
    const missing = await request(app)
      .post('/api/auth/password-reset/request')
      .set('X-Forwarded-Host', 'reset-capture.example.invalid')
      .set('X-Forwarded-Proto', 'https')
      .send({ emailOrUsername: 'missing-unsafe-origin-user' });

    expect(res.status).toBe(400);
    expect(res.body).toMatchObject({ success: false, statusCode: 400 });
    expect(res.body.message).toContain('HTTPS origin');
    expect(missing.status).toBe(res.status);
    expect(missing.body.message).toBe(res.body.message);
    expect(getTestOutbox()).toHaveLength(0);
    await expect(prisma().passwordResetToken.count()).resolves.toBe(0);
  });

  it('fails closed for an unsafe legacy site URL stored in the database', async () => {
    clearTestOutbox();
    await request(app).post('/api/auth/register').send({
      email: 'legacy-http-reset@example.com',
      password: 'Password123!',
      username: 'legacyhttpreset',
    });
    await configureApp({ mailConfig: JSON.stringify(mailConfig) }, 'http://tickets.example.com');

    const res = await request(app)
      .post('/api/auth/password-reset/request')
      .set('Host', 'host-attacker.example')
      .send({ emailOrUsername: 'legacyhttpreset' });

    expect(res.status).toBe(400);
    expect(getTestOutbox()).toHaveLength(0);
    await expect(prisma().passwordResetToken.count()).resolves.toBe(0);
  });

  it('does not send email for unknown accounts', async () => {
    clearTestOutbox();
    await configureApp({ mailConfig: JSON.stringify(mailConfig) }, PASSWORD_RESET_SITE_ORIGIN);

    const res = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'missinguser' });

    expect(res.status).toBe(200);
    expect(res.body.data.accepted).toBe(true);
    expect(getTestOutbox()).toHaveLength(0);
    await expect(prisma().passwordResetToken.count()).resolves.toBe(0);
  });

  it('requires turnstile token before sending reset email when turnstile is enabled', async () => {
    clearTestOutbox();
    await request(app).post('/api/auth/register').send({
      email: 'turnstile-reset@example.com',
      password: 'Password123!',
      username: 'turnstilereset',
    });
    await configureApp(
      {
        mailConfig: JSON.stringify(mailConfig),
        turnstileConfig: JSON.stringify(turnstileConfig),
      },
      PASSWORD_RESET_SITE_ORIGIN,
    );

    const missing = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'turnstilereset' });

    expect(missing.status).toBe(400);
    expect(getTestOutbox()).toHaveLength(0);

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({ success: true }),
      }),
    );

    const valid = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'turnstilereset', turnstileToken: 'valid-token' });

    expect(valid.status).toBe(200);
    expect(getTestOutbox()).toHaveLength(1);
  });

  it('returns the same cooldown response for existing and missing accounts', async () => {
    clearTestOutbox();
    await request(app).post('/api/auth/register').send({
      email: 'limited-reset@example.com',
      password: 'Password123!',
      username: 'limitedreset',
    });
    await configureApp({ mailConfig: JSON.stringify(mailConfig) }, PASSWORD_RESET_SITE_ORIGIN);

    const first = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'limitedreset' });
    const second = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'limited-reset@example.com' });
    const missing = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'limited-reset-missing' });
    const missingAgain = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'LIMITED-RESET-MISSING' });

    expect(first.status).toBe(200);
    expect(missing.status).toBe(200);
    expect(second.status).toBe(429);
    expect(missingAgain.status).toBe(429);
    expect(second.body).toEqual(missingAgain.body);
    expect(getTestOutbox()).toHaveLength(1);
    await expect(prisma().passwordResetToken.count()).resolves.toBe(1);
  });

  it('uses the configured password reset email cooldown', async () => {
    clearTestOutbox();
    await request(app).post('/api/auth/register').send({
      email: 'configured-reset-limit@example.com',
      password: 'Password123!',
      username: 'configuredresetlimit',
    });
    await configureApp(
      {
        mailConfig: JSON.stringify(mailConfig),
        rateLimitConfig: JSON.stringify({
          email: { cooldownSeconds: 120 },
        }),
      },
      PASSWORD_RESET_SITE_ORIGIN,
    );

    const first = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'configuredresetlimit' });
    const token = await prisma().passwordResetToken.findFirst();
    await prisma().passwordResetToken.update({
      where: { id: token!.id },
      data: { createdAt: new Date(Date.now() - 90_000) },
    });
    const second = await request(app)
      .post('/api/auth/password-reset/request')
      .send({ emailOrUsername: 'configuredresetlimit' });

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
    const serverKey = 'link-srv-key';
    await prisma().server.create({
      data: serverData('link-srv', serverKey),
    });
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'linkmc@test.com', password: 'Password123!', username: 'linkmc' });

    const code = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', serverKey)
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440030', minecraftName: 'Linker' });

    const res = await request(app)
      .post('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`)
      .send({ code: code.body.data.code });

    expect(res.status).toBe(200);
    expect(res.body.data.uuid).toBe('550e8400-e29b-41d4-a716-446655440030');
    expect(res.body.data.name).toBe('Linker');

    const session = await request(app).post('/api/mc/session').set('X-Server-Key', serverKey).send({
      minecraftUuid: '550e8400-e29b-41d4-a716-446655440030',
      playerCredential: code.body.data.playerCredential,
    });
    expect(session.status).toBe(201);
  });

  it('rejects link codes that are not exactly six digits', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'link-format@test.com', password: 'Password123!', username: 'linkformat' });

    const res = await request(app)
      .post('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${reg.body.data.accessToken}`)
      .send({ code: '12345' });

    expect(res.status).toBe(400);
  });

  it('locks binding attempts after five invalid codes', async () => {
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'link-lock@test.com', password: 'Password123!', username: 'linklock' });
    const token = reg.body.data.accessToken;

    for (let attempt = 1; attempt <= 5; attempt += 1) {
      const res = await request(app)
        .post('/api/auth/link-minecraft')
        .set('Authorization', `Bearer ${token}`)
        .send({ code: '000000' });

      expect(res.status).toBe(400);
    }

    const user = await prisma().user.findUniqueOrThrow({ where: { username: 'linklock' } });
    expect(user.minecraftLinkFailedAttempts).toBe(5);
    expect(user.minecraftLinkLockedUntil).not.toBeNull();

    const blocked = await request(app)
      .post('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: '111111' });
    expect(blocked.status).toBe(400);
    expect(blocked.body.message).toBe('绑定尝试次数过多，请稍后再试');
  });

  it('uses the platform-configured binding attempt policy', async () => {
    await configureApp({
      rateLimitConfig: JSON.stringify({
        minecraftLink: { maxAttempts: 2, lockSeconds: 30 },
      }),
    });
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'link-policy@test.com', password: 'Password123!', username: 'linkpolicy' });

    for (let attempt = 0; attempt < 2; attempt += 1) {
      await request(app)
        .post('/api/auth/link-minecraft')
        .set('Authorization', `Bearer ${reg.body.data.accessToken}`)
        .send({ code: '000000' });
    }

    const user = await prisma().user.findUniqueOrThrow({ where: { username: 'linkpolicy' } });
    expect(user.minecraftLinkFailedAttempts).toBe(2);
    expect(user.minecraftLinkLockedUntil).not.toBeNull();
    expect(user.minecraftLinkLockedUntil!.getTime() - Date.now()).toBeGreaterThan(28_000);
  });
});

describe('DELETE /api/auth/link-minecraft', () => {
  it('unbinds the current user minecraft account', async () => {
    const serverKey = 'unlink-srv-key';
    await prisma().server.create({
      data: serverData('unlink-srv', serverKey),
    });
    const reg = await request(app)
      .post('/api/auth/register')
      .send({ email: 'unlinkmc@test.com', password: 'Password123!', username: 'unlinkmc' });

    const code = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', serverKey)
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
    expect(
      await prisma().minecraftPlayerCredential.findUnique({ where: { userId: dbUser!.id } }),
    ).toBeNull();
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
