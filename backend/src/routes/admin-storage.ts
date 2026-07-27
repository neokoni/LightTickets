import type { Request, Response } from 'express';
import { Router } from 'express';
import * as storageConfigService from '../services/storage-config.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../utils/validate.js';
import { ROLE } from '../constants/roles.js';
import { storageUpdateSchema } from '../schemas/storage.js';

const router = Router();

router.get('/', authMiddleware, requireRole(ROLE.ADMIN), async (_req: Request, res: Response) => {
  const config = await storageConfigService.getStorageConfig();
  res.json(config);
});

router.put('/', authMiddleware, requireRole(ROLE.ADMIN), async (req: Request, res: Response) => {
  const data = validate(storageUpdateSchema, req.body);

  const result = await storageConfigService.updateStorageConfig(data);
  res.json(result);
});

router.post(
  '/test',
  authMiddleware,
  requireRole(ROLE.ADMIN),
  async (_req: Request, res: Response) => {
    const result = await storageConfigService.testS3Connection();
    res.json(result);
  },
);

export default router;
