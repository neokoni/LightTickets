import bcrypt from 'bcrypt';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';
import { generateTokens } from '../src/utils/token.js';
import { encryptFederatedAuth } from '../src/services/federatedauth-crypto.service.js';

const app = createApp();
const callback = 'http://localhost/api/auth/federatedauth/example/callback';

function cookie(headers: string[] | undefined, name: string): string {
  const value = headers?.find((entry) => entry.startsWith(`${name}=`));
  if (!value) throw new Error(`Missing cookie ${name}`);
  return value.split(';')[0];
}

async function createProvider(overrides: Record<string, unknown> = {}) {
  return prisma().federatedAuthProvider.create({
    data: {
      slug: 'example',
      name: 'Example',
      protocol: 'oauth',
      authorizationEndpoint: 'https://id.example.com/authorize',
      tokenEndpoint: 'https://id.example.com/token',
      userInfoEndpoint: 'https://id.example.com/user',
      redirectUri: callback,
      clientId: 'client-id',
      clientSecretEncrypted: encryptFederatedAuth('client-secret'),
      scope: 'profile email',
      subjectPath: 'data.id',
      usernamePath: 'data.username',
      emailPath: 'data.email',
      avatarPath: 'data.avatar',
      authorizationParams: JSON.stringify({ audience: 'tickets' }),
      pkce: true,
      secretMode: 'basic',
      accessTokenPath: 'access_token',
      enabled: true,
      allowRegistration: true,
      ...overrides,
    },
  });
}

async function start(slug = 'example', token?: string) {
  const call = request(app).post(`/api/auth/federatedauth/${slug}/start`);
  if (token) call.set('Authorization', `Bearer ${token}`);
  const response = await call.send({ returnTo: '/profile' });
  const authorizationUrl = new URL(response.body.data.authorizationUrl);
  return {
    response,
    authorizationUrl,
    flowCookie: cookie(response.headers['set-cookie'], 'lt_federatedauth_flow'),
  };
}

function mockProvider(subject = 'provider-user') {
  const fetchMock = vi
    .fn<typeof fetch>()
    .mockResolvedValueOnce(
      new Response(JSON.stringify({ access_token: 'access-token' }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    )
    .mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          data: {
            id: subject,
            username: 'provider-name',
            email: 'provider@example.com',
            avatar: 'https://id.example.com/avatar.png',
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      ),
    );
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

async function callbackRequest(authorizationUrl: URL, flowCookie: string) {
  return request(app)
    .get(
      `/api/auth/federatedauth/example/callback?code=code&state=${encodeURIComponent(
        authorizationUrl.searchParams.get('state')!,
      )}`,
    )
    .set('Cookie', flowCookie);
}

beforeEach(async () => {
  await prisma().setupStatus.create({
    data: { isSetup: true, siteUrl: 'http://localhost', allowWebRegister: true },
  });
  await prisma().appConfig.create({ data: {} });
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('FederatedAuth OAuth login', () => {
  it('rejects cross-origin return paths', async () => {
    await createProvider();
    const response = await request(app)
      .post('/api/auth/federatedauth/example/start')
      .send({ returnTo: '/\\attacker.example/path' });
    expect(response.status).toBe(200);
    const flow = await prisma().federatedAuthFlow.findFirstOrThrow();
    expect(flow.returnTo).toBe('/');
  });

  it('uses state, PKCE, custom paths and logs in only an explicitly bound identity', async () => {
    const provider = await createProvider();
    const user = await prisma().user.create({
      data: {
        email: 'local@example.com',
        username: 'local',
        passwordHash: await bcrypt.hash('Password123!', 12),
      },
    });
    await prisma().federatedAuthIdentity.create({
      data: { userId: user.id, providerId: provider.id, subject: 'provider-user' },
    });
    const fetchMock = mockProvider();
    const started = await start();

    expect(started.response.status).toBe(200);
    expect(started.authorizationUrl.searchParams.get('audience')).toBe('tickets');
    expect(started.authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');
    expect(started.authorizationUrl.searchParams.get('state')).toBeTruthy();

    const completed = await callbackRequest(started.authorizationUrl, started.flowCookie);
    expect(completed.status).toBe(303);
    expect(completed.headers.location).toBe(
      'http://localhost/federatedauth/complete?returnTo=%2Fprofile',
    );
    expect(cookie(completed.headers['set-cookie'], 'lt_refresh_token')).toBeTruthy();
    const tokenCall = fetchMock.mock.calls[0];
    expect((tokenCall[1]?.headers as Record<string, string>).Authorization).toMatch(/^Basic /);

    const identity = await prisma().federatedAuthIdentity.findFirstOrThrow();
    expect(identity.usernameHint).toBe('provider-name');
    expect(identity.emailHint).toBe('provider@example.com');
    expect(identity.lastLoginAt).not.toBeNull();
  });

  it('exposes non-standard OAuth behavior only through advanced settings', async () => {
    const provider = await createProvider({
      pkce: false,
      secretMode: 'bcrypt',
      accessTokenPath: 'data.access_token',
    });
    const user = await prisma().user.create({
      data: {
        email: 'bcrypt@example.com',
        username: 'bcrypt-user',
        passwordHash: await bcrypt.hash('Password123!', 12),
      },
    });
    await prisma().federatedAuthIdentity.create({
      data: { userId: user.id, providerId: provider.id, subject: 'provider-user' },
    });
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockImplementationOnce(async (_url, init) => {
        const body = new URLSearchParams(String(init?.body));
        const hash = body.get('client_secret')!.replace(/^\$2y\$/, '$2b$');
        expect(await bcrypt.compare('client-secret', hash)).toBe(true);
        expect(body.has('code_verifier')).toBe(false);
        return new Response(JSON.stringify({ data: { access_token: 'nested-token' } }), {
          status: 200,
        });
      })
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ data: { id: 'provider-user' } }), { status: 200 }),
      );
    vi.stubGlobal('fetch', fetchMock);

    const started = await start();
    expect(started.authorizationUrl.searchParams.has('code_challenge')).toBe(false);
    const completed = await callbackRequest(started.authorizationUrl, started.flowCookie);
    expect(completed.status).toBe(303);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('FederatedAuth registration and binding', () => {
  it('requires a full local account and creates the account and binding atomically', async () => {
    await createProvider();
    mockProvider('new-subject');
    const started = await start();
    const completed = await callbackRequest(started.authorizationUrl, started.flowCookie);
    expect(completed.headers.location).toBe('http://localhost/federatedauth/register');
    const registrationCookie = cookie(
      completed.headers['set-cookie'],
      'lt_federatedauth_registration',
    );

    const session = await request(app)
      .get('/api/auth/federatedauth/registration/session')
      .set('Cookie', registrationCookie);
    expect(session.status).toBe(200);
    expect(session.body.data.usernameHint).toBe('provider-name');

    const registered = await request(app)
      .post('/api/auth/federatedauth/registration/complete')
      .set('Cookie', registrationCookie)
      .send({
        email: 'chosen@example.com',
        username: 'chosen-name',
        password: 'Password123!',
      });
    expect(registered.status).toBe(201);
    expect(registered.body.data.user.email).toBe('chosen@example.com');
    expect(registered.body.data.user).not.toHaveProperty('passwordHash');
    const identity = await prisma().federatedAuthIdentity.findFirstOrThrow();
    expect(identity.subject).toBe('new-subject');
  });

  it('never uses Provider email to bind an existing local account', async () => {
    await createProvider();
    await prisma().user.create({
      data: {
        email: 'provider@example.com',
        username: 'existing',
        passwordHash: await bcrypt.hash('Password123!', 12),
      },
    });
    mockProvider('unbound-subject');
    const started = await start();
    const completed = await callbackRequest(started.authorizationUrl, started.flowCookie);
    const registrationCookie = cookie(
      completed.headers['set-cookie'],
      'lt_federatedauth_registration',
    );
    const rejected = await request(app)
      .post('/api/auth/federatedauth/registration/complete')
      .set('Cookie', registrationCookie)
      .send({
        email: 'provider@example.com',
        username: 'another',
        password: 'Password123!',
      });
    expect(rejected.status).toBe(409);
    await expect(prisma().federatedAuthIdentity.count()).resolves.toBe(0);
  });

  it('allows an authenticated local account to explicitly bind and unlink', async () => {
    await createProvider();
    const user = await prisma().user.create({
      data: {
        email: 'bind@example.com',
        username: 'bind-user',
        passwordHash: await bcrypt.hash('Password123!', 12),
      },
    });
    const accessToken = generateTokens(user.id, user.role).accessToken;
    mockProvider('linked-subject');
    const startedResponse = await request(app)
      .post('/api/users/me/federatedauth/example/start')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ returnTo: '/profile' });
    const authorizationUrl = new URL(startedResponse.body.data.authorizationUrl);
    const flowCookie = cookie(startedResponse.headers['set-cookie'], 'lt_federatedauth_flow');
    const completed = await callbackRequest(authorizationUrl, flowCookie);
    expect(completed.status).toBe(303);

    const listed = await request(app)
      .get('/api/users/me/federatedauth')
      .set('Authorization', `Bearer ${accessToken}`);
    expect(listed.body.data).toHaveLength(1);
    const identityId = listed.body.data[0].id;
    expect(JSON.stringify(listed.body.data)).not.toContain('linked-subject');

    const wrongPassword = await request(app)
      .delete(`/api/users/me/federatedauth/${identityId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'wrong' });
    expect(wrongPassword.status).toBe(400);

    const removed = await request(app)
      .delete(`/api/users/me/federatedauth/${identityId}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ currentPassword: 'Password123!' });
    expect(removed.status).toBe(204);
  });
});

describe('FederatedAuth Provider administration', () => {
  it('validates and stores Provider secrets without exposing them', async () => {
    const admin = await prisma().user.create({
      data: {
        email: 'admin@example.com',
        username: 'admin',
        passwordHash: await bcrypt.hash('Password123!', 12),
        role: 'admin',
      },
    });
    const accessToken = generateTokens(admin.id, admin.role).accessToken;
    const providerPayload = {
      slug: 'managed',
      name: 'Managed Provider',
      iconUrl: null,
      protocol: 'oauth',
      issuer: null,
      authorizationEndpoint: 'https://managed.example.com/authorize',
      tokenEndpoint: 'https://managed.example.com/token',
      userInfoEndpoint: 'https://managed.example.com/user',
      redirectUri: 'https://tickets.example.com/api/auth/federatedauth/managed/callback',
      clientId: 'managed-client',
      clientSecret: 'managed-secret',
      scope: 'profile',
      subjectPath: 'data.id',
      usernamePath: 'data.name',
      emailPath: 'data.email',
      avatarPath: null,
      authorizationParams: { audience: 'tickets' },
      pkce: true,
      secretMode: 'post',
      accessTokenPath: 'data.access_token',
      enabled: true,
      allowRegistration: false,
    };

    const invalid = await request(app)
      .post('/api/admin/federatedauth/providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ ...providerPayload, tokenEndpoint: 'not-a-url' });
    expect(invalid.status).toBe(400);
    expect(invalid.body.message).toContain('HTTP(S) URL');

    const created = await request(app)
      .post('/api/admin/federatedauth/providers')
      .set('Authorization', `Bearer ${accessToken}`)
      .send(providerPayload);
    expect(created.status).toBe(201);
    expect(created.body.data.clientSecretSet).toBe(true);
    expect(JSON.stringify(created.body.data)).not.toContain('managed-secret');
    expect(JSON.stringify(created.body.data)).not.toContain('clientSecretEncrypted');

    const siteConfig = await request(app).get('/api/setup/site-config');
    expect(siteConfig.body.data.federatedAuthProviders).toEqual([
      {
        slug: 'managed',
        name: 'Managed Provider',
        iconUrl: null,
        allowRegistration: false,
      },
    ]);
    expect(JSON.stringify(siteConfig.body.data)).not.toContain('managed-client');

    const updated = await request(app)
      .patch(`/api/admin/federatedauth/providers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`)
      .send({ name: 'Updated Provider', accessTokenPath: 'access_token' });
    expect(updated.status).toBe(200);
    expect(updated.body.data.name).toBe('Updated Provider');
    expect(updated.body.data.clientSecretSet).toBe(true);

    const tested = await request(app)
      .post(`/api/admin/federatedauth/providers/${created.body.data.id}/test`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(tested.status).toBe(200);
    expect(tested.body.data.reachable).toBe(true);

    await prisma().federatedAuthProvider.update({
      where: { id: created.body.data.id },
      data: { authorizationEndpoint: 'not-a-url' },
    });
    const invalidTest = await request(app)
      .post(`/api/admin/federatedauth/providers/${created.body.data.id}/test`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(invalidTest.status).toBe(400);
    expect(invalidTest.body.message).toContain('HTTP(S) URL');

    const linkedUser = await prisma().user.create({
      data: {
        email: 'linked@example.com',
        username: 'linked-user',
        passwordHash: await bcrypt.hash('Password123!', 12),
      },
    });
    await prisma().federatedAuthIdentity.create({
      data: {
        userId: linkedUser.id,
        providerId: created.body.data.id,
        subject: 'managed-subject',
      },
    });

    const blocked = await request(app)
      .delete(`/api/admin/federatedauth/providers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(blocked.status).toBe(400);

    const unlinked = await request(app)
      .delete(`/api/admin/federatedauth/providers/${created.body.data.id}/identities`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(unlinked.status).toBe(200);
    expect(unlinked.body.data).toEqual({ unlinked: 1 });
    await expect(
      prisma().federatedAuthIdentity.count({
        where: { providerId: created.body.data.id },
      }),
    ).resolves.toBe(0);
    await expect(
      prisma().user.findUnique({ where: { id: linkedUser.id } }),
    ).resolves.not.toBeNull();

    const removed = await request(app)
      .delete(`/api/admin/federatedauth/providers/${created.body.data.id}`)
      .set('Authorization', `Bearer ${accessToken}`);
    expect(removed.status).toBe(204);
  });
});
