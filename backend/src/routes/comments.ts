import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as commentService from '../services/comment.service.js';
import { authMiddleware, conditionalAuthMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';

const router = Router({ mergeParams: true });

function parseId(raw: string): number {
  const id = Number(raw);
  if (isNaN(id)) throw new ValidationError('无效的议题ID');
  return id;
}

const createSchema = z.object({
  body: z.string().min(1),
});

router.get('/', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const comments = await commentService.listByTicket(parseId(req.params.id));
  res.json(comments);
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const comment = await commentService.create(parseId(req.params.id), req.user!.userId, parsed.data.body);
  res.status(201).json(comment);
});

export default router;
