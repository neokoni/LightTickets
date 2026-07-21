import crypto from 'crypto';
import http from 'http';
import bcrypt from 'bcrypt';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';
import { encryptFederatedAuth } from '../src/services/federatedauth-crypto.service.js';

const app = createApp();
const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
const jwk = publicKey.export({ format: 'jwk' });
let server: http.Server;
let issuer = '';
let nonce = '';

function json(res: http.ServerResponse, value: unknown): void {
  res.writeHead(200, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(value));
}

function idToken(): string {
  const header = Buffer.from(
    JSON.stringify({ alg: 'RS256', kid: 'test-key', typ: 'JWT' }),
  ).toString('base64url');
  const payload = Buffer.from(
    JSON.stringify({
      iss: issuer,
      aud: 'oidc-client',
      sub: 'oidc-subject',
      nonce,
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 300,
    }),
  ).toString('base64url');
  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(`${header}.${payload}`), privateKey)
    .toString('base64url');
  return `${header}.${payload}.${signature}`;
}

function cookie(headers: string[] | undefined, name: string): string {
  const value = headers?.find((entry) => entry.startsWith(`${name}=`));
  if (!value) throw new Error(`Missing cookie ${name}`);
  return value.split(';')[0];
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    const url = new URL(req.url ?? '/', issuer || 'http://127.0.0.1');
    if (url.pathname === '/.well-known/openid-configuration') {
      json(res, {
        issuer,
        authorization_endpoint: `${issuer}/authorize`,
        token_endpoint: `${issuer}/token`,
        userinfo_endpoint: `${issuer}/userinfo`,
        jwks_uri: `${issuer}/jwks`,
        response_types_supported: ['code'],
        subject_types_supported: ['public'],
        id_token_signing_alg_values_supported: ['RS256'],
        token_endpoint_auth_methods_supported: ['client_secret_basic'],
      });
      return;
    }
    if (url.pathname === '/jwks') {
      json(res, { keys: [{ ...jwk, kid: 'test-key', use: 'sig', alg: 'RS256' }] });
      return;
    }
    if (url.pathname === '/token') {
      json(res, {
        access_token: 'oidc-access-token',
        token_type: 'Bearer',
        id_token: idToken(),
      });
      return;
    }
    if (url.pathname === '/userinfo') {
      json(res, {
        sub: 'oidc-subject',
        preferred_username: 'oidc-name',
        email: 'oidc@example.com',
      });
      return;
    }
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  if (!address || typeof address === 'string') throw new Error('OIDC test server failed');
  issuer = `http://127.0.0.1:${address.port}`;
});

afterAll(async () => {
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
});

beforeEach(async () => {
  await prisma().setupStatus.create({ data: { isSetup: true, siteUrl: 'http://localhost' } });
  await prisma().appConfig.create({ data: {} });
});

describe('FederatedAuth OIDC login', () => {
  it('uses discovery and validates nonce and the signed ID Token', async () => {
    const provider = await prisma().federatedAuthProvider.create({
      data: {
        slug: 'oidc',
        name: 'OIDC',
        protocol: 'oidc',
        issuer,
        redirectUri: 'http://localhost/api/auth/federatedauth/oidc/callback',
        clientId: 'oidc-client',
        clientSecretEncrypted: encryptFederatedAuth('oidc-secret'),
        scope: 'openid profile email',
        subjectPath: 'sub',
        usernamePath: 'preferred_username',
        emailPath: 'email',
        pkce: true,
        secretMode: 'basic',
        accessTokenPath: 'access_token',
        enabled: true,
      },
    });
    const user = await prisma().user.create({
      data: {
        email: 'local-oidc@example.com',
        username: 'local-oidc',
        passwordHash: await bcrypt.hash('Password123!', 12),
      },
    });
    await prisma().federatedAuthIdentity.create({
      data: { providerId: provider.id, userId: user.id, subject: 'oidc-subject' },
    });

    const started = await request(app)
      .post('/api/auth/federatedauth/oidc/start')
      .send({ returnTo: '/' });
    expect(started.status).toBe(200);
    const authorizationUrl = new URL(started.body.data.authorizationUrl);
    nonce = authorizationUrl.searchParams.get('nonce') ?? '';
    expect(nonce).toBeTruthy();
    expect(authorizationUrl.searchParams.get('code_challenge_method')).toBe('S256');

    const completed = await request(app)
      .get(
        `/api/auth/federatedauth/oidc/callback?code=oidc-code&state=${encodeURIComponent(
          authorizationUrl.searchParams.get('state')!,
        )}`,
      )
      .set('Cookie', cookie(started.headers['set-cookie'], 'lt_federatedauth_flow'));
    expect(completed.status).toBe(303);
    expect(completed.headers.location).toContain('/federatedauth/complete');
    expect(cookie(completed.headers['set-cookie'], 'lt_refresh_token')).toBeTruthy();
  });
});
