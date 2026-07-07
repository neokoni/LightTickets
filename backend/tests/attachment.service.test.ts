import { describe, it, expect, beforeEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import * as attachmentService from '../src/services/attachment.service.js';
import { prisma } from './setup.js';
import { reinitStorageAdapter } from '../src/services/storage/index.js';

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
    const filePath = path.resolve(config!.uploadDir, attachment.path);
    expect(fs.existsSync(filePath)).toBe(true);
    expect(fs.readFileSync(filePath, 'utf-8')).toBe('hello');
    expect(attachment.filename).toBe('hello.txt');
    expect(attachment.mimeType).toBe('text/plain');
    expect(attachment.storageType).toBe('local');
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
    const filePath = path.resolve(config!.uploadDir, attachment.path);
    expect(fs.existsSync(filePath)).toBe(true);

    await attachmentService.deleteAttachment(attachment.id);

    expect(fs.existsSync(filePath)).toBe(false);
    const row = await prisma().attachment.findUnique({ where: { id: attachment.id } });
    expect(row).toBeNull();
  });
});
