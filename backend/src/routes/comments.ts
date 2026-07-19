import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as commentService from '../services/comment.service.js';
import { authMiddleware, conditionalAuthMiddleware } from '../middleware/auth.js';
import { validate, parseId } from '../utils/validate.js';

const router = Router({ mergeParams: true });

const createSchema = z.object({
  body: z.string().min(1),
});

router.get('/', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const comments = await commentService.listByTicket(
    parseId(String(req.params.id)),
    req.user ? { userId: req.user.userId, role: req.user.role } : undefined,
  );
  res.json(comments);
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(createSchema, req.body);

  const comment = await commentService.create(
    parseId(String(req.params.id)),
    req.user!.userId,
    data.body,
    undefined,
    req.user!.role,
  );
  res.status(201).json(comment);
});

const updateBodySchema = z.object({
  body: z.string().min(1),
});

router.patch('/:commentId/body', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(updateBodySchema, req.body);

  const comment = await commentService.updateBody(
    String(req.params.commentId),
    req.user!.userId,
    data.body,
    req.user!.role,
  );
  res.json(comment);
});

router.delete('/:commentId', authMiddleware, async (req: Request, res: Response) => {
  await commentService.deleteComment(
    String(req.params.commentId),
    req.user!.userId,
    req.user!.role,
  );
  res.status(204).end();
});

export default router;
