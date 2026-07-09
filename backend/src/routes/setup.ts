import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as setupService from '../services/setup.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../utils/validate.js';
import { ROLE } from '../constants/roles.js';

interface SetupRouteOptions {
  onSetupComplete?: () => void | Promise<void>;
}

const setupSchema = z.object({
  db: z
    .object({
      provider: z.enum(['sqlite', 'mysql']),
      host: z.string().optional(),
      port: z.number().int().positive().optional(),
      username: z.string().optional(),
      password: z.string().optional(),
      database: z.string().optional(),
      args: z.string().optional(),
    })
    .strict()
    .superRefine((db, ctx) => {
      if (db.provider !== 'mysql') return;

      for (const field of ['host', 'username', 'database'] as const) {
        if (!db[field]?.trim()) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'MySQL 配置必填',
            path: [field],
          });
        }
      }
    }),
  admin: z.object({
    email: z.string().email(),
    password: z.string().min(6),
    username: z.string().min(2).max(30),
  }),
  site: z
    .object({
      siteName: z.string().optional(),
      siteUrl: z.string().optional(),
    })
    .optional(),
  mc: z
    .object({
      defaultServerName: z.string().optional(),
    })
    .optional(),
  storage: z
    .object({
      driver: z.enum(['local', 's3']),
      s3: z
        .object({
          endpoint: z.string().optional(),
          bucket: z.string().optional(),
          accessKeyId: z.string().optional(),
          secretAccessKey: z.string().optional(),
          forcePathStyle: z.boolean().optional(),
          presignExpiry: z.number().int().positive().optional(),
        })
        .optional(),
    })
    .superRefine((data, ctx) => {
      if (data.driver === 's3' && !data.s3) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          message: 'driver 为 s3 时必须提供 s3 配置',
          path: ['s3'],
        });
      }
    })
    .optional(),
});

export default function createSetupRoutes(options: SetupRouteOptions = {}) {
  const router = Router();

  // GET /api/setup/site-config - public, no auth required
  router.get('/site-config', async (_req: Request, res: Response) => {
    const config = await setupService.getSiteConfig();
    res.json(config);
  });

  // POST /api/setup - perform initial setup
  router.post('/', async (req: Request, res: Response) => {
    const data = validate(setupSchema, req.body);

    const accessOrigin = req.get('origin') ?? undefined;
    const result = await setupService.completeSetup({ ...data, accessOrigin });
    res.status(201).json(result);
    await options.onSetupComplete?.();
  });

  // PATCH /api/setup/settings - admin only
  router.patch(
    '/settings',
    authMiddleware,
    requireRole(ROLE.ADMIN),
    async (req: Request, res: Response) => {
      const schema = z.object({
        requireLogin: z.boolean().optional(),
        allowWebRegister: z.boolean().optional(),
        allowMcRegister: z.boolean().optional(),
        siteName: z.string().min(1).max(100).optional(),
        siteUrl: z.string().url().nullable().optional(),
        footerContent: z.string().max(2000).nullable().optional(),
      });
      const data = validate(schema, req.body);

      const result = await setupService.updateSettings(data);
      res.json(result);
    },
  );

  return router;
}
