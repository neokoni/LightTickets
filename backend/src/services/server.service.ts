import { getPrisma } from '../db.js';
import crypto from 'crypto';
import { AppError, NotFoundError } from '../utils/errors.js';

const prisma = () => getPrisma();

export async function create(name: string, address?: string, description?: string) {
  const existing = await prisma().server.findUnique({ where: { name } });
  if (existing) throw new AppError(409, '服务器名称已存在');

  const apiKey = `lt_${crypto.randomBytes(24).toString('hex')}`;

  return prisma().server.create({
    data: { name, apiKey, address, description },
  });
}

export async function list() {
  return prisma().server.findMany({ orderBy: { name: 'asc' } });
}

export async function regenerateKey(id: string) {
  const server = await prisma().server.findUnique({ where: { id } });
  if (!server) throw new NotFoundError('服务器不存在');

  const apiKey = `lt_${crypto.randomBytes(24).toString('hex')}`;
  return prisma().server.update({ where: { id }, data: { apiKey } });
}

export async function update(id: string, data: { name?: string; address?: string | null; description?: string | null }) {
  const server = await prisma().server.findUnique({ where: { id } });
  if (!server) throw new NotFoundError('服务器不存在');

  if (data.name && data.name !== server.name) {
    const existing = await prisma().server.findUnique({ where: { name: data.name } });
    if (existing) throw new AppError(409, '服务器名称已存在');
  }

  return prisma().server.update({
    where: { id },
    data,
  });
}

export async function remove(id: string) {
  await prisma().server.delete({ where: { id } });
}
