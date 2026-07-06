import { Router, Request, Response } from 'express';
import crypto from 'crypto';
import path from 'path';
import { upload } from '../middleware/upload.js';
import * as attachmentService from '../services/attachment.service.js';
import { getStorageAdapter } from '../services/storage/index.js';
import { authMiddleware, conditionalAuthMiddleware } from '../middleware/auth.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';

const router = Router();

router.post('/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) throw new ValidationError('请选择要上传的文件');

  const ext = path.extname(req.file.originalname);
  const key = crypto.randomUUID() + ext;
  const adapter = getStorageAdapter();
  await adapter.save({
    buffer: req.file.buffer,
    key,
    mimeType: req.file.mimetype,
  });

  const attachment = await attachmentService.create({
    filename: req.file.originalname,
    path: key,
    mimeType: req.file.mimetype,
    size: req.file.size,
    storageType: adapter.type,
    uploadedBy: req.user!.userId,
    ticketId: req.body.ticketId ? Number(req.body.ticketId) : undefined,
    commentId: req.body.commentId,
  });

  res.status(201).json(attachment);
});

router.get('/:id', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const attachment = await attachmentService.getById(String(req.params.id));
  const adapter = getStorageAdapter();
  await adapter.serve(res, attachment.path, attachment.filename);
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const attachment = await attachmentService.getById(String(req.params.id));
  if (attachment.uploadedBy !== req.user!.userId && req.user!.role !== 'admin') {
    throw new ForbiddenError('只能删除自己上传的附件');
  }
  const adapter = getStorageAdapter();
  await adapter.delete(attachment.path);
  await attachmentService.deleteById(attachment.id);
  res.status(204).end();
});

export default router;
