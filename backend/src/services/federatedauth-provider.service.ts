import type { FederatedAuthProvider } from '@prisma/client';
import * as oidc from 'openid-client';
import { prisma } from '../db.js';
import {
  FEDERATED_AUTH_PROTOCOL,
  FEDERATED_AUTH_SECRET_MODE,
  type FederatedAuthSecretMode,
} from '../constants/federatedauth.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import type {
  FederatedAuthProviderCreateInput,
  FederatedAuthProviderUpdateInput,
} from '../schemas/federatedauth.js';
import { decryptFederatedAuth, encryptFederatedAuth } from './federatedauth-crypto.service.js';

export interface FederatedAuthRuntimeProvider {
  id: string;
  slug: string;
  name: string;
  iconUrl: string | null;
  protocol: 'oidc' | 'oauth';
  issuer: string | null;
  authorizationEndpoint: string | null;
  tokenEndpoint: string | null;
  userInfoEndpoint: string | null;
  redirectUri: string;
  clientId: string;
  clientSecret: string | null;
  scope: string;
  subjectPath: string;
  usernamePath: string | null;
  emailPath: string | null;
  avatarPath: string | null;
  authorizationParams: Record<string, string>;
  pkce: boolean;
  secretMode: FederatedAuthSecretMode;
  accessTokenPath: string;
  enabled: boolean;
  allowRegistration: boolean;
}

function parseAuthorizationParams(value: string | null): Record<string, string> {
  if (!value) return {};
  try {
    const parsed: unknown = JSON.parse(value);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return {};
    return Object.fromEntries(
      Object.entries(parsed).filter((entry): entry is [string, string] => {
        return typeof entry[1] === 'string';
      }),
    );
  } catch {
    return {};
  }
}

function toRuntime(provider: FederatedAuthProvider): FederatedAuthRuntimeProvider {
  return {
    ...provider,
    protocol: provider.protocol,
    clientSecret: provider.clientSecretEncrypted
      ? decryptFederatedAuth(provider.clientSecretEncrypted)
      : null,
    authorizationParams: parseAuthorizationParams(provider.authorizationParams),
    secretMode: provider.secretMode,
  };
}

function toAdmin(provider: FederatedAuthProvider & { _count: { identities: number } }) {
  const { clientSecretEncrypted: _secret, authorizationParams, _count, ...safe } = provider;
  return {
    ...safe,
    authorizationParams: parseAuthorizationParams(authorizationParams),
    clientSecretSet: !!provider.clientSecretEncrypted,
    identityCount: _count.identities,
  };
}

function providerData(input: FederatedAuthProviderCreateInput) {
  return {
    slug: input.slug,
    name: input.name,
    iconUrl: input.iconUrl ?? null,
    protocol: input.protocol,
    issuer: input.protocol === FEDERATED_AUTH_PROTOCOL.OIDC ? (input.issuer ?? null) : null,
    authorizationEndpoint:
      input.protocol === FEDERATED_AUTH_PROTOCOL.OAUTH
        ? (input.authorizationEndpoint ?? null)
        : null,
    tokenEndpoint:
      input.protocol === FEDERATED_AUTH_PROTOCOL.OAUTH ? (input.tokenEndpoint ?? null) : null,
    userInfoEndpoint:
      input.protocol === FEDERATED_AUTH_PROTOCOL.OAUTH ? (input.userInfoEndpoint ?? null) : null,
    redirectUri: input.redirectUri,
    clientId: input.clientId,
    clientSecretEncrypted: input.clientSecret ? encryptFederatedAuth(input.clientSecret) : null,
    scope: input.scope,
    subjectPath: input.subjectPath,
    usernamePath: input.usernamePath ?? null,
    emailPath: input.emailPath ?? null,
    avatarPath: input.avatarPath ?? null,
    authorizationParams: JSON.stringify(input.authorizationParams ?? {}),
    pkce: input.pkce,
    secretMode: input.secretMode,
    accessTokenPath: input.accessTokenPath,
    enabled: input.enabled,
    allowRegistration: input.allowRegistration,
  };
}

export async function listPublicProviders() {
  return prisma().federatedAuthProvider.findMany({
    where: { enabled: true },
    select: { slug: true, name: true, iconUrl: true, allowRegistration: true },
    orderBy: { name: 'asc' },
  });
}

export async function listProviders() {
  const providers = await prisma().federatedAuthProvider.findMany({
    include: { _count: { select: { identities: true } } },
    orderBy: { createdAt: 'asc' },
  });
  return providers.map(toAdmin);
}

export async function getProvider(id: string) {
  const provider = await prisma().federatedAuthProvider.findUnique({
    where: { id },
    include: { _count: { select: { identities: true } } },
  });
  if (!provider) throw new NotFoundError('外部登录 Provider 不存在');
  return toAdmin(provider);
}

export async function getEnabledProvider(slug: string): Promise<FederatedAuthRuntimeProvider> {
  const provider = await prisma().federatedAuthProvider.findUnique({ where: { slug } });
  if (!provider || !provider.enabled) {
    throw new NotFoundError('外部登录 Provider 不存在或未启用');
  }
  return toRuntime(provider);
}

export async function createProvider(input: FederatedAuthProviderCreateInput) {
  const duplicate = await prisma().federatedAuthProvider.findUnique({
    where: { slug: input.slug },
    select: { id: true },
  });
  if (duplicate) throw new AppError(409, 'Provider slug 已存在');

  const provider = await prisma().federatedAuthProvider.create({
    data: providerData(input),
    include: { _count: { select: { identities: true } } },
  });
  return toAdmin(provider);
}

export async function updateProvider(id: string, input: FederatedAuthProviderUpdateInput) {
  const current = await prisma().federatedAuthProvider.findUnique({
    where: { id },
    include: { _count: { select: { identities: true } } },
  });
  if (!current) throw new NotFoundError('外部登录 Provider 不存在');

  if (
    current._count.identities > 0 &&
    ((input.slug !== undefined && input.slug !== current.slug) ||
      (input.protocol !== undefined && input.protocol !== current.protocol) ||
      (input.subjectPath !== undefined && input.subjectPath !== current.subjectPath))
  ) {
    throw new ValidationError('已有身份绑定时不能修改 slug、协议或用户 ID Path');
  }

  const merged = {
    slug: input.slug ?? current.slug,
    name: input.name ?? current.name,
    iconUrl: input.iconUrl === undefined ? current.iconUrl : input.iconUrl,
    protocol: input.protocol ?? current.protocol,
    issuer: input.issuer === undefined ? current.issuer : input.issuer,
    authorizationEndpoint:
      input.authorizationEndpoint === undefined
        ? current.authorizationEndpoint
        : input.authorizationEndpoint,
    tokenEndpoint: input.tokenEndpoint === undefined ? current.tokenEndpoint : input.tokenEndpoint,
    userInfoEndpoint:
      input.userInfoEndpoint === undefined ? current.userInfoEndpoint : input.userInfoEndpoint,
    redirectUri: input.redirectUri ?? current.redirectUri,
    clientId: input.clientId ?? current.clientId,
    clientSecret:
      input.clientSecret === undefined
        ? current.clientSecretEncrypted
          ? decryptFederatedAuth(current.clientSecretEncrypted)
          : null
        : input.clientSecret,
    scope: input.scope ?? current.scope,
    subjectPath: input.subjectPath ?? current.subjectPath,
    usernamePath: input.usernamePath === undefined ? current.usernamePath : input.usernamePath,
    emailPath: input.emailPath === undefined ? current.emailPath : input.emailPath,
    avatarPath: input.avatarPath === undefined ? current.avatarPath : input.avatarPath,
    authorizationParams:
      input.authorizationParams ?? parseAuthorizationParams(current.authorizationParams),
    pkce: input.pkce ?? current.pkce,
    secretMode: input.secretMode ?? current.secretMode,
    accessTokenPath: input.accessTokenPath ?? current.accessTokenPath,
    enabled: input.enabled ?? current.enabled,
    allowRegistration: input.allowRegistration ?? current.allowRegistration,
  } satisfies FederatedAuthProviderCreateInput;

  if (
    merged.protocol === FEDERATED_AUTH_PROTOCOL.OIDC &&
    merged.secretMode === FEDERATED_AUTH_SECRET_MODE.BCRYPT
  ) {
    throw new ValidationError('OIDC 不支持 bcrypt Client Secret');
  }
  if (merged.protocol === FEDERATED_AUTH_PROTOCOL.OIDC && !merged.issuer) {
    throw new ValidationError('OIDC issuer 不能为空');
  }
  if (
    merged.protocol === FEDERATED_AUTH_PROTOCOL.OIDC &&
    !merged.scope.split(/\s+/).includes('openid')
  ) {
    throw new ValidationError('OIDC scope 必须包含 openid');
  }
  if (
    merged.protocol === FEDERATED_AUTH_PROTOCOL.OAUTH &&
    (!merged.authorizationEndpoint || !merged.tokenEndpoint || !merged.userInfoEndpoint)
  ) {
    throw new ValidationError('OAuth 端点不能为空');
  }

  const provider = await prisma().federatedAuthProvider.update({
    where: { id },
    data: providerData(merged),
    include: { _count: { select: { identities: true } } },
  });
  return toAdmin(provider);
}

export async function deleteProvider(id: string): Promise<void> {
  await prisma().$transaction(async (tx) => {
    const provider = await tx.federatedAuthProvider.findUnique({
      where: { id },
      include: { _count: { select: { identities: true } } },
    });
    if (!provider) throw new NotFoundError('外部登录 Provider 不存在');
    if (provider._count.identities > 0) {
      throw new ValidationError('Provider 仍有身份绑定，不能删除');
    }
    await tx.federatedAuthProvider.delete({ where: { id } });
  });
}

export async function unlinkProviderIdentities(id: string) {
  return prisma().$transaction(async (tx) => {
    const provider = await tx.federatedAuthProvider.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!provider) throw new NotFoundError('外部登录 Provider 不存在');
    const result = await tx.federatedAuthIdentity.deleteMany({ where: { providerId: id } });
    return { unlinked: result.count };
  });
}

function parseProviderUrl(value: string, label: string): URL {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol)) throw new Error();
    return url;
  } catch {
    throw new ValidationError(`${label}必须是有效的 HTTP(S) URL`);
  }
}

function clientAuthentication(mode: FederatedAuthSecretMode, secret: string | null) {
  if (!secret) return oidc.None();
  return mode === FEDERATED_AUTH_SECRET_MODE.POST
    ? oidc.ClientSecretPost(secret)
    : oidc.ClientSecretBasic(secret);
}

export async function discoverProvider(provider: FederatedAuthRuntimeProvider) {
  if (provider.protocol !== FEDERATED_AUTH_PROTOCOL.OIDC || !provider.issuer) {
    throw new ValidationError('该 Provider 不是 OIDC');
  }
  const issuer = parseProviderUrl(provider.issuer, 'OIDC issuer');
  return oidc.discovery(
    issuer,
    provider.clientId,
    undefined,
    clientAuthentication(provider.secretMode, provider.clientSecret),
    {
      timeout: 8,
      ...(issuer.protocol === 'http:' && {
        execute: [oidc.allowInsecureRequests],
      }),
    },
  );
}

export async function testProvider(id: string) {
  const record = await prisma().federatedAuthProvider.findUnique({ where: { id } });
  if (!record) throw new NotFoundError('外部登录 Provider 不存在');
  const provider = toRuntime(record);
  if (provider.protocol === FEDERATED_AUTH_PROTOCOL.OIDC) {
    const configuration = await discoverProvider(provider);
    const metadata = configuration.serverMetadata();
    if (!metadata.authorization_endpoint || !metadata.token_endpoint) {
      throw new ValidationError('OIDC Discovery 缺少授权或 Token 端点');
    }
    return { reachable: true };
  }

  for (const [value, label] of [
    [provider.authorizationEndpoint, '授权端点'],
    [provider.tokenEndpoint, 'Token 端点'],
    [provider.userInfoEndpoint, '用户信息端点'],
  ] as const) {
    if (!value) throw new ValidationError('OAuth 端点不能为空');
    parseProviderUrl(value, label);
  }
  return { reachable: true };
}
