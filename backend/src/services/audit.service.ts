import { prisma } from '../db.js';
import { Prisma } from '@prisma/client';
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

  // A concurrent queue for the same target may race between find and write.
  // Retry once using current-read writes so the operation remains idempotent on
  // unique, stale-row, and transaction-conflict errors.
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      if (attempt === 1) {
        // MariaDB's default REPEATABLE READ can keep findUnique on the original
        // snapshot. These writes use current reads, so reconcile a row created
        // by the concurrent transaction without relying on that stale snapshot.
        const canceled = await client.auditLogPending.deleteMany({
          where: {
            ticketId: input.ticketId,
            targetKey: input.targetKey,
            oldValue: input.newValue ?? null,
          },
        });
        if (canceled.count > 0) return null;

        const updated = await client.auditLogPending.updateMany({
          where: { ticketId: input.ticketId, targetKey: input.targetKey },
          data: {
            actorId: input.actorId,
            action: input.action,
            newValue: input.newValue ?? null,
            settlesAt: new Date(Date.now() + AUDIT_SETTLE_DELAY_MS),
          },
        });
        if (updated.count > 0) return null;

        // No row was visible to the current-read update; create directly. If
        // another writer wins between these statements, the P2002 is surfaced
        // to the bounded retry guard rather than silently swallowed.
        return await client.auditLogPending.create({
          data: {
            ticketId: input.ticketId,
            actorId: input.actorId,
            action: input.action,
            targetKey: input.targetKey,
            oldValue: input.oldValue ?? null,
            newValue: input.newValue ?? null,
            settlesAt: new Date(Date.now() + AUDIT_SETTLE_DELAY_MS),
          },
        });
      }

      const existing = await client.auditLogPending.findUnique({
        where: { ticketId_targetKey: { ticketId: input.ticketId, targetKey: input.targetKey } },
      });
      const oldValue = existing ? existing.oldValue : (input.oldValue ?? null);
      const newValue = input.newValue ?? null;

      if (oldValue === newValue) {
        if (existing) {
          await client.auditLogPending.delete({ where: { id: existing.id } });
        }
        return null;
      }

      const settlesAt = new Date(Date.now() + AUDIT_SETTLE_DELAY_MS);
      if (existing) {
        // Await inside the retry scope so write rejections reach the catch block.
        return await client.auditLogPending.update({
          where: { id: existing.id },
          data: { actorId: input.actorId, action: input.action, newValue, settlesAt },
        });
      }

      return await client.auditLogPending.create({
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
    } catch (error) {
      const isRace =
        error instanceof Prisma.PrismaClientKnownRequestError &&
        (error.code === 'P2002' || error.code === 'P2025' || error.code === 'P2034');
      if (!isRace || attempt === 1) throw error;
    }
  }

  return null;
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
          createdAt: item.createdAt,
        },
      });
      return true;
    });
    if (didSettle) settled++;
  }
  return settled;
}
