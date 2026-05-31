import { Router, Request, Response } from 'express';
import { z } from 'zod';
import * as ticketService from '../services/ticket.service.js';
import * as labelService from '../services/label.service.js';
import * as permissionService from '../services/permission.service.js';
import { authMiddleware, conditionalAuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ValidationError } from '../utils/errors.js';
import { getDefinition, renderBody } from '../services/template.service.js';

const router = Router();

function parseId(raw: string): number {
  const id = Number(raw);
  if (isNaN(id)) throw new ValidationError('无效的议题ID');
  return id;
}

const createSchema = z.object({
  title: z.string().min(1).max(200),
  template: z.string().min(1),
  formData: z.record(z.string(), z.string()),
  priority: z.enum(['low', 'medium', 'high', 'critical']).optional(),
  serverId: z.string().optional(),
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const parsed = createSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const { template, formData, title: userTitle, ...rest } = parsed.data;
  const def = getDefinition(template);
  if (!def) throw new ValidationError('无效的模板');

  const body = renderBody(def, formData);
  const title = def.title_prefix ? def.title_prefix + userTitle : userTitle;

  const ticket = await ticketService.create({
    ...rest,
    title,
    body,
    template,
    formData,
    authorId: req.user!.userId,
  });
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
  const ticket = await ticketService.getById(parseId(req.params.id));
  res.json(ticket);
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.update(parseId(req.params.id), req.user!.userId, req.user!.role, req.body);
  res.json(ticket);
});

router.post('/:id/close', authMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.closeTicket(parseId(req.params.id), req.user!.userId, req.user!.role);
  res.json(ticket);
});

router.post('/:id/reopen', authMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.reopenTicket(parseId(req.params.id), req.user!.userId, req.user!.role);
  res.json(ticket);
});

router.post('/:id/approve', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const ticket = await permissionService.approve(parseId(req.params.id), req.user!.userId);
  res.json(ticket);
});

router.post('/:id/reject', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const ticket = await permissionService.reject(parseId(req.params.id), req.user!.userId, req.body.reason);
  res.json(ticket);
});

// Labels
router.post('/:id/labels', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  const { labelId } = req.body;
  if (!labelId) throw new ValidationError('标签ID不能为空');
  await labelService.addToTicket(parseId(req.params.id), labelId);
  res.status(201).end();
});

router.delete('/:id/labels/:labelId', authMiddleware, requireRole('staff'), async (req: Request, res: Response) => {
  await labelService.removeFromTicket(parseId(req.params.id), req.params.labelId);
  res.status(204).end();
});

export default router;
