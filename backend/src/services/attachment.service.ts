import { prisma } from '../db.js';
import { AppError, ForbiddenError, NotFoundError, ValidationError } from '../utils/errors.js';
import crypto from 'crypto';
import { getStorageAdapter } from './storage/index.js';
import type { Response } from 'express';
import * as ticketService from './ticket.service.js';
import { MEBIBYTE_BYTES, UPLOAD_TYPE_BY_MIME } from '../constants/upload.js';
import { isAdminRole, isStaffRole } from '../constants/roles.js';
import { AttachmentStatus, Prisma } from '@prisma/client';
import * as attachmentConfigService from './attachment-config.service.js';

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
  expiresAt: Date | null;
}

async function reservePendingAttachment(input: CreateAttachmentInput, pendingQuotaBytes: number) {
  const now = new Date();
  const run = () =>
    prisma().$transaction(
      async (tx) => {
        const pending = await tx.attachment.aggregate({
          where: {
            uploadedBy: input.uploadedBy,
            status: AttachmentStatus.pending,
            OR: [{ expiresAt: null }, { expiresAt: { gt: now } }],
          },
          _sum: { size: true },
        });
        const pendingBytes = pending._sum.size ?? 0;
        if (pendingBytes + input.size > pendingQuotaBytes) {
          throw new ValidationError('待关联附件已达到配额，请先完成议题或删除未使用的附件');
        }

        return tx.attachment.create({
          data: { ...input, status: AttachmentStatus.pending },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

  try {
    return await run();
  } catch (error) {
    // Concurrent inserts under Serializable isolation can surface as a write
    // conflict (P2034). Retry once so the caller sees a clean quota result
    // instead of a 500.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') {
      return await run();
    }
    throw error;
  }
}

async function assertCanAttachToExistingObject(input: {
  ticketId?: number;
  commentId?: string;
  uploadedBy: number;
  userRole: string;
}): Promise<void> {
  if (input.ticketId !== undefined && input.commentId !== undefined) {
    throw new ValidationError('ticketId 和 commentId 不能同时提供');
  }
  if (input.ticketId !== undefined) {
    const ticket = await ticketService.assertTicketVisible(input.ticketId, {
      userId: input.uploadedBy,
      role: input.userRole,
    });
    if (ticket.authorId !== input.uploadedBy && !isStaffRole(input.userRole)) {
      throw new ForbiddenError('只有议题作者或管理组可以向该议题上传附件');
    }
  }
  if (input.commentId !== undefined) {
    const comment = await prisma().comment.findUnique({
      where: { id: input.commentId },
      select: { id: true, ticketId: true, authorId: true },
    });
    if (!comment) throw new NotFoundError('评论不存在');
    await ticketService.assertTicketVisible(comment.ticketId, {
      userId: input.uploadedBy,
      role: input.userRole,
    });
    if (comment.authorId !== input.uploadedBy && !isStaffRole(input.userRole)) {
      throw new ForbiddenError('只有评论作者或管理组可以向该评论上传附件');
    }
  }
}

async function compensateFailedUpload(
  attachmentId: string,
  key: string,
  adapter: Awaited<ReturnType<typeof getStorageAdapter>>,
): Promise<void> {
  try {
    await adapter.delete(key);
  } catch {
    console.warn(`[attachments] Failed to compensate stored file ${attachmentId}`);
    return;
  }
  try {
    await prisma().attachment.deleteMany({ where: { id: attachmentId } });
  } catch {
    console.warn(`[attachments] Failed to compensate attachment row ${attachmentId}`);
  }
}

export async function saveUploadedFile(input: {
  file: UploadedFileInput;
  uploadedBy: number;
  ticketId?: number;
  commentId?: string;
  userRole?: string;
}) {
  validateMagicBytes(input.file.buffer, input.file.mimetype);
  await assertCanAttachToExistingObject({
    ticketId: input.ticketId,
    commentId: input.commentId,
    uploadedBy: input.uploadedBy,
    userRole: input.userRole ?? 'player',
  });

  const key = crypto.randomUUID();
  const adapter = await getStorageAdapter();
  const attachmentConfig = await attachmentConfigService.getAttachmentConfig();
  const attachment = await reservePendingAttachment(
    {
      filename: input.file.originalname,
      path: key,
      mimeType: input.file.mimetype,
      size: input.file.size,
      storageType: adapter.type,
      uploadedBy: input.uploadedBy,
      expiresAt: attachmentConfig.pendingExpirationEnabled
        ? new Date(Date.now() + attachmentConfig.pendingTtlDays * 24 * 60 * 60 * 1_000)
        : null,
    },
    attachmentConfig.pendingQuotaMiB * MEBIBYTE_BYTES,
  );

  try {
    await adapter.save({
      buffer: input.file.buffer,
      key,
      mimeType: input.file.mimetype,
    });

    if (input.ticketId === undefined && input.commentId === undefined) return attachment;
    return await prisma().attachment.update({
      where: { id: attachment.id },
      data: {
        status: AttachmentStatus.attached,
        expiresAt: null,
        ticketId: input.ticketId,
        commentId: input.commentId,
      },
    });
  } catch (error) {
    await compensateFailedUpload(attachment.id, key, adapter);
    throw error;
  }
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
  const adapter = await getStorageAdapter(attachment.storageType);
  await adapter.delete(attachment.path);
  await deleteById(id);
}

export async function listByTicket(ticketId: number, viewer?: ticketService.TicketViewer) {
  await ticketService.assertTicketVisible(ticketId, viewer);
  return prisma().attachment.findMany({
    where: { ticketId, status: AttachmentStatus.attached },
    orderBy: { createdAt: 'desc' },
  });
}

async function getVisibleAttachment(id: string, viewer?: ticketService.TicketViewer) {
  const attachment = await prisma().attachment.findUnique({
    where: { id },
    include: { comment: { select: { ticketId: true } } },
  });
  if (!attachment) throw new NotFoundError('附件不存在');
  if (
    attachment.status === AttachmentStatus.deleting ||
    (attachment.status === AttachmentStatus.pending &&
      attachment.expiresAt !== null &&
      attachment.expiresAt <= new Date())
  ) {
    throw new NotFoundError('附件不存在');
  }
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
  const adapter = await getStorageAdapter(attachment.storageType);
  await adapter.serve(res, {
    key: attachment.path,
    mimeType: uploadType?.mimeType ?? 'application/octet-stream',
    contentDisposition: uploadType?.inline
      ? 'inline'
      : encodeContentDispositionFilename(attachment.filename),
  });
}

export async function cleanupExpiredOrphanAttachments(now = new Date()): Promise<number> {
  const attachments = await prisma().attachment.findMany({
    where: {
      ticketId: null,
      commentId: null,
      OR: [
        { status: AttachmentStatus.pending, expiresAt: { lte: now } },
        { status: AttachmentStatus.deleting },
      ],
    },
    select: { id: true, path: true, storageType: true },
  });
  if (attachments.length === 0) return 0;

  let deleted = 0;
  for (const attachment of attachments) {
    const claimed = await prisma().attachment.updateMany({
      where: {
        id: attachment.id,
        ticketId: null,
        commentId: null,
        OR: [
          { status: AttachmentStatus.pending, expiresAt: { lte: now } },
          { status: AttachmentStatus.deleting },
        ],
      },
      data: { status: AttachmentStatus.deleting },
    });
    if (claimed.count === 0) continue;

    try {
      const adapter = await getStorageAdapter(attachment.storageType);
      await adapter.delete(attachment.path);
      const result = await prisma().attachment.deleteMany({
        where: {
          id: attachment.id,
          status: AttachmentStatus.deleting,
          ticketId: null,
          commentId: null,
        },
      });
      deleted += result.count;
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
  for (const att of attachments) {
    const adapter = await getStorageAdapter(att.storageType);
    await adapter.delete(att.path);
  }
}

export async function cleanupCommentAttachments(commentId: string): Promise<void> {
  await prisma().attachment.updateMany({
    where: { commentId, status: { not: AttachmentStatus.deleting } },
    data: { status: AttachmentStatus.deleting },
  });
  const attachments = await prisma().attachment.findMany({
    where: { commentId, status: AttachmentStatus.deleting },
  });
  const failures: string[] = [];
  for (const att of attachments) {
    try {
      const adapter = await getStorageAdapter(att.storageType);
      await adapter.delete(att.path);
      await prisma().attachment.deleteMany({
        where: { id: att.id, commentId, status: AttachmentStatus.deleting },
      });
    } catch (error) {
      failures.push(att.id);
      console.warn(`[attachments] Failed to delete comment attachment ${att.id}`, error);
    }
  }
  if (failures.length > 0) {
    throw new AppError(503, '评论附件清理失败，请稍后重试');
  }
}
