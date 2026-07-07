import type { Request, Response } from 'express';
import { Router } from 'express';
import { upload } from '../middleware/upload.js';
import * as attachmentService from '../services/attachment.service.js';
import { authMiddleware, conditionalAuthMiddleware } from '../middleware/auth.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';
import { ROLE } from '../constants/roles.js';

const router = Router();

router.post(
  '/upload',
  authMiddleware,
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!req.file) throw new ValidationError('请选择要上传的文件');

    const attachment = await attachmentService.saveUploadedFile({
      file: req.file,
      uploadedBy: req.user!.userId,
      ticketId: req.body.ticketId ? Number(req.body.ticketId) : undefined,
      commentId: req.body.commentId,
    });

    res.status(201).json(attachment);
  },
);

router.get('/:id', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  await attachmentService.serve(String(req.params.id), res);
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const attachment = await attachmentService.getById(String(req.params.id));
  if (attachment.uploadedBy !== req.user!.userId && req.user!.role !== ROLE.ADMIN) {
    throw new ForbiddenError('只能删除自己上传的附件');
  }
  await attachmentService.deleteAttachment(attachment.id);
  res.status(204).end();
});

export default router;
