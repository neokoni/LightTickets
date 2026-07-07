import { prisma } from '../db.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { AUDIT_ACTION } from '../constants/audit-actions.js';

export async function create(name: string, color: string, description?: string) {
  const existing = await prisma().label.findUnique({ where: { name } });
  if (existing) throw new AppError(409, '标签已存在');

  return prisma().label.create({ data: { name, color, description } });
}

export async function getById(id: string) {
  return prisma().label.findUnique({ where: { id } });
}

export async function list() {
  return prisma().label.findMany({ orderBy: { name: 'asc' } });
}

export async function update(
  id: string,
  data: { name?: string; color?: string; description?: string },
) {
  const label = await prisma().label.findUnique({ where: { id } });
  if (!label) throw new NotFoundError('标签不存在');
  return prisma().label.update({ where: { id }, data });
}

export async function remove(id: string) {
  await prisma().label.delete({ where: { id } });
}

export async function addToTicket(ticketId: number, labelId: string) {
  return prisma().ticketLabel.create({ data: { ticketId, labelId } });
}

export async function removeFromTicket(ticketId: number, labelId: string) {
  await prisma().ticketLabel.delete({ where: { ticketId_labelId: { ticketId, labelId } } });
}

export async function addToTicketWithAudit(ticketId: number, labelId: string, actorId: number) {
  return prisma().$transaction(async (tx) => {
    const ticketLabel = await tx.ticketLabel.create({ data: { ticketId, labelId } });
    const label = await tx.label.findUnique({ where: { id: labelId } });
    if (label) {
      await tx.auditLog.create({
        data: {
          ticketId,
          actorId,
          action: AUDIT_ACTION.LABEL_ADD,
          newValue: JSON.stringify({ name: label.name, color: label.color }),
        },
      });
    }
    return ticketLabel;
  });
}

export async function removeFromTicketWithAudit(
  ticketId: number,
  labelId: string,
  actorId: number,
) {
  await prisma().$transaction(async (tx) => {
    const label = await tx.label.findUnique({ where: { id: labelId } });
    await tx.ticketLabel.delete({ where: { ticketId_labelId: { ticketId, labelId } } });
    if (label) {
      await tx.auditLog.create({
        data: {
          ticketId,
          actorId,
          action: AUDIT_ACTION.LABEL_REMOVE,
          oldValue: JSON.stringify({ name: label.name, color: label.color }),
        },
      });
    }
  });
}
