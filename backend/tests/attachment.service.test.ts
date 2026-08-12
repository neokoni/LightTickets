import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fs from 'fs';
import path from 'path';
import type { Response } from 'express';
import * as attachmentService from '../src/services/attachment.service.js';
import { prisma } from './setup.js';
import { reinitStorageAdapter } from '../src/services/storage/index.js';
import { resolveUploadDir } from '../src/paths.js';
import { DEFAULT_ATTACHMENT_CONFIG, MEBIBYTE_BYTES } from '../src/constants/upload.js';
import { LocalStorageAdapter } from '../src/services/storage/local.adapter.js';
import { AttachmentStatus } from '@prisma/client';
import crypto from 'crypto';
import * as attachmentConfigService from '../src/services/attachment-config.service.js';
import { S3StorageAdapter } from '../src/services/storage/s3.adapter.js';

const S3_CONFIG = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'attachments',
  accessKeyId: 'access-key',
  secretAccessKey: 'secret-key',
  forcePathStyle: true,
  presignExpiry: 300,
};

describe('attachment.service', () => {
  beforeEach(async () => {
    await prisma().appConfig.deleteMany();
    await prisma().appConfig.create({ data: {} });
    reinitStorageAdapter();
  });

  afterEach(() => {
    vi.restoreAllMocks();
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

  it('serves and deletes a local attachment after the active driver switches to s3', async () => {
    const user = await prisma().user.create({
      data: {
        email: 'attachment-local-history@test.com',
        passwordHash: 'hash',
        username: 'attachmentlocalhistory',
      },
    });
    const attachment = await attachmentService.saveUploadedFile({
      file: {
        buffer: Buffer.from('local history'),
        originalname: 'local-history.txt',
        mimetype: 'text/plain',
        size: 13,
      },
      uploadedBy: user.id,
    });
    const config = await prisma().appConfig.findFirstOrThrow();
    const filePath = path.resolve(resolveUploadDir(config.uploadDir), attachment.path);
    await prisma().appConfig.update({
      where: { id: config.id },
      data: { storageDriver: 's3', s3Config: JSON.stringify(S3_CONFIG) },
    });
    reinitStorageAdapter();
    const localServe = vi
      .spyOn(LocalStorageAdapter.prototype, 'serve')
      .mockResolvedValue(undefined);
    const s3Serve = vi.spyOn(S3StorageAdapter.prototype, 'serve').mockResolvedValue(undefined);
    const s3Delete = vi.spyOn(S3StorageAdapter.prototype, 'delete').mockResolvedValue(undefined);

    await attachmentService.serve(attachment.id, {} as Response, {
      userId: user.id,
      role: 'player',
    });
    await attachmentService.deleteAttachment(attachment.id);

    expect(localServe).toHaveBeenCalledOnce();
    expect(s3Serve).not.toHaveBeenCalled();
    expect(s3Delete).not.toHaveBeenCalled();
    expect(fs.existsSync(filePath)).toBe(false);
    expect(await prisma().attachment.findUnique({ where: { id: attachment.id } })).toBeNull();
  });

  it('serves and deletes an s3 attachment after the active driver switches to local', async () => {
    const user = await prisma().user.create({
      data: {
        email: 'attachment-s3-history@test.com',
        passwordHash: 'hash',
        username: 'attachments3history',
      },
    });
    const config = await prisma().appConfig.findFirstOrThrow();
    await prisma().appConfig.update({
      where: { id: config.id },
      data: { storageDriver: 'local', s3Config: JSON.stringify(S3_CONFIG) },
    });
    const attachment = await prisma().attachment.create({
      data: {
        filename: 's3-history.txt',
        path: 's3-history-key',
        mimeType: 'text/plain',
        size: 10,
        storageType: 's3',
        uploadedBy: user.id,
      },
    });
    reinitStorageAdapter();
    const localServe = vi
      .spyOn(LocalStorageAdapter.prototype, 'serve')
      .mockResolvedValue(undefined);
    const localDelete = vi
      .spyOn(LocalStorageAdapter.prototype, 'delete')
      .mockResolvedValue(undefined);
    const s3Serve = vi.spyOn(S3StorageAdapter.prototype, 'serve').mockResolvedValue(undefined);
    const s3Delete = vi.spyOn(S3StorageAdapter.prototype, 'delete').mockResolvedValue(undefined);

    await attachmentService.serve(attachment.id, {} as Response, {
      userId: user.id,
      role: 'player',
    });
    await attachmentService.deleteAttachment(attachment.id);

    expect(s3Serve).toHaveBeenCalledOnce();
    expect(s3Delete).toHaveBeenCalledWith('s3-history-key');
    expect(localServe).not.toHaveBeenCalled();
    expect(localDelete).not.toHaveBeenCalled();
    expect(await prisma().attachment.findUnique({ where: { id: attachment.id } })).toBeNull();
  });

  it('fails closed when an attachment historical storage config is unavailable', async () => {
    const user = await prisma().user.create({
      data: {
        email: 'attachment-missing-storage@test.com',
        passwordHash: 'hash',
        username: 'attachmentmissingstorage',
      },
    });
    const attachment = await prisma().attachment.create({
      data: {
        filename: 'missing-s3.txt',
        path: 'missing-s3-key',
        mimeType: 'text/plain',
        size: 10,
        storageType: 's3',
        uploadedBy: user.id,
      },
    });

    await expect(attachmentService.deleteAttachment(attachment.id)).rejects.toThrow(
      'S3 附件存储配置不可用',
    );
    expect(await prisma().attachment.findUnique({ where: { id: attachment.id } })).not.toBeNull();
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

  it('cleans up expired local and s3 orphan attachments with their persisted adapters', async () => {
    const user = await prisma().user.create({
      data: {
        email: 'attachment-mixed-cleanup@test.com',
        passwordHash: 'hash',
        username: 'attachmentmixedcleanup',
      },
    });
    const localAttachment = await attachmentService.saveUploadedFile({
      file: {
        buffer: Buffer.from('expired local'),
        originalname: 'expired-local.txt',
        mimetype: 'text/plain',
        size: 13,
      },
      uploadedBy: user.id,
    });
    const now = new Date();
    const s3Attachment = await prisma().attachment.create({
      data: {
        filename: 'expired-s3.txt',
        path: 'expired-s3-key',
        mimeType: 'text/plain',
        size: 10,
        storageType: 's3',
        uploadedBy: user.id,
        expiresAt: new Date(now.getTime() - 1),
      },
    });
    const config = await prisma().appConfig.findFirstOrThrow();
    await prisma().appConfig.update({
      where: { id: config.id },
      data: { s3Config: JSON.stringify(S3_CONFIG) },
    });
    await prisma().attachment.update({
      where: { id: localAttachment.id },
      data: { expiresAt: new Date(now.getTime() - 1) },
    });
    const localPath = path.resolve(resolveUploadDir(config.uploadDir), localAttachment.path);
    reinitStorageAdapter();
    const s3Delete = vi.spyOn(S3StorageAdapter.prototype, 'delete').mockResolvedValue(undefined);

    await expect(attachmentService.cleanupExpiredOrphanAttachments(now)).resolves.toBe(2);

    expect(s3Delete).toHaveBeenCalledWith('expired-s3-key');
    expect(fs.existsSync(localPath)).toBe(false);
    expect(
      await prisma().attachment.findMany({
        where: { id: { in: [localAttachment.id, s3Attachment.id] } },
      }),
    ).toHaveLength(0);
  });
});
