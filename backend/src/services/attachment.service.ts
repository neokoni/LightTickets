import { PrismaClient } from '@prisma/client';
import { NotFoundError } from '../utils/errors.js';

const prisma = new PrismaClient();

interface CreateAttachmentInput {
  filename: string;
  path: string;
  mimeType: string;
  size: number;
  uploadedBy: string;
  ticketId?: string;
  commentId?: string;
}

export async function create(input: CreateAttachmentInput) {
  return prisma.attachment.create({ data: input });
}

export async function getById(id: string) {
  const attachment = await prisma.attachment.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError('附件不存在');
  return attachment;
}
