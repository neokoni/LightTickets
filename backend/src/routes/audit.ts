import type { Request, Response } from 'express';
import { Router } from 'express';
import * as auditService from '../services/audit.service.js';
import { conditionalAuthMiddleware } from '../middleware/auth.js';
import { parseId } from '../utils/validate.js';

const router = Router({ mergeParams: true });

router.use(conditionalAuthMiddleware);

router.get('/', async (req: Request, res: Response) => {
  const logs = await auditService.listByTicket(
    parseId(String(req.params.ticketId)),
    req.user ? { userId: req.user.userId, role: req.user.role } : undefined,
  );
  res.json(logs);
});

export default router;
