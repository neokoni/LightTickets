import { describe, it, expect, beforeEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as attachmentService from '../src/services/attachment.service.js';
import { prisma } from './setup.js';
import { reinitStorageAdapter } from '../src/services/storage/index.js';
import { resolveUploadDir } from '../src/paths.js';
import { DEFAULT_ATTACHMENT_CONFIG, MEBIBYTE_BYTES } from '../src/constants/upload.js';
import { LocalStorageAdapter } from '../src/services/storage/local.adapter.js';
import { AttachmentStatus } from '@prisma/client';
import crypto from 'crypto';
import * as attachmentConfigService from '../src/services/attachment-config.service.js';

describe('attachment.service', () => {
  beforeEach(async () => {
    await prisma().appConfig.deleteMany();
    await prisma().appConfig.create({ data: {} });
    reinitStorageAdapter();
  });

  it('saves an uploaded file and creates its attachment row', async () => {
    const user = await prisma().user.create({
      data: {
        email: 'attachment-service@test.com',
        passwordHash: 'hash',
        username: 'attachmentservice',
      },
    });

    const before = Date.now();
    const attachment = await attachmentService.saveUploadedFile({
      file: {
        buffer: Buffer.from('hello'),
        originalname: 'hello.txt',
        mimetype: 'text/plain',
        size: 5,
      },
      uploadedBy: user.id,
    });

    const config = await prisma().appConfig.findFirst();
    const filePath = path.resolve(resolveUploadDir(config!.uploadDir), attachment.path);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello');
    expect(attachment.filename).toBe('hello.txt');
    expect(attachment.mimeType).toBe('text/plain');
    expect(attachment.storageType).toBe('local');
    expect(attachment.status).toBe('pending');
    expect(attachment.expiresAt?.getTime()).toBeGreaterThanOrEqual(
      before + DEFAULT_ATTACHMENT_CONFIG.pendingTtlDays * 24 * 60 * 60 * 1_000,
    );
    expect(path.extname(attachment.path)).toBe('');
  });

  it('rejects an unsupported MIME type when called outside the upload middleware', async () => {
    const user = await prisma().user.create({
      data: {
        email: 'attachment-unsupported@test.com',
        passwordHash: 'hash',
        username: 'attachmentunsupported',
      },
    });

    await expect(
      attachmentService.saveUploadedFile({
        file: {
          buffer: Buffer.from('<html>'),
          originalname: 'payload.html',
          mimetype: 'text/html',
          size: 6,
        },
        uploadedBy: user.id,
      }),
    ).rejects.toThrow('不支持的文件类型');
  });

  it('deletes an attachment row and its stored file', async () => {
    const user = await prisma().user.create({
      data: {
        email: 'attachment-delete-service@test.com',
        passwordHash: 'hash',
        username: 'attachmentdelete',
      },
    });
    const attachment = await attachmentService.saveUploadedFile({
      file: {
        buffer: Buffer.from('bye'),
        originalname: 'bye.txt',
        mimetype: 'text/plain',
        size: 3,
      },
      uploadedBy: user.id,
    });
    const config = await prisma().appConfig.findFirst();
    const filePath = path.resolve(resolveUploadDir(config!.uploadDir), attachment.path);
    expect(fs.existsSync(filePath)).toBe(true);

    await attachmentService.deleteAttachment(attachment.id);

    expect(fs.existsSync(filePath)).toBe(false);
    const row = await prisma().attachment.findUnique({ where: { id: attachment.id } });
    expect(row).toBeNull();
  });

  it('removes the pending row and partial file when storage save fails', async () => {
    const user = await prisma().user.create({
      data: {
        email: 'attachment-save-failure@test.com',
        passwordHash: 'hash',
        username: 'attachmentsavefailure',
      },
    });
    const config = await prisma().appConfig.findFirst();
    const uploadDir = resolveUploadDir(config!.uploadDir);
    const before = new Set(await fs.promises.readdir(uploadDir));
    const originalSave = LocalStorageAdapter.prototype.save;
    const saveSpy = vi
      .spyOn(LocalStorageAdapter.prototype, 'save')
      .mockImplementation(async function (input) {
        await originalSave.call(this, input);
        throw new Error('simulated storage failure');
      });

    try {
      await expect(
        attachmentService.saveUploadedFile({
          file: {
            buffer: Buffer.from('partial'),
            originalname: 'partial.txt',
            mimetype: 'text/plain',
            size: 7,
          },
          uploadedBy: user.id,
        }),
      ).rejects.toThrow('simulated storage failure');
    } finally {
      saveSpy.mockRestore();
    }

    expect(await prisma().attachment.count()).toBe(0);
    expect(new Set(await fs.promises.readdir(uploadDir))).toEqual(before);
  });

  it('retains the pending row for cleanup when compensating storage deletion fails', async () => {
    const user = await prisma().user.create({
      data: {
        email: 'attachment-compensation-failure@test.com',
        passwordHash: 'hash',
        username: 'attachmentcompensationfailure',
      },
    });
    const originalSave = LocalStorageAdapter.prototype.save;
    const saveSpy = vi
      .spyOn(LocalStorageAdapter.prototype, 'save')
      .mockImplementation(async function (input) {
        await originalSave.call(this, input);
        throw new Error('simulated storage failure');
      });
    const deleteSpy = vi
      .spyOn(LocalStorageAdapter.prototype, 'delete')
      .mockRejectedValue(new Error('simulated compensation failure'));

    try {
      await expect(
        attachmentService.saveUploadedFile({
          file: {
            buffer: Buffer.from('retryable'),
            originalname: 'retryable.txt',
            mimetype: 'text/plain',
            size: 9,
          },
          uploadedBy: user.id,
        }),
      ).rejects.toThrow('simulated storage failure');
    } finally {
      saveSpy.mockRestore();
      deleteSpy.mockRestore();
    }

    const pending = await prisma().attachment.findFirst({ where: { uploadedBy: user.id } });
    expect(pending?.status).toBe(AttachmentStatus.pending);
    expect(pending?.expiresAt).not.toBeNull();

    await attachmentService.deleteAttachment(pending!.id);
  });

  it('enforces configurable bytes without limiting the pending attachment count', async () => {
    await attachmentConfigService.updateAttachmentConfig({
      pendingQuotaMiB: 1,
      pendingTtlDays: 2,
    });
    const manyUser = await prisma().user.create({
      data: { email: 'quota-many@test.com', passwordHash: 'hash', username: 'quotamany' },
    });
    const byteUser = await prisma().user.create({
      data: { email: 'quota-bytes@test.com', passwordHash: 'hash', username: 'quotabytes' },
    });
    const expiresAt = new Date(Date.now() + 2 * 24 * 60 * 60 * 1_000);
    await prisma().attachment.createMany({
      data: Array.from({ length: 11 }, () => ({
        id: crypto.randomUUID(),
        filename: 'reserved.txt',
        path: crypto.randomUUID(),
        mimeType: 'text/plain',
        size: 1,
        storageType: 'local',
        status: AttachmentStatus.pending,
        expiresAt,
        uploadedBy: manyUser.id,
      })),
    });
    await prisma().attachment.create({
      data: {
        filename: 'reserved.txt',
        path: crypto.randomUUID(),
        mimeType: 'text/plain',
        size: MEBIBYTE_BYTES,
        storageType: 'local',
        status: AttachmentStatus.pending,
        expiresAt,
        uploadedBy: byteUser.id,
      },
    });
    const input = (uploadedBy: number) => ({
      file: {
        buffer: Buffer.from('x'),
        originalname: 'over-quota.txt',
        mimetype: 'text/plain',
        size: 1,
      },
      uploadedBy,
    });

    const twelfth = await attachmentService.saveUploadedFile(input(manyUser.id));
    expect(twelfth.expiresAt?.getTime()).toBeGreaterThanOrEqual(
      Date.now() + 2 * 24 * 60 * 60 * 1_000 - 1_000,
    );
    await expect(attachmentService.saveUploadedFile(input(byteUser.id))).rejects.toThrow(
      '待关联附件已达到配额',
    );
    await attachmentService.deleteAttachment(twelfth.id);
  });

  it('keeps non-expiring pending attachments in quota and out of cleanup', async () => {
    await attachmentConfigService.updateAttachmentConfig({
      pendingQuotaMiB: 1,
      pendingExpirationEnabled: false,
    });
    const user = await prisma().user.create({
      data: {
        email: 'quota-no-expiry@test.com',
        passwordHash: 'hash',
        username: 'quotanoexpiry',
      },
    });
    const input = (size: number) => ({
      file: {
        buffer: Buffer.alloc(size, 1),
        originalname: 'no-expiry.txt',
        mimetype: 'text/plain',
        size,
      },
      uploadedBy: user.id,
    });

    const attachment = await attachmentService.saveUploadedFile(input(MEBIBYTE_BYTES));
    expect(attachment.expiresAt).toBeNull();
    await expect(attachmentService.saveUploadedFile(input(1))).rejects.toThrow(
      '待关联附件已达到配额',
    );
    await expect(
      attachmentService.cleanupExpiredOrphanAttachments(
        new Date(Date.now() + 366 * 24 * 60 * 60 * 1_000),
      ),
    ).resolves.toBe(0);
    expect(await prisma().attachment.findUnique({ where: { id: attachment.id } })).not.toBeNull();

    await attachmentService.deleteAttachment(attachment.id);
  });

  it('deletes expired files so their bytes become available again', async () => {
    await attachmentConfigService.updateAttachmentConfig({ pendingQuotaMiB: 1 });
    const user = await prisma().user.create({
      data: { email: 'quota-expired@test.com', passwordHash: 'hash', username: 'quotaexpired' },
    });
    const expired = await attachmentService.saveUploadedFile({
      file: {
        buffer: Buffer.alloc(MEBIBYTE_BYTES, 1),
        originalname: 'expired.txt',
        mimetype: 'text/plain',
        size: MEBIBYTE_BYTES,
      },
      uploadedBy: user.id,
    });
    const now = new Date();
    await prisma().attachment.update({
      where: { id: expired.id },
      data: { expiresAt: new Date(now.getTime() - 1) },
    });

    const replacement = await attachmentService.saveUploadedFile({
      file: {
        buffer: Buffer.from('replacement'),
        originalname: 'replacement.txt',
        mimetype: 'text/plain',
        size: 11,
      },
      uploadedBy: user.id,
    });
    await expect(attachmentService.cleanupExpiredOrphanAttachments(now)).resolves.toBe(1);
    expect(await prisma().attachment.findUnique({ where: { id: expired.id } })).toBeNull();
    expect(await prisma().attachment.findUnique({ where: { id: replacement.id } })).not.toBeNull();

    await attachmentService.deleteAttachment(replacement.id);
  });

  it('deletes expired orphan rows and files but retains fresh orphans', async () => {
    const user = await prisma().user.create({
      data: {
        email: 'attachment-cleanup@test.com',
        passwordHash: 'hash',
        username: 'attachmentcleanup',
      },
    });
    const oldAttachment = await attachmentService.saveUploadedFile({
      file: {
        buffer: Buffer.from('old'),
        originalname: 'old.txt',
        mimetype: 'text/plain',
        size: 3,
      },
      uploadedBy: user.id,
    });
    const freshAttachment = await attachmentService.saveUploadedFile({
      file: {
        buffer: Buffer.from('fresh'),
        originalname: 'fresh.txt',
        mimetype: 'text/plain',
        size: 5,
      },
      uploadedBy: user.id,
    });
    const now = new Date();
    await prisma().attachment.update({
      where: { id: oldAttachment.id },
      data: { expiresAt: new Date(now.getTime() - 1) },
    });
    const config = await prisma().appConfig.findFirst();
    const uploadDir = resolveUploadDir(config!.uploadDir);
    const oldPath = path.resolve(uploadDir, oldAttachment.path);
    const freshPath = path.resolve(uploadDir, freshAttachment.path);

    await expect(attachmentService.cleanupExpiredOrphanAttachments(now)).resolves.toBe(1);

    expect(await prisma().attachment.findUnique({ where: { id: oldAttachment.id } })).toBeNull();
    expect(
      await prisma().attachment.findUnique({ where: { id: freshAttachment.id } }),
    ).not.toBeNull();
    expect(fs.existsSync(oldPath)).toBe(false);
    expect(fs.existsSync(freshPath)).toBe(true);
  });
});
