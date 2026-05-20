import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as commentService from '../services/comment.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';

const router = Router({ mergeParams: true });

const createSchema = z.object({
  body: z.string().min(1),
});

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const comment = await commentService.create(req.params.id, req.user!.userId, parsed.data.body);
  res.status(201).json(comment);
});

router.get('/', async (req: Request, res: Response) => {
  const comments = await commentService.listByTicket(req.params.id);
  res.json(comments);
});

export default router;
