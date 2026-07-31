import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ROLE } from '../constants/roles.js';
import { validate } from '../utils/validate.js';
import * as deliveryService from '../services/minecraft-hook-delivery.service.js';

const router = Router();
router.use(authMiddleware, requireRole(ROLE.ADMIN));

export const deliveryIdSchema = z.object({ id: z.string().uuid() });

router.get('/', async (_req: Request, res: Response) => {
  res.json(await deliveryService.listDeadLetters());
});

router.post('/:id/retry', async (req: Request, res: Response) => {
  const { id } = validate(deliveryIdSchema, { id: String(req.params.id) });
  const retried = await deliveryService.retryDeadLetter(id);
  res.json({ retried });
});

export default router;
