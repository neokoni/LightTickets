import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as ticketService from '../services/ticket.service.js';
import * as permissionService from '../services/permission.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ValidationError } from '../utils/errors.js';

const router = Router();

const createSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  type: z.enum(['bug_report', 'permission_request', 'suggestion', 'report']),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  serverId: z.string().optional(),
});

router.use(authMiddleware);

router.post('/', async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const ticket = await ticketService.create({ ...parsed.data, authorId: req.user!.userId });
  res.status(201).json(ticket);
});

router.get('/', async (req: Request, res: Response) => {
  const result = await ticketService.list({
    page: req.query.page ? Number(req.query.page) : undefined,
    pageSize: req.query.pageSize ? Number(req.query.pageSize) : undefined,
    status: req.query.status as any,
    type: req.query.type as any,
    authorId: req.query.authorId as string,
    serverId: req.query.serverId as string,
    labelId: req.query.labelId as string,
    search: req.query.search as string,
  });
  res.json(result);
});

router.get('/:id', async (req: Request, res: Response) => {
  const ticket = await ticketService.getById(req.params.id);
  res.json(ticket);
});

router.patch('/:id', async (req: Request, res: Response) => {
  const ticket = await ticketService.update(req.params.id, req.user!.userId, req.user!.role, req.body);
  res.json(ticket);
});

router.post('/:id/approve', requireRole('staff'), async (req: Request, res: Response) => {
  const ticket = await permissionService.approve(req.params.id, req.user!.userId);
  res.json(ticket);
});

router.post('/:id/reject', requireRole('staff'), async (req: Request, res: Response) => {
  const ticket = await permissionService.reject(req.params.id, req.user!.userId, req.body.reason);
  res.json(ticket);
});

export default router;
