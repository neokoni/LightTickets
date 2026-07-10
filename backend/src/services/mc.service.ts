import { CommentSource, type TicketStatus } from '@prisma/client';
import { getConfig } from '../config.js';
import { prisma } from '../db.js';
import { AppError, NotFoundError } from '../utils/errors.js';
import { generateLinkCode } from '../utils/link-code.js';
import { USER_PUBLIC_SELECT } from './constants.js';
import * as authService from './auth.service.js';
import * as commentService from './comment.service.js';
import * as ticketService from './ticket.service.js';

export async function createLinkCode(input: {
  minecraftUuid: string;
  minecraftName: string;
  serverId: string;
}) {
  const existing = await prisma().user.findUnique({
    where: { minecraftUuid: input.minecraftUuid },
  });
  if (existing) throw new AppError(409, '该Minecraft账号已绑定到账户');

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + getConfig().linkCodeExpiry);
  const linkCode = await prisma().linkCode.create({
    data: {
      code,
      minecraftUuid: input.minecraftUuid,
      minecraftName: input.minecraftName,
      serverId: input.serverId,
      expiresAt,
    },
  });

  return { code: linkCode.code, expiresAt: linkCode.expiresAt };
}

export async function getLinkedUser(minecraftUuid: string) {
  const user = await prisma().user.findUnique({
    where: { minecraftUuid },
    select: USER_PUBLIC_SELECT,
  });
  if (!user) throw new NotFoundError('该 Minecraft 账号未绑定');
  return user;
}

export async function createTicketFromMinecraft(input: {
  minecraftUuid: string;
  title: string;
  body: string;
  template: string;
  formData?: Record<string, string>;
  context?: Record<string, unknown>;
  serverId: string;
}) {
  const user = await prisma().user.findUnique({ where: { minecraftUuid: input.minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked to any account');

  return ticketService.create({
    title: input.title,
    body: input.body,
    template: input.template,
    formData: input.formData || {},
    authorId: user.id,
    serverId: input.serverId,
    gameContext: input.context ? JSON.stringify(input.context) : undefined,
  });
}

export async function createCommentFromMinecraft(input: {
  minecraftUuid: string;
  ticketId: number;
  body: string;
}) {
  const user = await prisma().user.findUnique({ where: { minecraftUuid: input.minecraftUuid } });
  if (!user) throw new NotFoundError('该 Minecraft 账号未绑定');

  return commentService.create(input.ticketId, user.id, input.body, CommentSource.minecraft);
}

export async function closeTicketFromMinecraft(ticketId: number, minecraftUuid: string) {
  const user = await prisma().user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('该 Minecraft 账号未绑定');

  return ticketService.closeTicket(ticketId, user.id, user.role);
}

export async function reopenTicketFromMinecraft(ticketId: number, minecraftUuid: string) {
  const user = await prisma().user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('该 Minecraft 账号未绑定');

  return ticketService.reopenTicket(ticketId, user.id, user.role);
}

export async function updateTicketStatusFromMinecraft(
  ticketId: number,
  input: { minecraftUuid: string; status: TicketStatus },
) {
  const user = await prisma().user.findUnique({ where: { minecraftUuid: input.minecraftUuid } });
  if (!user) throw new NotFoundError('该 Minecraft 账号未绑定');

  return ticketService.update(ticketId, user.id, user.role, { status: input.status });
}

export const unlinkMinecraftByUuid = authService.unlinkMinecraftByUuid;
