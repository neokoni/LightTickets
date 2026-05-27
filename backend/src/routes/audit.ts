import { Router, Request, Response } from 'express';
import * as auditService from '../services/audit.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { ValidationError } from '../utils/errors.js';

const router = Router({ mergeParams: true });

function parseId(raw: string): number {
  const id = Number(raw);
  if (isNaN(id)) throw new ValidationError('无效的议题ID');
  return id;
}

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  const logs = await auditService.listByTicket(parseId(req.params.ticketId));
  res.json(logs);
});

export default router;
