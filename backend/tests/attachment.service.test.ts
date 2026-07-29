import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as attachmentService from '../src/services/attachment.service.js';
import { prisma } from './setup.js';
import { reinitStorageAdapter } from '../src/services/storage/index.js';
import { resolveUploadDir } from '../src/paths.js';
import { ORPHAN_ATTACHMENT_TTL_MS } from '../src/constants/upload.js';

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
      data: { createdAt: new Date(now.getTime() - ORPHAN_ATTACHMENT_TTL_MS - 1) },
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
