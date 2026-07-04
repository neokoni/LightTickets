import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { getPrisma } from '../db.js';
import { serverAuthMiddleware } from '../middleware/server-auth.js';
import { generateLinkCode } from '../utils/link-code.js';
import { config } from '../config.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import * as ticketService from '../services/ticket.service.js';
import * as commentService from '../services/comment.service.js';
import * as permissionService from '../services/permission.service.js';
import * as authService from '../services/auth.service.js';
import * as hookService from '../services/hook.service.js';

const prisma = () => getPrisma();
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
  context: z.object({
    world: z.string().optional(),
    x: z.number().optional(),
    y: z.number().optional(),
    z: z.number().optional(),
    gameMode: z.string().optional(),
  }).optional(),
});

router.post('/register', async (req: Request, res: Response) => {
  const parsed = mcRegisterSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const { getSiteConfig } = await import('../services/setup.service.js');
  const siteConfig = await getSiteConfig();
  if (!siteConfig.allowMcRegister) {
    res.status(403).json({ error: 'Minecraft注册已关闭，请联系管理员' });
    return;
  }

  const result = await authService.registerFromMinecraft(
    parsed.data.email,
    parsed.data.password,
    parsed.data.username,
    parsed.data.minecraftUuid,
    parsed.data.minecraftName,
  );
  res.status(201).json(result);
});

router.post('/link-code', async (req: Request, res: Response) => {
  const parsed = linkCodeSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const existing = await prisma().user.findUnique({ where: { minecraftUuid: parsed.data.minecraftUuid } });
  if (existing) throw new AppError(409, '该Minecraft账号已绑定到账户');

  const code = generateLinkCode();
  const expiresAt = new Date(Date.now() + config.linkCodeExpiry);

  const linkCode = await prisma().linkCode.create({
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

  const user = await prisma().user.findUnique({ where: { minecraftUuid: parsed.data.minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked to any account');

  const ticket = await ticketService.create({
    title: parsed.data.title,
    body: parsed.data.body,
    template: parsed.data.template,
    formData: parsed.data.formData || {},
    authorId: user.id,
    serverId: req.server!.id,
    gameContext: parsed.data.context ? JSON.stringify(parsed.data.context) : undefined,
  });

  res.status(201).json(ticket);
});

router.get('/tickets/:uuid', async (req: Request, res: Response) => {
  const page = Number(req.query.page) || 1;
  const result = await ticketService.list({ page, pageSize: 10 });
  res.json(result);
});

router.get('/user/:uuid', async (req: Request, res: Response) => {
  const user = await prisma().user.findUnique({
    where: { minecraftUuid: req.params.uuid },
    select: {
      id: true,
      email: true,
      username: true,
      minecraftUuid: true,
      minecraftName: true,
      avatarUrl: true,
      role: true,
      createdAt: true,
      updatedAt: true,
    },
  });
  if (!user) throw new NotFoundError('Player not linked');
  res.json(user);
});

router.post('/comments', async (req: Request, res: Response) => {
  const { minecraftUuid, ticketId, body } = req.body;
  if (!minecraftUuid || !ticketId || !body) throw new ValidationError('minecraftUuid, ticketId, and body required');

  const user = await prisma().user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked');

  const comment = await commentService.create(Number(ticketId), user.id, body, 'minecraft');
  res.status(201).json(comment);
});

router.post('/hook-results', async (req: Request, res: Response) => {
  const { hookId, ticketId, event, type, success, errorMessage } = req.body;
  if (!hookId || !ticketId || typeof success !== 'boolean') {
    throw new ValidationError('hookId, ticketId, and success required');
  }

  const result = await hookService.reportResult({
    hookId,
    ticketId: Number(ticketId),
    event,
    type,
    success,
    errorMessage,
  });
  res.json(result);
});

router.post('/tickets/:id/close', async (req: Request, res: Response) => {
  const { minecraftUuid } = req.body;
  if (!minecraftUuid) throw new ValidationError('minecraftUuid required');

  const user = await prisma().user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked');

  const ticket = await ticketService.closeTicket(Number(req.params.id), user.id, user.role);
  res.json(ticket);
});

router.post('/tickets/:id/reopen', async (req: Request, res: Response) => {
  const { minecraftUuid } = req.body;
  if (!minecraftUuid) throw new ValidationError('minecraftUuid required');

  const user = await prisma().user.findUnique({ where: { minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked');

  const ticket = await ticketService.reopenTicket(Number(req.params.id), user.id, user.role);
  res.json(ticket);
});

const statusSchema = z.object({
  minecraftUuid: z.string(),
  status: z.enum(['open', 'in_progress', 'closed', 'invalid']),
});

router.post('/tickets/:id/status', async (req: Request, res: Response) => {
  const parsed = statusSchema.safeParse(req.body);
  if (!parsed.success) throw new ValidationError(parsed.error.issues[0].message);

  const user = await prisma().user.findUnique({ where: { minecraftUuid: parsed.data.minecraftUuid } });
  if (!user) throw new NotFoundError('Player not linked');

  const ticket = await ticketService.update(
    Number(req.params.id),
    user.id,
    user.role,
    { status: parsed.data.status },
  );
  res.json(ticket);
});

router.post('/unlink', async (req: Request, res: Response) => {
  const { minecraftUuid } = req.body;
  if (!minecraftUuid) throw new ValidationError('minecraftUuid required');

  const user = await authService.unlinkMinecraftByUuid(minecraftUuid);
  res.json(user);
});

export default router;
