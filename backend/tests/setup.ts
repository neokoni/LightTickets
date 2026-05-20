import { PrismaClient } from '@prisma/client';
import { beforeEach } from 'vitest';

const prisma = new PrismaClient();

beforeEach(async () => {
  await prisma.auditLog.deleteMany();
  await prisma.ticketLabel.deleteMany();
  await prisma.attachment.deleteMany();
  await prisma.comment.deleteMany();
  await prisma.permissionRequest.deleteMany();
  await prisma.linkCode.deleteMany();
  await prisma.ticket.deleteMany();
  await prisma.label.deleteMany();
  await prisma.user.deleteMany();
  await prisma.server.deleteMany();
});

export { prisma };
