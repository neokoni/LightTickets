import { prisma } from '../db.js';
import crypto from 'crypto';
import { AppError, NotFoundError } from '../utils/errors.js';
import { hashServerApiKey, isServerApiKeyHash } from '../utils/server-key.js';

function publicServer(server: {
  id: string;
  name: string;
  address: string | null;
  description: string | null;
  createdAt: Date;
}) {
  return {
    id: server.id,
    name: server.name,
    address: server.address,
    description: server.description,
    createdAt: server.createdAt,
  };
}

function newApiKey(): string {
  return `lt_${crypto.randomBytes(24).toString('hex')}`;
}

export async function create(name: string, address?: string, description?: string) {
  const existing = await prisma().server.findUnique({ where: { name } });
  if (existing) throw new AppError(409, '服务器名称已存在');

  const apiKey = newApiKey();

  const server = await prisma().server.create({
    data: { name, apiKeyHash: hashServerApiKey(apiKey), address, description },
  });
  return { ...publicServer(server), apiKey };
}

export async function list() {
  const servers = await prisma().server.findMany({ orderBy: { name: 'asc' } });
  return servers.map(publicServer);
}

export async function regenerateKey(id: string) {
  const server = await prisma().server.findUnique({ where: { id } });
  if (!server) throw new NotFoundError('服务器不存在');

  const apiKey = newApiKey();
  const updated = await prisma().server.update({
    where: { id },
    data: { apiKeyHash: hashServerApiKey(apiKey) },
  });
  return { ...publicServer(updated), apiKey };
}

export async function update(
  id: string,
  data: { name?: string; address?: string | null; description?: string | null },
) {
  const server = await prisma().server.findUnique({ where: { id } });
  if (!server) throw new NotFoundError('服务器不存在');

  if (data.name && data.name !== server.name) {
    const existing = await prisma().server.findUnique({ where: { name: data.name } });
    if (existing) throw new AppError(409, '服务器名称已存在');
  }

  const updated = await prisma().server.update({
    where: { id },
    data,
  });
  return publicServer(updated);
}

export async function remove(id: string) {
  await prisma().server.delete({ where: { id } });
}

/** Hash API keys created before the apiKeyHash field was introduced. */
export async function migrateLegacyServerApiKeys(): Promise<void> {
  const servers = await prisma().server.findMany({ select: { id: true, apiKeyHash: true } });
  for (const server of servers) {
    if (isServerApiKeyHash(server.apiKeyHash)) continue;
    await prisma().server.update({
      where: { id: server.id },
      data: { apiKeyHash: hashServerApiKey(server.apiKeyHash) },
    });
  }
}
