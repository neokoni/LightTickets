import { Router, Request, Response } from 'express';
import path from 'path';
import { upload } from '../middleware/upload.js';
import * as attachmentService from '../services/attachment.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';
import { config } from '../config.js';

const router = Router();

router.post('/upload', authMiddleware, upload.single('file'), async (req: Request, res: Response) => {
  if (!req.file) throw new ValidationError('请选择要上传的文件');

  const attachment = await attachmentService.create({
    filename: req.file.originalname,
    path: req.file.filename,
    mimeType: req.file.mimetype,
    size: req.file.size,
    uploadedBy: req.user!.userId,
    ticketId: req.body.ticketId ? Number(req.body.ticketId) : undefined,
    commentId: req.body.commentId,
  });

  res.status(201).json(attachment);
});

router.get('/:id', async (req: Request, res: Response) => {
  const attachment = await attachmentService.getById(String(req.params.id));
  const filePath = path.resolve(config.uploadDir, attachment.path);
  res.sendFile(filePath);
});

export default router;
