import type { Request, Response } from 'express';
import { Router } from 'express';
import * as labelService from '../services/label.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ROLE } from '../constants/roles.js';
import { validate } from '../utils/validate.js';
import { labelCreateSchema, labelIdentifierSchema, labelUpdateSchema } from '../schemas/label.js';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const labels = await labelService.list();
  res.json(labels);
});

router.post('/', authMiddleware, requireRole(ROLE.ADMIN), async (req: Request, res: Response) => {
  const data = validate(labelCreateSchema, req.body);

  const label = await labelService.create(data.id, data.name, data.color, data.description);
  res.status(201).json(label);
});

router.patch(
  '/:id',
  authMiddleware,
  requireRole(ROLE.ADMIN),
  async (req: Request, res: Response) => {
    const data = validate(labelUpdateSchema, req.body);
    const id = validate(labelIdentifierSchema, String(req.params.id));
    const label = await labelService.update(id, data);
    res.json(label);
  },
);

router.delete(
  '/:id',
  authMiddleware,
  requireRole(ROLE.ADMIN),
  async (req: Request, res: Response) => {
    const id = validate(labelIdentifierSchema, String(req.params.id));
    await labelService.remove(id);
    res.status(204).end();
  },
);

export default router;
