import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as ticketService from '../services/ticket.service.js';
import * as labelService from '../services/label.service.js';
import * as attachmentService from '../services/attachment.service.js';
import { authMiddleware, conditionalAuthMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate, parseId, paginationSchema } from '../utils/validate.js';
import { ROLE } from '../constants/roles.js';
import { TICKET_STATUS } from '../constants/ticket-status.js';
import { labelIdentifierSchema } from '../schemas/label.js';

const router = Router();

export const ticketCreateSchema = z.object({
  title: z.string().min(1).max(200),
  template: z.string().min(1),
  formData: z
    .record(z.string(), z.string())
    .describe('Fields declared by the selected template; unknown and invalid values are rejected'),
  serverId: z
    .string()
    .optional()
    .describe('Minecraft source server; accepted only for staff and admin users'),
  attachmentIds: z.array(z.string().uuid()).optional(),
  hidden: z.boolean().optional(),
});

export const ticketLabelSchema = z.object({ labelId: labelIdentifierSchema });

export const ticketStatusSchema = z.enum([
  TICKET_STATUS.OPEN,
  TICKET_STATUS.IN_PROGRESS,
  TICKET_STATUS.CLOSED,
  TICKET_STATUS.INVALID,
]);

export const ticketListQuerySchema = paginationSchema.extend({
  statuses: z
    .union([z.string(), z.array(z.string())])
    .transform((value) => (Array.isArray(value) ? value : value.split(',')))
    .pipe(z.array(ticketStatusSchema))
    .optional(),
  type: z.string().optional(),
  authorId: z.coerce.number().int().positive().optional(),
  authorName: z.string().optional(),
  serverId: z.string().optional(),
  serverName: z.string().min(1).optional(),
  hasServer: z
    .enum(['true', 'false'])
    .transform((value) => value === 'true')
    .optional(),
  labelId: z.string().optional(),
  search: z.string().optional(),
});

router.post('/', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(ticketCreateSchema, req.body);

  const ticket = await ticketService.create({
    ...data,
    authorId: req.user!.userId,
    creatorRole: req.user!.role,
  });
  res.status(201).json(ticket);
});

router.get('/', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const query = validate(ticketListQuerySchema, req.query);
  const result = await ticketService.list({
    ...query,
    viewer: req.user ? { userId: req.user.userId, role: req.user.role } : undefined,
  });
  res.json(result);
});

router.get('/:id', conditionalAuthMiddleware, async (req: Request, res: Response) => {
  const ticket = await ticketService.getById(
    parseId(String(req.params.id)),
    req.user ? { userId: req.user.userId, role: req.user.role } : undefined,
  );
  res.json(ticket);
});

router.get('/:id/attachments', authMiddleware, async (req: Request, res: Response) => {
  const list = await attachmentService.listByTicket(parseId(String(req.params.id)), {
    userId: req.user!.userId,
    role: req.user!.role,
  });
  res.json(list.map((a) => ({ ...a, url: `/api/attachments/${a.id}` })));
});

export const ticketUpdateSchema = z
  .object({
    status: z
      .enum([
        TICKET_STATUS.OPEN,
        TICKET_STATUS.IN_PROGRESS,
        TICKET_STATUS.CLOSED,
        TICKET_STATUS.INVALID,
      ])
      .optional(),
    hidden: z.boolean().optional(),
  })
  .strict();

router.patch('/:id', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(ticketUpdateSchema, req.body);
  const ticket = await ticketService.update(
    parseId(String(req.params.id)),
    req.user!.userId,
    req.user!.role,
    data,
  );
  res.json(ticket);
});

export const ticketBodyUpdateSchema = z.object({
  body: z.string().min(1),
});

router.patch('/:id/body', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(ticketBodyUpdateSchema, req.body);

  const ticket = await ticketService.updateBody(
    parseId(String(req.params.id)),
    req.user!.userId,
    req.user!.role,
    data.body,
  );
  res.json(ticket);
});

export const ticketTitleUpdateSchema = z.object({
  title: z.string().trim().min(1).max(200),
});

export const ticketCompleteHookSchema = z.object({
  values: z.record(
    z.string(),
    z.union([z.string().max(2000), z.array(z.string().max(2000)).max(100)]),
  ),
});
export const completionHookIdSchema = z.uuid();

router.patch('/:id/title', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(ticketTitleUpdateSchema, req.body);

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

router.post(
  '/:id/completion-hooks/:hookId/complete',
  authMiddleware,
  requireRole(ROLE.STAFF),
  async (req: Request, res: Response) => {
    const data = validate(ticketCompleteHookSchema, req.body);
    const hook = await ticketService.completeCompletionHook(
      parseId(String(req.params.id)),
      validate(completionHookIdSchema, String(req.params.hookId)),
      req.user!.userId,
      data.values,
    );
    res.json(hook);
  },
);

// Assignees
export const ticketAssigneesSchema = z.object({
  assigneeIds: z
    .array(z.number().int().positive())
    .refine((ids) => new Set(ids).size === ids.length, '受理人不能重复'),
});

router.put(
  '/:id/assignees',
  authMiddleware,
  requireRole(ROLE.STAFF),
  async (req: Request, res: Response) => {
    const data = validate(ticketAssigneesSchema, req.body);

    const ticket = await ticketService.setAssignees(
      parseId(String(req.params.id)),
      req.user!.userId,
      req.user!.role,
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
    const { labelId } = validate(ticketLabelSchema, req.body);
    await labelService.addToTicketWithAudit(
      parseId(String(req.params.id)),
      labelId,
      req.user!.userId,
      req.user!.role,
    );
    res.status(201).end();
  },
);

router.delete(
  '/:id/labels/:labelId',
  authMiddleware,
  requireRole(ROLE.STAFF),
  async (req: Request, res: Response) => {
    const labelId = validate(labelIdentifierSchema, String(req.params.labelId));
    await labelService.removeFromTicketWithAudit(
      parseId(String(req.params.id)),
      labelId,
      req.user!.userId,
      req.user!.role,
    );
    res.status(204).end();
  },
);

export default router;
