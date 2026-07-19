import type { Prisma } from '@prisma/client';

export const USER_PUBLIC_SELECT = {
  id: true,
  email: true,
  username: true,
  minecraftUuid: true,
  minecraftName: true,
  avatarUrl: true,
  receiveEmailNotifications: true,
  role: true,
  createdAt: true,
  updatedAt: true,
} satisfies Prisma.UserSelect;

export const USER_BRIEF_SELECT = {
  id: true,
  username: true,
  minecraftName: true,
} satisfies Prisma.UserSelect;

export const USER_BRIEF_WITH_AVATAR = {
  id: true,
  username: true,
  minecraftName: true,
  minecraftUuid: true,
  avatarUrl: true,
} satisfies Prisma.UserSelect;

export const TICKET_INCLUDE_BASE = {
  author: { select: USER_BRIEF_SELECT },
  labels: { include: { label: true } },
} satisfies Prisma.TicketInclude;

export const TICKET_INCLUDE_DETAIL = {
  author: { select: USER_BRIEF_SELECT },
  assignees: { include: { user: { select: { id: true, username: true, avatarUrl: true } } } },
  labels: { include: { label: true } },
  _count: { select: { comments: true } },
} satisfies Prisma.TicketInclude;
