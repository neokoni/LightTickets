import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as storageConfigService from '../services/storage-config.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../utils/validate.js';
import { ROLE } from '../constants/roles.js';

const router = Router();

const s3Schema = z.object({
  endpoint: z.string().optional(),
  region: z.string().optional(),
  bucket: z.string().optional(),
  accessKeyId: z.string().optional(),
  secretAccessKey: z.string().optional(),
  forcePathStyle: z.boolean().optional(),
  presignExpiry: z.number().int().positive().optional(),
});

const updateSchema = z
  .object({
    driver: z.enum(['local', 's3']),
    uploadDir: z.string().optional(),
    s3: s3Schema.optional(),
  })
  .superRefine((data, ctx) => {
    if (data.driver === 's3' && !data.s3) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'driver 为 s3 时必须提供 s3 配置',
        path: ['s3'],
      });
    }
  });

router.get('/', authMiddleware, requireRole(ROLE.ADMIN), async (_req: Request, res: Response) => {
  const config = await storageConfigService.getStorageConfig();
  res.json(config);
});

router.put('/', authMiddleware, requireRole(ROLE.ADMIN), async (req: Request, res: Response) => {
  const data = validate(updateSchema, req.body);

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
