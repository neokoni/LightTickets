import type { Request, Response } from 'express';
import { Router } from 'express';
import { upload } from '../middleware/upload.js';
import * as attachmentService from '../services/attachment.service.js';
import { authMiddleware, conditionalAuthMiddleware } from '../middleware/auth.js';
import { ValidationError, ForbiddenError } from '../utils/errors.js';
import { ROLE } from '../constants/roles.js';
import { z } from 'zod';
import { validate } from '../utils/validate.js';

const router = Router();

export const attachmentTargetFields = {
  ticketId: z.coerce.number().int().positive().optional(),
  commentId: z.string().uuid().optional(),
} as const;

export const attachmentUploadFieldsSchema = z
  .object(attachmentTargetFields)
  .strict()
  .refine((value) => value.ticketId === undefined || value.commentId === undefined, {
    message: 'ticketId 和 commentId 不能同时提供',
  });

router.post(
  '/upload',
  authMiddleware,
  upload.single('file'),
  async (req: Request, res: Response) => {
    if (!req.file) throw new ValidationError('请选择要上传的文件');
    const target = validate(attachmentUploadFieldsSchema, req.body);

    const attachment = await attachmentService.saveUploadedFile({
      file: req.file,
      uploadedBy: req.user!.userId,
      ...target,
      userRole: req.user!.role,
    });

    res.status(201).json(attachment);
  },
);

router.get('/:id', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  await attachmentService.serve(
    String(req.params.id),
    res,
    req.user ? { userId: req.user.userId, role: req.user.role } : undefined,
  );
});

router.delete('/:id', authMiddleware, async (req: Request, res: Response) => {
  const attachment = await attachmentService.assertAttachmentVisible(String(req.params.id), {
    userId: req.user!.userId,
    role: req.user!.role,
  });
  if (attachment.uploadedBy !== req.user!.userId && req.user!.role !== ROLE.ADMIN) {
    throw new ForbiddenError('只能删除自己上传的附件');
  }
  await attachmentService.deleteAttachment(attachment.id);
  res.status(204).end();
});

export default router;
