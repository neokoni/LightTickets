import crypto from 'crypto';
import type { ServerApiKeyType } from '@prisma/client';
import { SERVER_API_KEY_TYPE } from '../constants/server-api-key.js';
import { prisma } from '../db.js';
import { AppError, NotFoundError, UnauthorizedError } from '../utils/errors.js';
import { hashServerApiKey, isServerApiKeyHash } from '../utils/server-key.js';

type PublicServerInput = {
  id: string;
  name: string;
  identifyId: string | null;
  alias: string | null;
  address: string | null;
  description: string | null;
  createdAt: Date;
};

export interface PublicServer {
  id: string;
  serverId: string;
  identifyId: string | null;
  alias: string | null;
  name: string;
  address: string | null;
  description: string | null;
  createdAt: Date;
}

function publicServer(server: PublicServerInput): PublicServer {
  return {
    id: server.id,
    serverId: server.name,
    identifyId: server.identifyId,
    alias: server.alias,
    name: server.alias ?? server.name,
    address: server.address,
    description: server.description,
    createdAt: server.createdAt,
  };
}

function newApiKey(): string {
  return `lt_${crypto.randomBytes(24).toString('hex')}`;
}

async function assertServersExist(serverIds: string[]): Promise<void> {
  const count = await prisma().server.count({ where: { id: { in: serverIds } } });
  if (count !== serverIds.length) throw new AppError(400, '选择的服务器不存在');
}

/**
 * A Velocity plugin reports one identifier per request and the platform resolves it to a single
 * server, so no two servers may claim the same value: serverId doubles as the identifier whenever
 * identifyId is unset.
 */
async function assertPluginIdentifierAvailable(
  identifier: string,
  excludeServerId?: string,
): Promise<void> {
  const conflict = await prisma().server.findFirst({
    where: {
      ...(excludeServerId ? { id: { not: excludeServerId } } : {}),
      OR: [{ identifyId: identifier }, { identifyId: null, name: identifier }],
    },
    select: { id: true },
  });
  if (conflict) throw new AppError(409, '识别 ID 已被其他服务器使用');
}

export async function create(input: {
  serverId: string;
  identifyId?: string;
  alias?: string;
  address?: string;
  description?: string;
}) {
  const existing = await prisma().server.findUnique({ where: { name: input.serverId } });
  if (existing) throw new AppError(409, '服务器 ID 已存在');
  const { serverId, ...details } = input;
  await assertPluginIdentifierAvailable(details.identifyId ?? serverId);
  return publicServer(await prisma().server.create({ data: { ...details, name: serverId } }));
}

export async function list() {
  const servers = await prisma().server.findMany({ orderBy: { name: 'asc' } });
  return servers.map(publicServer);
}

export async function update(
  id: string,
  data: {
    serverId?: string;
    identifyId?: string | null;
    alias?: string | null;
    address?: string | null;
    description?: string | null;
  },
) {
  const server = await prisma().server.findUnique({ where: { id } });
  if (!server) throw new NotFoundError('服务器不存在');
  if (data.serverId && data.serverId !== server.name) {
    const existing = await prisma().server.findUnique({ where: { name: data.serverId } });
    if (existing) throw new AppError(409, '服务器 ID 已存在');
  }
  const { serverId, ...details } = data;
  const identifyId = details.identifyId === undefined ? server.identifyId : details.identifyId;
  await assertPluginIdentifierAvailable(identifyId ?? serverId ?? server.name, id);
  return publicServer(
    await prisma().server.update({
      where: { id },
      data: { ...details, ...(serverId === undefined ? {} : { name: serverId }) },
    }),
  );
}

export async function remove(id: string) {
  const bindings = await prisma().serverApiKeyBinding.count({ where: { serverId: id } });
  if (bindings > 0) throw new AppError(409, '服务器仍被 API Key 绑定，请先更新或删除 API Key');
  await prisma().server.delete({ where: { id } });
}

function publicApiKey(apiKey: {
  id: string;
  title: string | null;
  type: ServerApiKeyType;
  createdAt: Date;
  bindings: Array<{ server: PublicServerInput }>;
}) {
  return {
    id: apiKey.id,
    title: apiKey.title,
    type: apiKey.type,
    servers: apiKey.bindings.map(({ server }) => publicServer(server)),
    createdAt: apiKey.createdAt,
  };
}

const apiKeyInclude = {
  bindings: { include: { server: true }, orderBy: { server: { name: 'asc' as const } } },
};

export async function listApiKeys() {
  const apiKeys = await prisma().serverApiKey.findMany({
    include: apiKeyInclude,
    orderBy: { createdAt: 'asc' },
  });
  return apiKeys.map(publicApiKey);
}

export async function createApiKey(input: {
  title?: string | null;
  type: ServerApiKeyType;
  serverIds: string[];
}) {
  await assertServersExist(input.serverIds);
  const plainKey = newApiKey();
  const apiKey = await prisma().serverApiKey.create({
    data: {
      title: input.title ?? null,
      type: input.type,
      keyHash: hashServerApiKey(plainKey),
      bindings: { create: input.serverIds.map((serverId) => ({ serverId })) },
    },
    include: apiKeyInclude,
  });
  return { ...publicApiKey(apiKey), apiKey: plainKey };
}

export async function updateApiKey(
  id: string,
  input: { title?: string | null; type: ServerApiKeyType; serverIds: string[] },
) {
  await assertServersExist(input.serverIds);
  const existing = await prisma().serverApiKey.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('API Key 不存在');
  const apiKey = await prisma().$transaction(async (tx) => {
    await tx.serverApiKeyBinding.deleteMany({ where: { apiKeyId: id } });
    return tx.serverApiKey.update({
      where: { id },
      data: {
        ...(input.title === undefined ? {} : { title: input.title }),
        type: input.type,
        bindings: { create: input.serverIds.map((serverId) => ({ serverId })) },
      },
      include: apiKeyInclude,
    });
  });
  return publicApiKey(apiKey);
}

export async function regenerateApiKey(id: string) {
  const existing = await prisma().serverApiKey.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('API Key 不存在');
  const plainKey = newApiKey();
  await prisma().serverApiKey.update({
    where: { id },
    data: { keyHash: hashServerApiKey(plainKey) },
  });
  return { apiKey: plainKey };
}

export async function removeApiKey(id: string) {
  const existing = await prisma().serverApiKey.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('API Key 不存在');
  await prisma().serverApiKey.delete({ where: { id } });
}

export type AuthenticatedServerApiKey = {
  apiKeyId: string;
  title: string | null;
  type: ServerApiKeyType;
  servers: PublicServer[];
};

export async function authenticateApiKey(value: string): Promise<AuthenticatedServerApiKey> {
  const keyHash = hashServerApiKey(value);
  const apiKey = await prisma().serverApiKey.findUnique({
    where: { keyHash },
    include: apiKeyInclude,
  });
  if (apiKey) {
    return {
      apiKeyId: apiKey.id,
      title: apiKey.title,
      type: apiKey.type,
      servers: apiKey.bindings.map(({ server }) => publicServer(server)),
    };
  }

  const legacyServer = await prisma().server.findUnique({ where: { legacyApiKeyHash: keyHash } });
  if (!legacyServer) throw new UnauthorizedError('Invalid server key');
  return {
    apiKeyId: `legacy:${legacyServer.id}`,
    title: null,
    type: SERVER_API_KEY_TYPE.PAPER_FOLIA,
    servers: [publicServer(legacyServer)],
  };
}

export function resolveAuthenticatedServer(
  apiKey: AuthenticatedServerApiKey,
  pluginServerId?: string,
) {
  if (apiKey.type === SERVER_API_KEY_TYPE.PAPER_FOLIA) {
    const server = apiKey.servers[0];
    if (!server) throw new UnauthorizedError('API Key 未绑定服务器');
    return server;
  }
  if (!pluginServerId) throw new UnauthorizedError('请求体缺少 serverId');
  const server = apiKey.servers.find(
    (candidate) => (candidate.identifyId ?? candidate.serverId) === pluginServerId,
  );
  if (!server) throw new UnauthorizedError('该 API Key 未授权此服务器');
  return server;
}

/** Hash API keys created before plaintext keys were replaced with digests. */
export async function migrateLegacyServerApiKeys(): Promise<void> {
  const servers = await prisma().server.findMany({
    where: { legacyApiKeyHash: { not: null } },
    select: { id: true, legacyApiKeyHash: true },
  });
  for (const server of servers) {
    if (!server.legacyApiKeyHash) continue;
    const keyHash = isServerApiKeyHash(server.legacyApiKeyHash)
      ? server.legacyApiKeyHash
      : hashServerApiKey(server.legacyApiKeyHash);
    await prisma().$transaction(async (tx) => {
      if (keyHash !== server.legacyApiKeyHash) {
        await tx.server.update({
          where: { id: server.id },
          data: { legacyApiKeyHash: keyHash },
        });
      }
      const apiKey = await tx.serverApiKey.upsert({
        where: { keyHash },
        update: {},
        create: { keyHash, type: SERVER_API_KEY_TYPE.PAPER_FOLIA },
      });
      await tx.serverApiKeyBinding.upsert({
        where: { apiKeyId_serverId: { apiKeyId: apiKey.id, serverId: server.id } },
        update: {},
        create: { apiKeyId: apiKey.id, serverId: server.id },
      });
    });
  }
}
