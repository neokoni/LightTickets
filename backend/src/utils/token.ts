import jwt, { type JwtHeader, type SignOptions } from 'jsonwebtoken';
import { z } from 'zod';
import { getConfig } from '../config.js';
import { ROLE } from '../constants/roles.js';

const JWT_ALGORITHM = 'HS256';
const JWT_ISSUER = 'lighttickets';
// This is the access-token format version. Per-user revocation remains a separate concern.
const ACCESS_TOKEN_VERSION = 1;

const ACCESS_TOKEN_TYPE = 'at+jwt';
const ACCESS_TOKEN_AUDIENCE = 'lighttickets:api';
const UNSUBSCRIBE_TOKEN_TYPE = 'lt-unsubscribe+jwt';
const UNSUBSCRIBE_TOKEN_AUDIENCE = 'lighttickets:email-notifications:unsubscribe';
const UNSUBSCRIBE_TOKEN_PURPOSE = 'ticket-email-unsubscribe';
const UNSUBSCRIBE_TOKEN_EXPIRY = '30d';
const LEGACY_ACCESS_MAX_LIFETIME_SECONDS = 2 * 60 * 60;
const LEGACY_UNSUBSCRIBE_MAX_LIFETIME_SECONDS = 30 * 24 * 60 * 60;

const userIdSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);
const roleSchema = z.enum([ROLE.PLAYER, ROLE.STAFF, ROLE.ADMIN]);
const tokenEpochSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const issuedAtSchema = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const expiresAtSchema = z.number().int().positive().max(Number.MAX_SAFE_INTEGER);

const accessTokenSchema = z
  .object({
    userId: userIdSchema,
    role: roleSchema,
    type: z.literal('access'),
    tokenVersion: z.literal(ACCESS_TOKEN_VERSION),
    tokenEpoch: tokenEpochSchema.default(0),
    iat: issuedAtSchema,
    exp: expiresAtSchema,
    aud: z.literal(ACCESS_TOKEN_AUDIENCE),
    iss: z.literal(JWT_ISSUER),
  })
  .strict()
  .refine((payload) => payload.exp > payload.iat);

const unsubscribeTokenSchema = z
  .object({
    userId: userIdSchema,
    type: z.literal('unsubscribe'),
    purpose: z.literal(UNSUBSCRIBE_TOKEN_PURPOSE),
    iat: issuedAtSchema,
    exp: expiresAtSchema,
    aud: z.literal(UNSUBSCRIBE_TOKEN_AUDIENCE),
    iss: z.literal(JWT_ISSUER),
  })
  .strict()
  .refine((payload) => payload.exp > payload.iat);

const legacyAccessTokenSchema = z
  .object({
    userId: userIdSchema,
    role: roleSchema,
    iat: issuedAtSchema,
    exp: expiresAtSchema,
  })
  .strict()
  .refine((payload) => payload.exp > payload.iat);

const legacyUnsubscribeTokenSchema = z
  .object({
    userId: userIdSchema,
    purpose: z.literal(UNSUBSCRIBE_TOKEN_PURPOSE),
    iat: issuedAtSchema,
    exp: expiresAtSchema,
  })
  .strict()
  .refine((payload) => payload.exp > payload.iat);

export interface AccessTokenPayload {
  userId: number;
  role: z.infer<typeof roleSchema>;
  tokenEpoch: number;
}

function tokenHeader(type: string): JwtHeader {
  return { alg: JWT_ALGORITHM, typ: type };
}

function verifyPayload(token: string, secret: string, type: string, audience?: string): unknown {
  const verified = jwt.verify(token, secret, {
    algorithms: [JWT_ALGORITHM],
    audience,
    issuer: audience ? JWT_ISSUER : undefined,
    complete: true,
  });
  if (
    typeof verified === 'string' ||
    verified.header.alg !== JWT_ALGORITHM ||
    verified.header.typ !== type
  ) {
    throw new Error('invalid token type');
  }
  return verified.payload;
}

function verifyLegacyPayload<T extends { iat: number; exp: number }>(
  token: string,
  secret: string,
  schema: z.ZodType<T>,
  maxLifetimeSeconds: number,
): T {
  const cutoff = getConfig().security.legacyJwtCutoff;
  if (cutoff === 0) throw new Error('legacy tokens disabled');

  const payload = schema.parse(verifyPayload(token, secret, 'JWT'));
  if (payload.iat > cutoff || payload.exp - payload.iat > maxLifetimeSeconds) {
    throw new Error('legacy token outside migration window');
  }
  return payload;
}

function signAccessToken(userId: number, role: string, tokenEpoch = 0): string {
  return jwt.sign(
    {
      userId: userIdSchema.parse(userId),
      role: roleSchema.parse(role),
      type: 'access',
      tokenVersion: ACCESS_TOKEN_VERSION,
      tokenEpoch: tokenEpochSchema.parse(tokenEpoch),
    },
    getConfig().security.jwtSecret,
    {
      algorithm: JWT_ALGORITHM,
      header: tokenHeader(ACCESS_TOKEN_TYPE),
      audience: ACCESS_TOKEN_AUDIENCE,
      issuer: JWT_ISSUER,
      expiresIn: getConfig().accessTokenExpiry as SignOptions['expiresIn'],
    },
  );
}

export function generateAccessToken(userId: number, role: string, tokenEpoch = 0): string {
  return signAccessToken(userId, role, tokenEpoch);
}

export function verifyAccessToken(token: string): AccessTokenPayload {
  const config = getConfig();
  try {
    const payload = accessTokenSchema.parse(
      verifyPayload(token, config.security.jwtSecret, ACCESS_TOKEN_TYPE, ACCESS_TOKEN_AUDIENCE),
    );
    return { userId: payload.userId, role: payload.role, tokenEpoch: payload.tokenEpoch };
  } catch {
    const payload = verifyLegacyPayload(
      token,
      config.security.jwtSecret,
      legacyAccessTokenSchema,
      LEGACY_ACCESS_MAX_LIFETIME_SECONDS,
    );
    return { userId: payload.userId, role: payload.role, tokenEpoch: 0 };
  }
}

export function generateEmailUnsubscribeToken(userId: number): string {
  return jwt.sign(
    {
      userId: userIdSchema.parse(userId),
      type: 'unsubscribe',
      purpose: UNSUBSCRIBE_TOKEN_PURPOSE,
    },
    getConfig().security.jwtUnsubscribeSecret,
    {
      algorithm: JWT_ALGORITHM,
      header: tokenHeader(UNSUBSCRIBE_TOKEN_TYPE),
      audience: UNSUBSCRIBE_TOKEN_AUDIENCE,
      issuer: JWT_ISSUER,
      expiresIn: UNSUBSCRIBE_TOKEN_EXPIRY,
    },
  );
}

export function verifyEmailUnsubscribeToken(token: string): { userId: number } {
  const config = getConfig();
  try {
    const payload = unsubscribeTokenSchema.parse(
      verifyPayload(
        token,
        config.security.jwtUnsubscribeSecret,
        UNSUBSCRIBE_TOKEN_TYPE,
        UNSUBSCRIBE_TOKEN_AUDIENCE,
      ),
    );
    return { userId: payload.userId };
  } catch {
    const payload = verifyLegacyPayload(
      token,
      config.security.jwtSecret,
      legacyUnsubscribeTokenSchema,
      LEGACY_UNSUBSCRIBE_MAX_LIFETIME_SECONDS,
    );
    return { userId: payload.userId };
  }
}
