import type { Request, Response } from 'express';
import { Router } from 'express';
import * as setupService from '../services/setup.service.js';
import * as mailService from '../services/mail.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate } from '../utils/validate.js';
import { ROLE } from '../constants/roles.js';
import { mailTestSchema } from '../schemas/mail.js';
import { settingsUpdateSchema, setupSchema } from '../schemas/setup.js';

interface SetupRouteOptions {
  enableInitialSetup?: boolean;
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

function resolveTrustedProxyIp(req: Request): string | undefined {
  if (req.headers['x-forwarded-for'] === undefined) return undefined;
  return req.socket.remoteAddress;
}

export default function createSetupRoutes(options: SetupRouteOptions = {}) {
  const router = Router();

  // GET /api/setup/site-config - public, no auth required
  router.get('/site-config', async (_req: Request, res: Response) => {
    const config = await setupService.getSiteConfig();
    res.json(config);
  });

  if (options.enableInitialSetup) {
    // POST /api/setup is only mounted by the one-time setup server.
    router.post('/', async (req: Request, res: Response) => {
      const data = validate(setupSchema, req.body);

      const result = await setupService.completeSetup({
        ...data,
        accessOrigin: resolveAccessOrigin(req),
        trustedProxyIp: resolveTrustedProxyIp(req),
      });
      res.status(201).json(result);
      await options.onSetupComplete?.();
    });
  }

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
      const data = validate(settingsUpdateSchema, req.body);

      const result = await setupService.updateSettings(data);
      res.json(result);
    },
  );

  router.post(
    '/settings/mail/test',
    authMiddleware,
    requireRole(ROLE.ADMIN),
    async (req: Request, res: Response) => {
      const data = validate(mailTestSchema, req.body ?? {});
      const result = await mailService.testMailConfig(data.mail);
      res.json(result);
    },
  );

  return router;
}
