import { PrismaClient } from '@prisma/client';
import { AppError, NotFoundError } from '../utils/errors.js';

const prisma = new PrismaClient();

export async function create(name: string, color: string, description?: string) {
  const existing = await prisma.label.findUnique({ where: { name } });
  if (existing) throw new AppError(409, '标签已存在');

  return prisma.label.create({ data: { name, color, description } });
}

export async function list() {
  return prisma.label.findMany({ orderBy: { name: 'asc' } });
}

export async function update(id: string, data: { name?: string; color?: string; description?: string }) {
  const label = await prisma.label.findUnique({ where: { id } });
  if (!label) throw new NotFoundError('标签不存在');
  return prisma.label.update({ where: { id }, data });
}

export async function remove(id: string) {
  await prisma.label.delete({ where: { id } });
}

export async function addToTicket(ticketId: string, labelId: string) {
  return prisma.ticketLabel.create({ data: { ticketId, labelId } });
}

export async function removeFromTicket(ticketId: string, labelId: string) {
  await prisma.ticketLabel.delete({ where: { ticketId_labelId: { ticketId, labelId } } });
}
