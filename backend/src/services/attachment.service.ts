import { prisma } from '../db.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import crypto from 'crypto';
import { getStorageAdapter } from './storage/index.js';
import type { Response } from 'express';
import * as ticketService from './ticket.service.js';
import { ORPHAN_ATTACHMENT_TTL_MS, UPLOAD_TYPE_BY_MIME } from '../constants/upload.js';
import { isAdminRole } from '../constants/roles.js';

function validateMagicBytes(buffer: Buffer, mimeType: string): void {
  const definition = UPLOAD_TYPE_BY_MIME.get(mimeType);
  if (!definition) throw new ValidationError('不支持的文件类型');
  if (definition.magicBytes.length === 0) return;
  const matches = definition.magicBytes.some((signature) =>
    signature.every((byte, index) => buffer[index] === byte),
  );
  if (!matches) {
    throw new ValidationError('文件内容与声明类型不匹配');
  }
}

function encodeContentDispositionFilename(filename: string): string {
  const encoded = encodeURIComponent(filename).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
  return `attachment; filename*=UTF-8''${encoded}`;
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

  const key = crypto.randomUUID();
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
  } else if (
    viewer?.userId !== attachment.uploadedBy &&
    (viewer?.role === undefined || !isAdminRole(viewer.role))
  ) {
    throw new NotFoundError('附件不存在');
  }
  return attachment;
}

export async function assertAttachmentVisible(id: string, viewer?: ticketService.TicketViewer) {
  return getVisibleAttachment(id, viewer);
}

export async function serve(id: string, res: Response, viewer?: ticketService.TicketViewer) {
  const attachment = await getVisibleAttachment(id, viewer);
  const uploadType = UPLOAD_TYPE_BY_MIME.get(attachment.mimeType);
  const adapter = await getStorageAdapter();
  await adapter.serve(res, {
    key: attachment.path,
    mimeType: uploadType?.mimeType ?? 'application/octet-stream',
    contentDisposition: uploadType?.inline
      ? 'inline'
      : encodeContentDispositionFilename(attachment.filename),
  });
}

export async function cleanupExpiredOrphanAttachments(now = new Date()): Promise<number> {
  const cutoff = new Date(now.getTime() - ORPHAN_ATTACHMENT_TTL_MS);
  const attachments = await prisma().attachment.findMany({
    where: { ticketId: null, commentId: null, createdAt: { lte: cutoff } },
    select: { id: true, path: true },
  });
  if (attachments.length === 0) return 0;

  const adapter = await getStorageAdapter();
  let deleted = 0;
  for (const attachment of attachments) {
    const result = await prisma().attachment.deleteMany({
      where: {
        id: attachment.id,
        ticketId: null,
        commentId: null,
        createdAt: { lte: cutoff },
      },
    });
    if (result.count === 0) continue;

    deleted += 1;
    try {
      await adapter.delete(attachment.path);
    } catch {
      console.warn(`[attachments] Failed to delete expired orphan file ${attachment.id}`);
    }
  }
  return deleted;
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
