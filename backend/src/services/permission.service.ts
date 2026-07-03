import { getPrisma } from '../db.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import { emitTicketUpdate } from '../socket/events.js';

const prisma = () => getPrisma();

export async function approve(ticketId: number, actorId: number) {
  const ticket = await prisma().ticket.findUnique({
    where: { id: ticketId },
    include: { permissionRequest: true, author: true },
  });

  if (!ticket) throw new NotFoundError('议题不存在');
  if (ticket.template !== 'permission_request') throw new ValidationError('该议题不是权限申请类型');
  if (!ticket.permissionRequest) throw new ValidationError('该权限申请缺少必要数据');

  const updated = await prisma().ticket.update({
    where: { id: ticketId },
    data: { status: 'closed', closedAt: new Date() },
    include: { permissionRequest: true, author: true },
  });

  await prisma().auditLog.create({
    data: { ticketId, actorId, action: 'permission_approved', newValue: 'closed' },
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

export async function reject(ticketId: number, actorId: number, reason?: string) {
  const ticket = await prisma().ticket.findUnique({
    where: { id: ticketId },
    include: { permissionRequest: true, author: true },
  });

  if (!ticket) throw new NotFoundError('议题不存在');
  if (ticket.template !== 'permission_request') throw new ValidationError('该议题不是权限申请类型');

  const updated = await prisma().ticket.update({
    where: { id: ticketId },
    data: { status: 'invalid', closedAt: new Date() },
    include: { permissionRequest: true },
  });

  await prisma().auditLog.create({
    data: { ticketId, actorId, action: 'permission_invalid', newValue: reason || 'invalid' },
  });

  if (ticket.serverId) {
    emitTicketUpdate(ticket.serverId, 'permission:invalid', {
      ticketId,
      playerUuid: ticket.author.minecraftUuid,
      reason,
    });
  }

  return updated;
}

export async function reportExecution(ticketId: number, success: boolean, errorMessage?: string) {
  const status = success ? 'executed' : 'failed';

  await prisma().permissionRequest.update({
    where: { ticketId },
    data: { executionStatus: status, executedAt: new Date(), errorMessage },
  });
}
