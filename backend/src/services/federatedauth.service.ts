import crypto from 'crypto';
import bcrypt from 'bcrypt';
import * as oidc from 'openid-client';
import { prisma } from '../db.js';
import {
  FEDERATED_AUTH_INTENT,
  FEDERATED_AUTH_PROTOCOL,
  FEDERATED_AUTH_SECRET_MODE,
  FEDERATED_AUTH_TTL,
} from '../constants/federatedauth.js';
import { generateTokens } from '../utils/token.js';
import { readJsonPath } from '../utils/json-path.js';
import {
  AppError,
  ForbiddenError,
  NotFoundError,
  UnauthorizedError,
  ValidationError,
} from '../utils/errors.js';
import * as federatedAuthProviderService from './federatedauth-provider.service.js';
import type { FederatedAuthRuntimeProvider } from './federatedauth-provider.service.js';
import { decryptFederatedAuth, encryptFederatedAuth } from './federatedauth-crypto.service.js';
import * as mailConfigService from './mail-config.service.js';
import * as registrationEmailVerificationService from './registration-email-verification.service.js';

interface FlowPayload {
  verifier: string | null;
  nonce: string | null;
}

interface FederatedAuthClaims {
  subject: string;
  usernameHint: string | null;
  emailHint: string | null;
  avatarUrl: string | null;
}

interface StartInput {
  slug: string;
  intent: 'login' | 'link';
  userId?: number;
  returnTo: string;
}

interface CompleteRegistrationInput {
  token: string;
  email: string;
  username: string;
  password: string;
  emailVerificationCode?: string;
}

const sha256 = (value: string): string => crypto.createHash('sha256').update(value).digest('hex');

function safeInternalPath(value: string): string {
  const path = value.trim();
  if (!path.startsWith('/') || path.includes('\\')) return '/';
  const base = new URL('https://lighttickets.invalid');
  try {
    const resolved = new URL(path, base);
    return resolved.origin === base.origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : '/';
  } catch {
    return '/';
  }
}

function timingSafeEqual(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return (
    leftBuffer.length === rightBuffer.length && crypto.timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function optionalString(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function subjectString(value: unknown): string {
  if (typeof value === 'string') {
    const subject = value.trim();
    if (subject && subject.length <= 191) return subject;
  }
  if (typeof value === 'number' && Number.isSafeInteger(value)) return String(value);
  throw new UnauthorizedError('Provider 返回的用户 ID 无效');
}

function optionalHttpUrl(value: unknown): string | null {
  const text = optionalString(value);
  if (!text) return null;
  try {
    const url = new URL(text);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : null;
  } catch {
    return null;
  }
}

function mapClaims(provider: FederatedAuthRuntimeProvider, source: unknown): FederatedAuthClaims {
  return {
    subject: subjectString(readJsonPath(source, provider.subjectPath)),
    usernameHint: optionalString(readJsonPath(source, provider.usernamePath)),
    emailHint: optionalString(readJsonPath(source, provider.emailPath)),
    avatarUrl: optionalHttpUrl(readJsonPath(source, provider.avatarPath)),
  };
}

function parseFlowPayload(value: string): FlowPayload {
  try {
    const parsed: unknown = JSON.parse(decryptFederatedAuth(value));
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error();
    const record = parsed as Record<string, unknown>;
    return {
      verifier: typeof record.verifier === 'string' ? record.verifier : null,
      nonce: typeof record.nonce === 'string' ? record.nonce : null,
    };
  } catch {
    throw new UnauthorizedError('外部登录流程数据无效');
  }
}

function buildOAuthAuthorizationUrl(
  provider: FederatedAuthRuntimeProvider,
  state: string,
  challenge: string | null,
): URL {
  if (!provider.authorizationEndpoint) throw new ValidationError('OAuth 授权端点未配置');
  const url = new URL(provider.authorizationEndpoint);
  for (const [key, value] of Object.entries(provider.authorizationParams)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('client_id', provider.clientId);
  url.searchParams.set('redirect_uri', provider.redirectUri);
  url.searchParams.set('state', state);
  if (provider.scope) url.searchParams.set('scope', provider.scope);
  if (challenge) {
    url.searchParams.set('code_challenge', challenge);
    url.searchParams.set('code_challenge_method', 'S256');
  }
  return url;
}

async function buildAuthorizationUrl(
  provider: FederatedAuthRuntimeProvider,
  state: string,
  payload: FlowPayload,
): Promise<URL> {
  const challenge = payload.verifier
    ? await oidc.calculatePKCECodeChallenge(payload.verifier)
    : null;
  if (provider.protocol === FEDERATED_AUTH_PROTOCOL.OAUTH) {
    return buildOAuthAuthorizationUrl(provider, state, challenge);
  }

  const configuration = await federatedAuthProviderService.discoverProvider(provider);
  const parameters: Record<string, string> = {
    ...provider.authorizationParams,
    response_type: 'code',
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
    scope: provider.scope,
    state,
    nonce: payload.nonce!,
  };
  if (challenge) {
    parameters.code_challenge = challenge;
    parameters.code_challenge_method = 'S256';
  }
  return oidc.buildAuthorizationUrl(configuration, parameters);
}

async function cleanupFederatedAuthSessions(): Promise<void> {
  const expired = new Date();
  await prisma().$transaction([
    prisma().federatedAuthFlow.deleteMany({ where: { expiresAt: { lte: expired } } }),
    prisma().federatedAuthRegistration.deleteMany({ where: { expiresAt: { lte: expired } } }),
  ]);
}

export async function startFederatedAuth(input: StartInput) {
  if (input.intent === FEDERATED_AUTH_INTENT.LINK && input.userId === undefined) {
    throw new UnauthorizedError();
  }
  await cleanupFederatedAuthSessions();
  const provider = await federatedAuthProviderService.getEnabledProvider(input.slug);
  const state = oidc.randomState();
  const browser = crypto.randomBytes(32).toString('base64url');
  const payload: FlowPayload = {
    verifier: provider.pkce ? oidc.randomPKCECodeVerifier() : null,
    nonce: provider.protocol === FEDERATED_AUTH_PROTOCOL.OIDC ? oidc.randomNonce() : null,
  };
  const authorizationUrl = await buildAuthorizationUrl(provider, state, payload);

  await prisma().federatedAuthFlow.create({
    data: {
      stateHash: sha256(state),
      browserHash: sha256(browser),
      providerId: provider.id,
      intent: input.intent,
      userId: input.userId ?? null,
      returnTo: safeInternalPath(input.returnTo),
      payloadEncrypted: encryptFederatedAuth(JSON.stringify(payload)),
      expiresAt: new Date(Date.now() + FEDERATED_AUTH_TTL.FLOW),
    },
  });

  return { authorizationUrl: authorizationUrl.href, browser };
}

function basicAuthorization(clientId: string, secret: string): string {
  return `Basic ${Buffer.from(
    `${encodeURIComponent(clientId)}:${encodeURIComponent(secret)}`,
  ).toString('base64')}`;
}

async function parseTokenResponse(response: Response): Promise<unknown> {
  const text = await response.text();
  if (!text) throw new UnauthorizedError('Provider 返回了空 Token 响应');
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return Object.fromEntries(new URLSearchParams(text));
  }
}

async function exchangeOAuthToken(
  provider: FederatedAuthRuntimeProvider,
  code: string,
  verifier: string | null,
): Promise<string> {
  if (!provider.tokenEndpoint) throw new ValidationError('OAuth Token 端点未配置');
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    code,
    client_id: provider.clientId,
    redirect_uri: provider.redirectUri,
  });
  if (verifier) body.set('code_verifier', verifier);

  const headers: Record<string, string> = {
    Accept: 'application/json',
    'Content-Type': 'application/x-www-form-urlencoded',
  };
  if (provider.clientSecret) {
    if (provider.secretMode === FEDERATED_AUTH_SECRET_MODE.BASIC) {
      headers.Authorization = basicAuthorization(provider.clientId, provider.clientSecret);
    } else if (provider.secretMode === FEDERATED_AUTH_SECRET_MODE.POST) {
      body.set('client_secret', provider.clientSecret);
    } else {
      const hash = await bcrypt.hash(provider.clientSecret, 10);
      body.set('client_secret', hash.replace(/^\$2b\$/, '$2y$'));
    }
  } else if (provider.secretMode === FEDERATED_AUTH_SECRET_MODE.BCRYPT) {
    throw new ValidationError('bcrypt Client Secret 模式必须配置 Client Secret');
  }

  const response = await fetch(provider.tokenEndpoint, {
    method: 'POST',
    headers,
    body,
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  });
  const tokenResponse = await parseTokenResponse(response);
  if (!response.ok) throw new UnauthorizedError('Provider Token 请求失败');
  const token = optionalString(readJsonPath(tokenResponse, provider.accessTokenPath));
  if (!token) throw new UnauthorizedError('Provider Token 响应缺少 Access Token');
  return token;
}

async function fetchOAuthClaims(
  provider: FederatedAuthRuntimeProvider,
  currentUrl: URL,
  payload: FlowPayload,
): Promise<unknown> {
  const code = currentUrl.searchParams.get('code');
  if (!code) throw new UnauthorizedError('外部登录回调缺少授权码');
  const token = await exchangeOAuthToken(provider, code, payload.verifier);
  if (!provider.userInfoEndpoint) throw new ValidationError('OAuth 用户信息端点未配置');
  const response = await fetch(provider.userInfoEndpoint, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
    redirect: 'error',
    signal: AbortSignal.timeout(8_000),
  });
  if (!response.ok) throw new UnauthorizedError('Provider 用户信息请求失败');
  try {
    return (await response.json()) as unknown;
  } catch {
    throw new UnauthorizedError('Provider 用户信息不是有效 JSON');
  }
}

async function fetchOidcClaims(
  provider: FederatedAuthRuntimeProvider,
  currentUrl: URL,
  payload: FlowPayload,
  state: string,
): Promise<unknown> {
  const configuration = await federatedAuthProviderService.discoverProvider(provider);
  const checks: oidc.AuthorizationCodeGrantChecks = {
    expectedState: state,
    expectedNonce: payload.nonce!,
    idTokenExpected: true,
  };
  if (payload.verifier) checks.pkceCodeVerifier = payload.verifier;
  const tokens = await oidc.authorizationCodeGrant(configuration, currentUrl, checks);
  const claims = tokens.claims();
  if (!claims?.sub) throw new UnauthorizedError('OIDC ID Token 缺少 subject');
  if (!tokens.access_token || !configuration.serverMetadata().userinfo_endpoint) return claims;
  const userInfo = await oidc.fetchUserInfo(configuration, tokens.access_token, claims.sub);
  return { ...claims, ...userInfo, sub: claims.sub };
}

async function providerClaims(
  provider: FederatedAuthRuntimeProvider,
  currentUrl: URL,
  payload: FlowPayload,
  state: string,
): Promise<FederatedAuthClaims> {
  const source =
    provider.protocol === FEDERATED_AUTH_PROTOCOL.OIDC
      ? await fetchOidcClaims(provider, currentUrl, payload, state)
      : await fetchOAuthClaims(provider, currentUrl, payload);
  return mapClaims(provider, source);
}

async function frontendOrigin(provider: FederatedAuthRuntimeProvider): Promise<string> {
  const setup = await prisma().setupStatus.findFirst({ select: { siteUrl: true } });
  const candidate = setup?.siteUrl ?? new URL(provider.redirectUri).origin;
  try {
    return new URL(candidate).origin;
  } catch {
    return new URL(provider.redirectUri).origin;
  }
}

function frontendLocation(origin: string, path: string): string {
  return new URL(path, `${origin}/`).href;
}

async function linkIdentity(
  provider: FederatedAuthRuntimeProvider,
  claims: FederatedAuthClaims,
  userId: number,
): Promise<void> {
  await prisma().$transaction(async (tx) => {
    const subjectIdentity = await tx.federatedAuthIdentity.findUnique({
      where: { providerId_subject: { providerId: provider.id, subject: claims.subject } },
    });
    if (subjectIdentity && subjectIdentity.userId !== userId) {
      throw new AppError(409, '该 Provider 身份已绑定其他账户');
    }
    const providerIdentity = await tx.federatedAuthIdentity.findUnique({
      where: { userId_providerId: { userId, providerId: provider.id } },
    });
    if (providerIdentity && providerIdentity.subject !== claims.subject) {
      throw new AppError(409, '当前账户已绑定该 Provider 的其他身份');
    }

    if (subjectIdentity) {
      await tx.federatedAuthIdentity.update({
        where: { id: subjectIdentity.id },
        data: { ...claims, subject: undefined, lastLoginAt: new Date() },
      });
    } else {
      await tx.federatedAuthIdentity.create({
        data: {
          userId,
          providerId: provider.id,
          ...claims,
          lastLoginAt: new Date(),
        },
      });
    }
  });
}

export async function finishFederatedAuth(input: {
  slug: string;
  state: string;
  browser: string;
  currentUrl: URL;
}) {
  if (input.currentUrl.searchParams.has('error')) {
    throw new UnauthorizedError('Provider 拒绝了授权请求');
  }
  const flow = await prisma().federatedAuthFlow.findUnique({
    where: { stateHash: sha256(input.state) },
    include: { provider: { select: { slug: true } } },
  });
  if (
    !flow ||
    flow.provider.slug !== input.slug ||
    flow.usedAt ||
    flow.expiresAt <= new Date() ||
    !timingSafeEqual(flow.browserHash, sha256(input.browser))
  ) {
    throw new UnauthorizedError('外部登录流程无效或已过期');
  }
  const consumed = await prisma().federatedAuthFlow.updateMany({
    where: { id: flow.id, usedAt: null, expiresAt: { gt: new Date() } },
    data: { usedAt: new Date() },
  });
  if (consumed.count !== 1) throw new UnauthorizedError('外部登录流程已被使用');

  const provider = await federatedAuthProviderService.getEnabledProvider(flow.provider.slug);
  const payload = parseFlowPayload(flow.payloadEncrypted);
  const callbackUrl = new URL(provider.redirectUri);
  callbackUrl.search = input.currentUrl.search;
  const claims = await providerClaims(provider, callbackUrl, payload, input.state);
  const origin = await frontendOrigin(provider);

  if (flow.intent === FEDERATED_AUTH_INTENT.LINK) {
    if (!flow.userId) throw new UnauthorizedError('绑定目标账户无效');
    await linkIdentity(provider, claims, flow.userId);
    return {
      kind: 'link' as const,
      location: frontendLocation(origin, safeInternalPath(flow.returnTo)),
    };
  }

  const identity = await prisma().federatedAuthIdentity.findUnique({
    where: { providerId_subject: { providerId: provider.id, subject: claims.subject } },
    include: { user: true },
  });
  if (identity) {
    await prisma().federatedAuthIdentity.update({
      where: { id: identity.id },
      data: {
        usernameHint: claims.usernameHint,
        emailHint: claims.emailHint,
        avatarUrl: claims.avatarUrl,
        lastLoginAt: new Date(),
      },
    });
    const tokens = generateTokens(identity.user.id, identity.user.role);
    const location = new URL('/federatedauth/complete', `${origin}/`);
    location.searchParams.set('returnTo', safeInternalPath(flow.returnTo));
    return { kind: 'login' as const, location: location.href, tokens };
  }

  const setup = await prisma().setupStatus.findFirst({ select: { allowWebRegister: true } });
  if (!provider.allowRegistration || !setup?.allowWebRegister) {
    throw new ForbiddenError('该 Provider 不允许创建新账户');
  }

  const token = crypto.randomBytes(32).toString('base64url');
  await prisma().federatedAuthRegistration.create({
    data: {
      tokenHash: sha256(token),
      providerId: provider.id,
      ...claims,
      expiresAt: new Date(Date.now() + FEDERATED_AUTH_TTL.REGISTRATION),
    },
  });
  return {
    kind: 'registration' as const,
    location: frontendLocation(origin, '/federatedauth/register'),
    token,
  };
}

async function registrationSession(token: string) {
  const session = await prisma().federatedAuthRegistration.findUnique({
    where: { tokenHash: sha256(token) },
    include: { provider: true },
  });
  if (!session || session.usedAt || session.expiresAt <= new Date()) {
    throw new UnauthorizedError('外部登录注册会话无效或已过期');
  }
  return session;
}

export async function getFederatedAuthRegistration(token: string) {
  const session = await registrationSession(token);
  return {
    provider: { name: session.provider.name, iconUrl: session.provider.iconUrl },
    usernameHint: session.usernameHint,
    emailHint: session.emailHint,
  };
}

export async function assertFederatedAuthRegistration(token: string): Promise<void> {
  const session = await registrationSession(token);
  const setup = await prisma().setupStatus.findFirst({ select: { allowWebRegister: true } });
  if (
    !session.provider.enabled ||
    !session.provider.allowRegistration ||
    !setup?.allowWebRegister
  ) {
    throw new ForbiddenError('该 Provider 不允许创建新账户');
  }
}

export async function completeFederatedAuthRegistration(input: CompleteRegistrationInput) {
  const normalizedEmail = registrationEmailVerificationService.normalizeEmail(input.email);
  const session = await registrationSession(input.token);
  if (!session.provider.enabled || !session.provider.allowRegistration) {
    throw new ForbiddenError('该 Provider 不允许创建新账户');
  }
  const setup = await prisma().setupStatus.findFirst({ select: { allowWebRegister: true } });
  if (!setup?.allowWebRegister) throw new ForbiddenError('网页注册已关闭，请联系管理员');

  const existing = await prisma().user.findFirst({
    where: { OR: [{ email: normalizedEmail }, { username: input.username }] },
  });
  if (existing) {
    throw new AppError(
      409,
      existing.email === normalizedEmail ? '该邮箱已被注册' : '该用户名已被占用',
    );
  }

  const mailConfig = await mailConfigService.getFullMailConfig();
  const verificationRequired = mailConfigService.canSendPasswordResetMail(mailConfig);
  if (verificationRequired && !input.emailVerificationCode) {
    throw new ValidationError('请输入邮箱验证码');
  }
  const verificationCodeHash = verificationRequired
    ? await registrationEmailVerificationService.verifyRegistrationCode(
        normalizedEmail,
        input.emailVerificationCode!,
      )
    : null;
  const passwordHash = await bcrypt.hash(input.password, 12);

  const user = await prisma().$transaction(async (tx) => {
    const currentSession = await tx.federatedAuthRegistration.findUnique({
      where: { id: session.id },
    });
    if (!currentSession || currentSession.usedAt || currentSession.expiresAt <= new Date()) {
      throw new UnauthorizedError('外部登录注册会话无效或已过期');
    }
    const conflictingUser = await tx.user.findFirst({
      where: { OR: [{ email: normalizedEmail }, { username: input.username }] },
    });
    if (conflictingUser) {
      throw new AppError(
        409,
        conflictingUser.email === normalizedEmail ? '该邮箱已被注册' : '该用户名已被占用',
      );
    }
    const conflictingIdentity = await tx.federatedAuthIdentity.findUnique({
      where: {
        providerId_subject: {
          providerId: session.providerId,
          subject: session.subject,
        },
      },
    });
    if (conflictingIdentity) throw new AppError(409, '该 Provider 身份已绑定账户');
    if (verificationCodeHash) {
      await registrationEmailVerificationService.consumeRegistrationCode(
        tx,
        normalizedEmail,
        verificationCodeHash,
      );
    }
    const created = await tx.user.create({
      data: { email: normalizedEmail, username: input.username, passwordHash },
    });
    await tx.federatedAuthIdentity.create({
      data: {
        userId: created.id,
        providerId: session.providerId,
        subject: session.subject,
        usernameHint: session.usernameHint,
        emailHint: session.emailHint,
        avatarUrl: session.avatarUrl,
        lastLoginAt: new Date(),
      },
    });
    await tx.federatedAuthRegistration.update({
      where: { id: session.id },
      data: { usedAt: new Date() },
    });
    return created;
  });

  return { user: sanitizeUser(user), ...generateTokens(user.id, user.role) };
}

export async function listFederatedAuthIdentities(userId: number) {
  return prisma().federatedAuthIdentity.findMany({
    where: { userId },
    select: {
      id: true,
      usernameHint: true,
      emailHint: true,
      avatarUrl: true,
      lastLoginAt: true,
      createdAt: true,
      provider: { select: { slug: true, name: true, iconUrl: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function unlinkFederatedAuthIdentity(
  userId: number,
  identityId: string,
  currentPassword: string,
): Promise<void> {
  const user = await prisma().user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('用户不存在');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ValidationError('当前密码错误');
  }
  const identity = await prisma().federatedAuthIdentity.findUnique({ where: { id: identityId } });
  if (!identity || identity.userId !== userId) throw new NotFoundError('身份绑定不存在');
  await prisma().federatedAuthIdentity.delete({ where: { id: identityId } });
}

function sanitizeUser<T extends { passwordHash: string }>(user: T): Omit<T, 'passwordHash'> {
  const { passwordHash: _passwordHash, ...safe } = user;
  return safe;
}
