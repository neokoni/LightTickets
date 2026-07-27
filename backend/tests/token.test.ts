import { describe, expect, it } from 'vitest';
import jwt, { type Algorithm, type Jwt, type SignOptions } from 'jsonwebtoken';
import { getConfig } from '../src/config.js';
import {
  generateAccessToken,
  generateEmailUnsubscribeToken,
  generateTokens,
  verifyAccessToken,
  verifyEmailUnsubscribeToken,
  verifyRefreshToken,
} from '../src/utils/token.js';

const ACCESS_AUDIENCE = 'lighttickets:api';
const ISSUER = 'lighttickets';

function decodeToken(token: string): Jwt {
  const decoded = jwt.decode(token, { complete: true });
  if (!decoded || typeof decoded === 'string') throw new Error('token did not decode');
  return decoded;
}

function signAccessPayload(
  payload: Record<string, unknown>,
  options: {
    algorithm?: Algorithm;
    audience?: string;
    issuer?: string;
    type?: string;
    omitAudience?: boolean;
    omitIssuer?: boolean;
  } = {},
): string {
  const algorithm = options.algorithm ?? 'HS256';
  const signOptions: SignOptions = {
    algorithm,
    header: { alg: algorithm, typ: options.type ?? 'at+jwt' },
    expiresIn: '1h',
  };
  if (!options.omitAudience) signOptions.audience = options.audience ?? ACCESS_AUDIENCE;
  if (!options.omitIssuer) signOptions.issuer = options.issuer ?? ISSUER;
  return jwt.sign(payload, getConfig().security.jwtSecret, signOptions);
}

describe('JWT token boundaries', () => {
  it('issues access, refresh, and unsubscribe tokens with distinct claims', () => {
    const { accessToken, refreshToken } = generateTokens(42, 'staff');
    const unsubscribeToken = generateEmailUnsubscribeToken(42);
    const access = decodeToken(accessToken);
    const refresh = decodeToken(refreshToken);
    const unsubscribe = decodeToken(unsubscribeToken);

    expect(access.header).toMatchObject({ alg: 'HS256', typ: 'at+jwt' });
    expect(access.payload).toMatchObject({
      userId: 42,
      role: 'staff',
      type: 'access',
      tokenVersion: 1,
      aud: ACCESS_AUDIENCE,
      iss: ISSUER,
    });
    expect(refresh.header).toMatchObject({ alg: 'HS256', typ: 'rt+jwt' });
    expect(refresh.payload).toMatchObject({
      userId: 42,
      type: 'refresh',
      aud: 'lighttickets:auth:refresh',
      iss: ISSUER,
    });
    expect(refresh.payload).not.toHaveProperty('role');
    expect(unsubscribe.header).toMatchObject({ alg: 'HS256', typ: 'lt-unsubscribe+jwt' });
    expect(unsubscribe.payload).toMatchObject({
      userId: 42,
      type: 'unsubscribe',
      purpose: 'ticket-email-unsubscribe',
      aud: 'lighttickets:email-notifications:unsubscribe',
      iss: ISSUER,
    });
  });

  it('accepts each token only in its designated verifier', () => {
    const { accessToken, refreshToken } = generateTokens(7, 'player');
    const unsubscribeToken = generateEmailUnsubscribeToken(7);

    expect(verifyAccessToken(accessToken)).toEqual({ userId: 7, role: 'player' });
    expect(verifyRefreshToken(refreshToken)).toEqual({ userId: 7 });
    expect(verifyEmailUnsubscribeToken(unsubscribeToken)).toEqual({ userId: 7 });

    expect(() => verifyAccessToken(refreshToken)).toThrow();
    expect(() => verifyAccessToken(unsubscribeToken)).toThrow();
    expect(() => verifyRefreshToken(accessToken)).toThrow();
    expect(() => verifyRefreshToken(unsubscribeToken)).toThrow();
    expect(() => verifyEmailUnsubscribeToken(accessToken)).toThrow();
    expect(() => verifyEmailUnsubscribeToken(refreshToken)).toThrow();
  });

  it('uses the same strict access signer for standalone access tokens', () => {
    const token = generateAccessToken(9, 'admin');

    expect(verifyAccessToken(token)).toEqual({ userId: 9, role: 'admin' });
    expect(decodeToken(token).payload).toMatchObject({
      type: 'access',
      tokenVersion: 1,
      aud: ACCESS_AUDIENCE,
      iss: ISSUER,
    });
  });

  it.each([
    ['missing type', { userId: 1, role: 'player', tokenVersion: 1 }, {}],
    ['missing role', { userId: 1, type: 'access', tokenVersion: 1 }, {}],
    ['missing token version', { userId: 1, role: 'player', type: 'access' }, {}],
    ['wrong token version', { userId: 1, role: 'player', type: 'access', tokenVersion: 2 }, {}],
    [
      'extra purpose',
      {
        userId: 1,
        role: 'player',
        type: 'access',
        tokenVersion: 1,
        purpose: 'ticket-email-unsubscribe',
      },
      {},
    ],
    ['invalid role', { userId: 1, role: 'superadmin', type: 'access', tokenVersion: 1 }, {}],
    ['non-integer user id', { userId: 1.5, role: 'player', type: 'access', tokenVersion: 1 }, {}],
    ['zero user id', { userId: 0, role: 'player', type: 'access', tokenVersion: 1 }, {}],
    [
      'unsafe user id',
      {
        userId: Number.MAX_SAFE_INTEGER + 1,
        role: 'player',
        type: 'access',
        tokenVersion: 1,
      },
      {},
    ],
    [
      'missing audience',
      { userId: 1, role: 'player', type: 'access', tokenVersion: 1 },
      { omitAudience: true },
    ],
    [
      'wrong audience',
      { userId: 1, role: 'player', type: 'access', tokenVersion: 1 },
      { audience: 'lighttickets:other' },
    ],
    [
      'missing issuer',
      { userId: 1, role: 'player', type: 'access', tokenVersion: 1 },
      { omitIssuer: true },
    ],
    [
      'wrong issuer',
      { userId: 1, role: 'player', type: 'access', tokenVersion: 1 },
      { issuer: 'other-service' },
    ],
    [
      'wrong header type',
      { userId: 1, role: 'player', type: 'access', tokenVersion: 1 },
      { type: 'JWT' },
    ],
    [
      'wrong algorithm',
      { userId: 1, role: 'player', type: 'access', tokenVersion: 1 },
      { algorithm: 'HS384' as Algorithm },
    ],
  ])('rejects an access token with %s', (_name, payload, options) => {
    expect(() => signAccessPayload(payload, options)).not.toThrow();
    expect(() => verifyAccessToken(signAccessPayload(payload, options))).toThrow();
  });

  it('rejects legacy capability and mixed payloads in the access verifier', () => {
    const config = getConfig();
    const legacyUnsubscribe = jwt.sign(
      { userId: 1, purpose: 'ticket-email-unsubscribe' },
      config.security.jwtSecret,
      { algorithm: 'HS256', expiresIn: '1h' },
    );
    const mixed = jwt.sign(
      { userId: 1, role: 'player', purpose: 'ticket-email-unsubscribe' },
      config.security.jwtSecret,
      { algorithm: 'HS256', expiresIn: '1h' },
    );

    expect(() => verifyAccessToken(legacyUnsubscribe)).toThrow();
    expect(() => verifyAccessToken(mixed)).toThrow();
  });

  it('disables all legacy token formats when the migration cutoff is zero', () => {
    const config = getConfig();
    expect(config.security.legacyJwtCutoff).toBe(0);
    const legacyAccess = jwt.sign({ userId: 1, role: 'player' }, config.security.jwtSecret, {
      algorithm: 'HS256',
      expiresIn: '2h',
    });
    const legacyRefresh = jwt.sign(
      { userId: 1, role: 'player' },
      config.security.jwtRefreshSecret,
      { algorithm: 'HS256', expiresIn: '7d' },
    );
    const legacyUnsubscribe = jwt.sign(
      { userId: 1, purpose: 'ticket-email-unsubscribe' },
      config.security.jwtSecret,
      { algorithm: 'HS256', expiresIn: '30d' },
    );

    expect(() => verifyAccessToken(legacyAccess)).toThrow();
    expect(() => verifyRefreshToken(legacyRefresh)).toThrow();
    expect(() => verifyEmailUnsubscribeToken(legacyUnsubscribe)).toThrow();
  });

  it('accepts only pre-cutoff legacy tokens in their original boundary', () => {
    const config = getConfig();
    const originalCutoff = config.security.legacyJwtCutoff;
    const cutoff = Math.floor(Date.now() / 1000);
    config.security.legacyJwtCutoff = cutoff;

    try {
      const legacyAccess = jwt.sign(
        { userId: 3, role: 'staff', iat: cutoff },
        config.security.jwtSecret,
        { algorithm: 'HS256', expiresIn: '2h' },
      );
      const legacyRefresh = jwt.sign(
        { userId: 3, role: 'staff', iat: cutoff },
        config.security.jwtRefreshSecret,
        { algorithm: 'HS256', expiresIn: '7d' },
      );
      const legacyUnsubscribe = jwt.sign(
        { userId: 3, purpose: 'ticket-email-unsubscribe', iat: cutoff },
        config.security.jwtSecret,
        { algorithm: 'HS256', expiresIn: '30d' },
      );

      expect(verifyAccessToken(legacyAccess)).toEqual({ userId: 3, role: 'staff' });
      expect(verifyRefreshToken(legacyRefresh)).toEqual({ userId: 3 });
      expect(verifyEmailUnsubscribeToken(legacyUnsubscribe)).toEqual({ userId: 3 });
      expect(() => verifyAccessToken(legacyUnsubscribe)).toThrow();
      expect(() => verifyRefreshToken(legacyAccess)).toThrow();
      expect(() => verifyEmailUnsubscribeToken(legacyAccess)).toThrow();

      const afterCutoff = jwt.sign(
        { userId: 3, role: 'staff', iat: cutoff + 1 },
        config.security.jwtSecret,
        { algorithm: 'HS256', expiresIn: '2h' },
      );
      const excessiveLifetime = jwt.sign(
        { userId: 3, role: 'staff', iat: cutoff },
        config.security.jwtSecret,
        { algorithm: 'HS256', expiresIn: '3h' },
      );
      const expired = jwt.sign(
        { userId: 3, role: 'staff', iat: cutoff - 60 },
        config.security.jwtSecret,
        { algorithm: 'HS256', expiresIn: -1 },
      );
      expect(() => verifyAccessToken(afterCutoff)).toThrow();
      expect(() => verifyAccessToken(excessiveLifetime)).toThrow();
      expect(() => verifyAccessToken(expired)).toThrow();
    } finally {
      config.security.legacyJwtCutoff = originalCutoff;
    }
  });
});
