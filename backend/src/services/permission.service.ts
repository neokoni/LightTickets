import { PrismaClient } from '@prisma/client';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { emitTicketUpdate } from '../socket/events.js';

const prisma = new PrismaClient();

export async function approve(ticketId: number, actorId: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { permissionRequest: true, author: true },
  });

  if (!ticket) throw new NotFoundError('议题不存在');
  if (ticket.type !== 'permission_request') throw new ValidationError('该议题不是权限申请类型');
  if (!ticket.permissionRequest) throw new ValidationError('该权限申请缺少必要数据');

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

export async function reject(ticketId: number, actorId: string, reason?: string) {
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { permissionRequest: true, author: true },
  });

  if (!ticket) throw new NotFoundError('议题不存在');
  if (ticket.type !== 'permission_request') throw new ValidationError('该议题不是权限申请类型');

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

export async function reportExecution(ticketId: number, success: boolean, errorMessage?: string) {
  const status = success ? 'executed' : 'failed';

  await prisma.permissionRequest.update({
    where: { ticketId },
    data: { executionStatus: status, executedAt: new Date(), errorMessage },
  });
}
