import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as ticketService from '../services/ticket.service.js';
import * as labelService from '../services/label.service.js';
import * as permissionService from '../services/permission.service.js';
import { authMiddleware, conditionalAuthMiddleware } from '../middleware/auth.js';
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

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const ticket = await ticketService.create({ ...parsed.data, authorId: req.user!.userId });
  res.status(201).json(ticket);
});

router.get('/', conditionalAuthMiddleware, async (req: Request, res: Response) => {
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

router.get('/:id', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.getById(Number(req.params.id));
  res.json(ticket);
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.update(Number(req.params.id), req.user!.userId, req.user!.role, req.body);
  res.json(ticket);
});

router.post('/:id/approve', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const ticket = await permissionService.approve(Number(req.params.id), req.user!.userId);
  res.json(ticket);
});

router.post('/:id/reject', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const ticket = await permissionService.reject(Number(req.params.id), req.user!.userId, req.body.reason);
  res.json(ticket);
});

// Labels
router.post('/:id/labels', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const { labelId } = req.body;
  if (!labelId) throw new ValidationError('标签ID不能为空');
  await labelService.addToTicket(Number(req.params.id), labelId);
  res.status(201).end();
});

router.delete('/:id/labels/:labelId', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  await labelService.removeFromTicket(Number(req.params.id), req.params.labelId);
  res.status(204).end();
});

export default router;
