import { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { emitTicketUpdate } from '../socket/events.js';

const prisma = new PrismaClient();

export async function approve(ticketId: string, actorId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { permissionRequest: true, author: true },
  });

  if (!ticket) throw new NotFoundError('Ticket not found');
  if (ticket.type !== 'permission_request') throw new ValidationError('Not a permission request');
  if (!ticket.permissionRequest) throw new ValidationError('No permission request data');

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: 'resolved', closedAt: new Date() },
    include: { permissionRequest: true, author: true },
  });

  await prisma.auditLog.create({
    data: { ticketId, actorId, action: 'permission_approved', newValue: 'resolved' },
  });

  if (ticket.serverId) {
    emitTicketUpdate(ticket.serverId, 'permission:approved', {
      ticketId,
      playerUuid: ticket.author.minecraftUuid,
      permissionNode: ticket.permissionRequest.permissionNode,
      groupName: ticket.permissionRequest.groupName,
    });
  }

  return updated;
}

export async function reject(ticketId: string, actorId: string, reason?: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { permissionRequest: true, author: true },
  });

  if (!ticket) throw new NotFoundError('Ticket not found');
  if (ticket.type !== 'permission_request') throw new ValidationError('Not a permission request');

  const updated = await prisma.ticket.update({
    where: { id: ticketId },
    data: { status: 'rejected', closedAt: new Date() },
    include: { permissionRequest: true },
  });

  await prisma.auditLog.create({
    data: { ticketId, actorId, action: 'permission_rejected', newValue: reason || 'rejected' },
  });

  if (ticket.serverId) {
    emitTicketUpdate(ticket.serverId, 'permission:rejected', {
      ticketId,
      playerUuid: ticket.author.minecraftUuid,
      reason,
    });
  }

  return updated;
}

export async function reportExecution(ticketId: string, success: boolean, errorMessage?: string) {
  const status = success ? 'executed' : 'failed';

  await prisma.permissionRequest.update({
    where: { ticketId },
    data: { executionStatus: status, executedAt: new Date(), errorMessage },
  });
}
