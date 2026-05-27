import { Router, Request, Response } from 'express';
import * as auditService from '../services/audit.service.js';
import { authMiddleware } from '../middleware/auth.js';

const router = Router({ mergeParams: true });

router.use(authMiddleware);

router.get('/', async (req: Request, res: Response) => {
  const logs = await auditService.listByTicket(Number(req.params.ticketId));
  res.json(logs);
});

export default router;
