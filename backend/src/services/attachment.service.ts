import { getPrisma } from '../db.js';
import { NotFoundError } from '../utils/errors.js';

const prisma = () => getPrisma();

interface CreateAttachmentInput {
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  storageType: string;
  uploadedBy: number;
  ticketId?: number;
  commentId?: string;
}

export async function create(input: CreateAttachmentInput) {
  return prisma().attachment.create({ data: input });
}

export async function getById(id: string) {
  const attachment = await prisma().attachment.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError('附件不存在');
  return attachment;
}

export async function deleteById(id: string) {
  await prisma().attachment.delete({ where: { id } });
}

export async function listByTicket(ticketId: number) {
  return prisma().attachment.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'desc' },
  });
}
