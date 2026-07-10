import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as setupService from '../services/setup.service.js';
import * as mailService from '../services/mail.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../utils/validate.js';
import { ROLE } from '../constants/roles.js';
import { DatabaseProvider } from '../constants/database-provider.js';
import { StorageDriver } from '../constants/storage-driver.js';

interface SetupRouteOptions {
  onSetupComplete?: () => void | Promise<void>;
}

function resolveAccessOrigin(req: Request): string | undefined {
  const origin = req.get('origin');
  if (origin) return origin;

  const referer = req.get('referer');
  if (referer) {
    try {
      return new URL(referer).origin;
    } catch {
      // ignore malformed referer
    }
  }

  const host = req.get('x-forwarded-host') ?? req.get('host');
  if (host) {
    const proto = req.get('x-forwarded-proto')?.split(',')[0]?.trim() || req.protocol || 'http';
    return `${proto}://${host}`;
  }

  return undefined;
}

const setupSchema = z
  .object({
    db: z
      .object({
        provider: z.enum([DatabaseProvider.SQLITE, DatabaseProvider.MYSQL]),
        host: z.string().optional(),
        port: z.number().int().positive().optional(),
        username: z.string().optional(),
        password: z.string().optional(),
        database: z.string().optional(),
        args: z.string().optional(),
      })
      .strict()
      .superRefine((db, ctx) => {
        if (db.provider !== DatabaseProvider.MYSQL) return;

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
        defaultLanguage: z.string().optional(),
      })
      .optional(),
    mc: z
      .object({
        defaultServerName: z.string().optional(),
      })
      .optional(),
    storage: z
      .object({
        driver: z.enum([StorageDriver.LOCAL, StorageDriver.S3]),
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
        if (data.driver === StorageDriver.S3 && !data.s3) {
          ctx.addIssue({
            code: z.ZodIssueCode.custom,
            message: 'driver 为 s3 时必须提供 s3 配置',
            path: ['s3'],
          });
        }
      })
      .optional(),
  })
  .strict();

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

    const result = await setupService.completeSetup({
      ...data,
      accessOrigin: resolveAccessOrigin(req),
    });
    res.status(201).json(result);
    await options.onSetupComplete?.();
  });

  // PATCH /api/setup/settings - admin only
  router.get(
    '/settings',
    authMiddleware,
    requireRole(ROLE.ADMIN),
    async (_req: Request, res: Response) => {
      const result = await setupService.getAdminSettings();
      res.json(result);
    },
  );

  router.patch(
    '/settings',
    authMiddleware,
    requireRole(ROLE.ADMIN),
    async (req: Request, res: Response) => {
      const schema = z.object({
        requireLogin: z.boolean().optional(),
        allowWebRegister: z.boolean().optional(),
        allowMcRegister: z.boolean().optional(),
        siteName: z.string().max(100).optional(),
        siteUrl: z.string().url().nullable().optional(),
        footerContent: z.string().max(2000).nullable().optional(),
        defaultLanguage: z.string().optional(),
        mail: z
          .object({
            enabled: z.boolean().optional(),
            host: z.string().optional(),
            port: z.number().int().positive().optional(),
            secure: z.boolean().optional(),
            username: z.string().nullable().optional(),
            password: z.string().nullable().optional(),
            fromName: z.string().optional(),
            fromAddress: z.string().email().or(z.literal('')).optional(),
          })
          .optional(),
        turnstile: z
          .object({
            enabled: z.boolean().optional(),
            siteKey: z.string().optional(),
            secretKey: z.string().nullable().optional(),
          })
          .optional(),
      });
      const data = validate(schema, req.body);

      const result = await setupService.updateSettings(data);
      res.json(result);
    },
  );

  router.post(
    '/settings/mail/test',
    authMiddleware,
    requireRole(ROLE.ADMIN),
    async (_req: Request, res: Response) => {
      const result = await mailService.testMailConfig();
      res.json(result);
    },
  );

  return router;
}
