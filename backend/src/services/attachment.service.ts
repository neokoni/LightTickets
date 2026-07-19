import { prisma } from '../db.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import crypto from 'crypto';
import path from 'path';
import { getStorageAdapter } from './storage/index.js';
import type { Response } from 'express';
import * as ticketService from './ticket.service.js';

const MAGIC_BYTES: Record<string, number[][]> = {
  'image/png': [[0x89, 0x50, 0x4e, 0x47]],
  'image/jpeg': [[0xff, 0xd8, 0xff]],
  'image/gif': [[0x47, 0x49, 0x46, 0x38]],
  'image/webp': [[0x52, 0x49, 0x46, 0x46]],
  'application/pdf': [[0x25, 0x50, 0x44, 0x46]],
  'text/plain': [],
};

function validateMagicBytes(buffer: Buffer, mimeType: string): void {
  const signatures = MAGIC_BYTES[mimeType];
  if (!signatures || signatures.length === 0) return;
  const matches = signatures.some((sig) => sig.every((byte, i) => buffer[i] === byte));
  if (!matches) {
    throw new ValidationError('文件内容与声明类型不匹配');
  }
}

type UploadedFileInput = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

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

export async function saveUploadedFile(input: {
  file: UploadedFileInput;
  uploadedBy: number;
  ticketId?: number;
  commentId?: string;
  userRole?: string;
}) {
  validateMagicBytes(input.file.buffer, input.file.mimetype);
  if (input.ticketId) {
    await ticketService.assertTicketVisible(input.ticketId, {
      userId: input.uploadedBy,
      role: input.userRole ?? 'player',
    });
  }
  if (input.commentId) {
    const comment = await prisma().comment.findUnique({
      where: { id: input.commentId },
      select: { id: true, ticketId: true },
    });
    if (!comment) throw new NotFoundError('评论不存在');
    await ticketService.assertTicketVisible(comment.ticketId, {
      userId: input.uploadedBy,
      role: input.userRole ?? 'player',
    });
  }

  const ext = path.extname(input.file.originalname);
  const key = crypto.randomUUID() + ext;
  const adapter = await getStorageAdapter();
  await adapter.save({
    buffer: input.file.buffer,
    key,
    mimeType: input.file.mimetype,
  });

  return create({
    filename: input.file.originalname,
    path: key,
    mimeType: input.file.mimetype,
    size: input.file.size,
    storageType: adapter.type,
    uploadedBy: input.uploadedBy,
    ticketId: input.ticketId,
    commentId: input.commentId,
  });
}

export async function getById(id: string) {
  const attachment = await prisma().attachment.findUnique({ where: { id } });
  if (!attachment) throw new NotFoundError('附件不存在');
  return attachment;
}

export async function deleteById(id: string) {
  await prisma().attachment.delete({ where: { id } });
}

export async function deleteAttachment(id: string) {
  const attachment = await getById(id);
  const adapter = await getStorageAdapter();
  await adapter.delete(attachment.path);
  await deleteById(id);
}

export async function listByTicket(ticketId: number, viewer?: ticketService.TicketViewer) {
  await ticketService.assertTicketVisible(ticketId, viewer);
  return prisma().attachment.findMany({
    where: { ticketId },
    orderBy: { createdAt: 'desc' },
  });
}

async function getVisibleAttachment(id: string, viewer?: ticketService.TicketViewer) {
  const attachment = await prisma().attachment.findUnique({
    where: { id },
    include: { comment: { select: { ticketId: true } } },
  });
  if (!attachment) throw new NotFoundError('附件不存在');
  const ticketId = attachment.ticketId ?? attachment.comment?.ticketId;
  if (ticketId !== undefined && ticketId !== null) {
    await ticketService.assertTicketVisible(ticketId, viewer);
  }
  return attachment;
}

export async function assertAttachmentVisible(id: string, viewer?: ticketService.TicketViewer) {
  return getVisibleAttachment(id, viewer);
}

export async function serve(id: string, res: Response, viewer?: ticketService.TicketViewer) {
  const attachment = await getVisibleAttachment(id, viewer);
  const adapter = await getStorageAdapter();
  await adapter.serve(res, attachment.path, attachment.filename);
}

export async function cleanupTicketAttachments(ticketId: number): Promise<void> {
  const attachments = await prisma().attachment.findMany({
    where: { OR: [{ ticketId }, { comment: { ticketId } }] },
  });
  const adapter = await getStorageAdapter();
  for (const att of attachments) {
    try {
      await adapter.delete(att.path);
    } catch (err) {
      console.warn(`[cleanup] Failed to delete file ${att.path}:`, err);
    }
  }
}

export async function cleanupCommentAttachments(commentId: string): Promise<void> {
  const attachments = await prisma().attachment.findMany({
    where: { commentId },
  });
  const adapter = await getStorageAdapter();
  for (const att of attachments) {
    try {
      await adapter.delete(att.path);
    } catch (err) {
      console.warn(`[cleanup] Failed to delete file ${att.path}:`, err);
    }
  }
}
