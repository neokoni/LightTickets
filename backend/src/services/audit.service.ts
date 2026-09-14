import { prisma } from '../db.js';
import type { Prisma } from '@prisma/client';
import type { AuditAction } from '../constants/audit-actions.js';
import { AUDIT_SETTLE_DELAY_MS } from '../constants/audit.js';
import { USER_BRIEF_SELECT } from './constants.js';
import * as ticketService from './ticket.service.js';

type AuditClient = Pick<Prisma.TransactionClient, 'auditLog' | 'auditLogPending'>;

export async function listByTicket(ticketId: number, viewer?: ticketService.TicketViewer) {
  await ticketService.assertTicketVisible(ticketId, viewer);
  return prisma().auditLog.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'asc' },
    include: { actor: { select: USER_BRIEF_SELECT } },
  });
}

interface QueueInput {
  ticketId: number;
  actorId: number;
  action: AuditAction;
  targetKey: string;
  oldValue?: string;
  newValue?: string;
  immediate?: boolean;
}

export async function queue(input: QueueInput, client: AuditClient = prisma()) {
  if (input.immediate) {
    return client.auditLog.create({
      data: {
        ticketId: input.ticketId,
        actorId: input.actorId,
        action: input.action,
        oldValue: input.oldValue,
        newValue: input.newValue,
      },
      include: { actor: { select: USER_BRIEF_SELECT } },
    });
  }

  const existing = await client.auditLogPending.findUnique({
    where: { ticketId_targetKey: { ticketId: input.ticketId, targetKey: input.targetKey } },
  });
  const oldValue = existing ? existing.oldValue : (input.oldValue ?? null);
  const newValue = input.newValue ?? null;

  if (oldValue === newValue) {
    if (existing) await client.auditLogPending.delete({ where: { id: existing.id } });
    return null;
  }

  const settlesAt = new Date(Date.now() + AUDIT_SETTLE_DELAY_MS);
  if (existing) {
    return client.auditLogPending.update({
      where: { id: existing.id },
      data: { actorId: input.actorId, action: input.action, newValue, settlesAt },
    });
  }

  return client.auditLogPending.create({
    data: {
      ticketId: input.ticketId,
      actorId: input.actorId,
      action: input.action,
      targetKey: input.targetKey,
      oldValue,
      newValue,
      settlesAt,
    },
  });
}

export async function create(
  ticketId: number,
  actorId: number,
  action: AuditAction,
  oldValue?: string,
  newValue?: string,
  client: AuditClient = prisma(),
) {
  return queue(
    { ticketId, actorId, action, targetKey: `${action}:${ticketId}`, oldValue, newValue },
    client,
  );
}

export async function settlePending(now = new Date(), limit = 100): Promise<number> {
  const pending = await prisma().auditLogPending.findMany({
    where: { settlesAt: { lte: now } },
    orderBy: { settlesAt: 'asc' },
    take: limit,
  });
  let settled = 0;
  for (const item of pending) {
    const didSettle = await prisma().$transaction(async (tx) => {
      const deleted = await tx.auditLogPending.deleteMany({
        where: { id: item.id, settlesAt: { lte: now } },
      });
      if (deleted.count !== 1) return false;
      await tx.auditLog.create({
        data: {
          ticketId: item.ticketId,
          actorId: item.actorId,
          action: item.action,
          oldValue: item.oldValue,
          newValue: item.newValue,
        },
      });
      return true;
    });
    if (didSettle) settled++;
  }
  return settled;
}
