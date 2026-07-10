import type { TicketStatus } from '@prisma/client';
import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as ticketService from '../services/ticket.service.js';
import * as labelService from '../services/label.service.js';
import * as attachmentService from '../services/attachment.service.js';
import { authMiddleware, conditionalAuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { ValidationError } from '../utils/errors.js';
import { validate, parseId, parsePagination } from '../utils/validate.js';
import { ROLE } from '../constants/roles.js';

const router = Router();

const createSchema = z.object({
  title: z.string().min(1).max(200),
  template: z.string().min(1),
  formData: z.record(z.string(), z.string()),
  serverId: z.string().optional(),
  attachmentIds: z.array(z.string()).optional(),
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(createSchema, req.body);

  const ticket = await ticketService.create({
    ...data,
    authorId: req.user!.userId,
  });
  res.status(201).json(ticket);
});

router.get('/', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const hasServer = req.query.hasServer !== undefined ? req.query.hasServer === 'true' : undefined;
  const statusesParam = req.query.statuses as string | string[] | undefined;
  const statuses: TicketStatus[] | undefined = statusesParam
    ? Array.isArray(statusesParam)
      ? (statusesParam as TicketStatus[])
      : (statusesParam.split(',') as TicketStatus[])
    : undefined;
  const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
  const result = await ticketService.list({
    page,
    pageSize,
    statuses,
    type: req.query.type as string | undefined,
    authorId: req.query.authorId ? Number(req.query.authorId) : undefined,
    authorName: req.query.authorName as string,
    serverId: req.query.serverId as string,
    hasServer,
    labelId: req.query.labelId as string,
    search: req.query.search as string,
  });
  res.json(result);
});

router.get('/:id', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.getById(parseId(String(req.params.id)));
  res.json(ticket);
});

router.get('/:id/attachments', authMiddleware, async (req: Request, res: Response) => {
  const list = await attachmentService.listByTicket(parseId(String(req.params.id)));
  res.json(list.map((a) => ({ ...a, url: `/api/attachments/${a.id}` })));
});

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.update(
    parseId(String(req.params.id)),
    req.user!.userId,
    req.user!.role,
    req.body,
  );
  res.json(ticket);
});

const updateBodySchema = z.object({
  body: z.string().min(1),
});

router.patch('/:id/body', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(updateBodySchema, req.body);

  const ticket = await ticketService.updateBody(
    parseId(String(req.params.id)),
    req.user!.userId,
    req.user!.role,
    data.body,
  );
  res.json(ticket);
});

const updateTitleSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

router.patch('/:id/title', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(updateTitleSchema, req.body);

  const ticket = await ticketService.updateTitle(
    parseId(String(req.params.id)),
    req.user!.userId,
    req.user!.role,
    data.title,
  );
  res.json(ticket);
});

router.post('/:id/close', authMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.closeTicket(
    parseId(String(req.params.id)),
    req.user!.userId,
    req.user!.role,
  );
  res.json(ticket);
});

router.post('/:id/reopen', authMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.reopenTicket(
    parseId(String(req.params.id)),
    req.user!.userId,
    req.user!.role,
  );
  res.json(ticket);
});

// Assignees
const assigneesSchema = z.object({
  assigneeIds: z.array(z.number().int()),
});

router.put(
  '/:id/assignees',
  authMiddleware,
  requireRole(ROLE.STAFF),
  async (req: Request, res: Response) => {
    const data = validate(assigneesSchema, req.body);

    const ticket = await ticketService.setAssignees(
      parseId(String(req.params.id)),
      req.user!.userId,
      data.assigneeIds,
    );
    res.json(ticket);
  },
);

// Labels
router.post(
  '/:id/labels',
  authMiddleware,
  requireRole(ROLE.STAFF),
  async (req: Request, res: Response) => {
    const { labelId } = req.body;
    if (!labelId) throw new ValidationError('标签ID不能为空');
    await labelService.addToTicketWithAudit(
      parseId(String(req.params.id)),
      labelId,
      req.user!.userId,
    );
    res.status(201).end();
  },
);

router.delete(
  '/:id/labels/:labelId',
  authMiddleware,
  requireRole(ROLE.STAFF),
  async (req: Request, res: Response) => {
    await labelService.removeFromTicketWithAudit(
      parseId(String(req.params.id)),
      String(req.params.labelId),
      req.user!.userId,
    );
    res.status(204).end();
  },
);

export default router;
