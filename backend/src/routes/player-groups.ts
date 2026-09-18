import type { Request, Response } from 'express';
import { Router } from 'express';
import * as groupService from '../services/player-group.service.js';
import { validate } from '../utils/validate.js';
import { playerGroupSearchSchema } from '../schemas/player-groups.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router();

router.get('/search', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(playerGroupSearchSchema, req.query);
  res.json(await groupService.searchValues(data.groupIds, data.q, data.limit));
});

export default router;
