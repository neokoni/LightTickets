import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';
import { AppError, NotFoundError } from '../utils/errors.js';

const prisma = new PrismaClient();

export async function create(name: string, address?: string, description?: string) {
  const existing = await prisma.server.findUnique({ where: { name } });
  if (existing) throw new AppError(409, 'Server name already exists');

  const apiKey = `lt_${crypto.randomBytes(24).toString('hex')}`;

  return prisma.server.create({
    data: { name, apiKey, address, description },
  });
}

export async function list() {
  return prisma.server.findMany({ orderBy: { name: 'asc' } });
}

export async function regenerateKey(id: string) {
  const server = await prisma.server.findUnique({ where: { id } });
  if (!server) throw new NotFoundError('Server not found');

  const apiKey = `lt_${crypto.randomBytes(24).toString('hex')}`;
  return prisma.server.update({ where: { id }, data: { apiKey } });
}

export async function remove(id: string) {
  await prisma.server.delete({ where: { id } });
}
