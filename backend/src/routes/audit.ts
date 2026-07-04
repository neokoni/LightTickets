import { Router, Request, Response } from 'express';
import * as auditService from '../services/audit.service.js';
import { conditionalAuthMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';

const router = Router({ mergeParams: true });

function parseId(raw: string): number {
  const id = Number(raw);
  if (isNaN(id)) throw new ValidationError('无效的议题ID');
  return id;
}

router.use(conditionalAuthMiddleware);

router.get('/', async (req: Request, res: Response) => {
  const logs = await auditService.listByTicket(parseId(String(req.params.ticketId)));
  res.json(logs);
});

export default router;
