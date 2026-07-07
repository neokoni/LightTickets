import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import { serverAuthMiddleware } from '../middleware/server-auth.js';
import { ForbiddenError, ValidationError } from '../utils/errors.js';
import { validate, parseId, parsePagination } from '../utils/validate.js';
import * as ticketService from '../services/ticket.service.js';
import * as authService from '../services/auth.service.js';
import * as mcService from '../services/mc.service.js';
import { TICKET_STATUS } from '../constants/ticket-status.js';

const router = Router();

router.use(serverAuthMiddleware);

const linkCodeSchema = z.object({
  minecraftUuid: z.string(),
  minecraftName: z.string(),
});

const mcRegisterSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  username: z.string().min(2).max(32),
  minecraftUuid: z.string(),
  minecraftName: z.string(),
});

const mcTicketSchema = z.object({
  minecraftUuid: z.string(),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  template: z.string().min(1),
  formData: z.record(z.string(), z.string()).optional(),
  context: z
    .object({
      world: z.string().optional(),
      x: z.number().optional(),
      y: z.number().optional(),
      z: z.number().optional(),
      gameMode: z.string().optional(),
    })
    .optional(),
});

router.post('/register', async (req: Request, res: Response) => {
  const data = validate(mcRegisterSchema, req.body);

  const { getSiteConfig } = await import('../services/setup.service.js');
  const siteConfig = await getSiteConfig();
  if (!siteConfig.allowMcRegister) {
    throw new ForbiddenError('Minecraft注册已关闭，请联系管理员');
  }

  const result = await authService.registerFromMinecraft(
    data.email,
    data.password,
    data.username,
    data.minecraftUuid,
    data.minecraftName,
  );
  res.status(201).json(result);
});

router.post('/link-code', async (req: Request, res: Response) => {
  const data = validate(linkCodeSchema, req.body);

  const linkCode = await mcService.createLinkCode({
    minecraftUuid: data.minecraftUuid,
    minecraftName: data.minecraftName,
    serverId: req.server!.id,
  });

  res.status(201).json(linkCode);
});

router.post('/tickets', async (req: Request, res: Response) => {
  const data = validate(mcTicketSchema, req.body);

  const ticket = await mcService.createTicketFromMinecraft({
    minecraftUuid: data.minecraftUuid,
    title: data.title,
    body: data.body,
    template: data.template,
    formData: data.formData || {},
    serverId: req.server!.id,
    context: data.context,
  });

  res.status(201).json(ticket);
});

router.get('/tickets/:uuid', async (req: Request, res: Response) => {
  const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
  const result = await ticketService.list({ page, pageSize });
  res.json(result);
});

router.get('/user/:uuid', async (req: Request, res: Response) => {
  const user = await mcService.getLinkedUser(String(req.params.uuid));
  res.json(user);
});

router.post('/comments', async (req: Request, res: Response) => {
  const { minecraftUuid, ticketId, body } = req.body;
  if (!minecraftUuid || !ticketId || !body)
    throw new ValidationError('minecraftUuid, ticketId, and body required');

  const comment = await mcService.createCommentFromMinecraft({
    minecraftUuid,
    ticketId: parseId(String(ticketId)),
    body,
  });
  res.status(201).json(comment);
});

router.post('/tickets/:id/close', async (req: Request, res: Response) => {
  const { minecraftUuid } = req.body;
  if (!minecraftUuid) throw new ValidationError('minecraftUuid required');

  const ticket = await mcService.closeTicketFromMinecraft(
    parseId(String(req.params.id)),
    minecraftUuid,
  );
  res.json(ticket);
});

router.post('/tickets/:id/reopen', async (req: Request, res: Response) => {
  const { minecraftUuid } = req.body;
  if (!minecraftUuid) throw new ValidationError('minecraftUuid required');

  const ticket = await mcService.reopenTicketFromMinecraft(
    parseId(String(req.params.id)),
    minecraftUuid,
  );
  res.json(ticket);
});

const statusSchema = z.object({
  minecraftUuid: z.string(),
  status: z.enum([
    TICKET_STATUS.OPEN,
    TICKET_STATUS.IN_PROGRESS,
    TICKET_STATUS.CLOSED,
    TICKET_STATUS.INVALID,
  ]),
});

router.post('/tickets/:id/status', async (req: Request, res: Response) => {
  const data = validate(statusSchema, req.body);

  const ticket = await mcService.updateTicketStatusFromMinecraft(
    parseId(String(req.params.id)),
    data,
  );
  res.json(ticket);
});

router.post('/unlink', async (req: Request, res: Response) => {
  const { minecraftUuid } = req.body;
  if (!minecraftUuid) throw new ValidationError('minecraftUuid required');

  const user = await mcService.unlinkMinecraftByUuid(minecraftUuid);
  res.json(user);
});

export default router;
