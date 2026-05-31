import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';
import { serverAuthMiddleware } from '../middleware/server-auth.js';
import { generateLinkCode } from '../utils/link-code.js';
import { config } from '../config.js';
import { NotFoundError, ValidationError } from '../utils/errors.js';
import * as ticketService from '../services/ticket.service.js';
import * as commentService from '../services/comment.service.js';
import * as permissionService from '../services/permission.service.js';

const prisma = new PrismaClient();
const router = Router();

router.use(serverAuthMiddleware);

const linkCodeSchema = z.object({
  minecraftUuid: z.string(),
  minecraftName: z.string(),
});

const mcTicketSchema = z.object({
  minecraftUuid: z.string(),
  title: z.string().min(1).max(200),
  body: z.string().min(1),
  template: z.string().min(1),
  formData: z.record(z.string(), z.string()).optional(),
  context: z.object({
    world: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
    gameMode: z.string().optional(),
  }).optional(),
});

router.post('/link-code', async (req: Request, res: Response) => {
  const parsed = linkCodeSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + config.linkCodeExpiry);

  const linkCode = await prisma.linkCode.create({
    data: {
      code,
      minecraftUuid: parsed.data.minecraftUuid,
      minecraftName: parsed.data.minecraftName,
      serverId: req.server!.id,
      expiresAt,
    },
  });

  res.status(201).json({ code: linkCode.code, expiresAt: linkCode.expiresAt });
});

router.post('/tickets', async (req: Request, res: Response) => {
  const parsed = mcTicketSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const user = await prisma.user.findUnique({ where: { minecraftUuid: parsed.data.minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked to any account');

  let body = parsed.data.body;
  if (parsed.data.context) {
    const ctx = parsed.data.context;
    body += `\n\n---\n**Game Context:**\n- World: ${ctx.world}\n- Position: ${ctx.x}, ${ctx.y}, ${ctx.z}\n- Game Mode: ${ctx.gameMode}`;
  }

  const ticket = await ticketService.create({
    title: parsed.data.title,
    body,
    template: parsed.data.template,
    formData: parsed.data.formData || {},
    authorId: user.id,
    serverId: req.server!.id,
  });

  res.status(201).json(ticket);
});

router.get('/tickets/:uuid', async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({ where: { minecraftUuid: req.params.uuid } });
  if (!user) {
    res.json([]);
    return;
  }

  const result = await ticketService.list({ authorId: user.id, pageSize: 10 });
  res.json(result.tickets);
});

router.post('/comments', async (req: Request, res: Response) => {
  const { minecraftUuid, ticketId, body } = req.body;
  if (!minecraftUuid || !ticketId || !body) throw new ValidationError('minecraftUuid, ticketId, and body required');

  const user = await prisma.user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked');

  const comment = await commentService.create(Number(ticketId), user.id, body, 'minecraft');
  res.status(201).json(comment);
});

router.post('/permission-executed', async (req: Request, res: Response) => {
  const { ticketId, success, errorMessage } = req.body;
  if (!ticketId) throw new ValidationError('ticketId required');

  await permissionService.reportExecution(Number(ticketId), success, errorMessage);
  res.json({ ok: true });
});

router.post('/tickets/:id/close', async (req: Request, res: Response) => {
  const { minecraftUuid } = req.body;
  if (!minecraftUuid) throw new ValidationError('minecraftUuid required');

  const user = await prisma.user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked');

  const ticket = await ticketService.closeTicket(Number(req.params.id), user.id, user.role);
  res.json(ticket);
});

router.post('/tickets/:id/reopen', async (req: Request, res: Response) => {
  const { minecraftUuid } = req.body;
  if (!minecraftUuid) throw new ValidationError('minecraftUuid required');

  const user = await prisma.user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked');

  const ticket = await ticketService.reopenTicket(Number(req.params.id), user.id, user.role);
  res.json(ticket);
});

export default router;
