import type { Request, Response } from 'express';
import { Router } from 'express';
import { serverAuthMiddleware } from '../middleware/server-auth.js';
import { authLimiter } from '../middleware/rate-limit.js';
import { ForbiddenError } from '../utils/errors.js';
import {
  conditionalMinecraftPlayerSessionMiddleware,
  minecraftPlayerSessionMiddleware,
} from '../middleware/minecraft-player-session.js';
import { validate, parseId, parsePagination } from '../utils/validate.js';
import * as authService from '../services/auth.service.js';
import * as mcService from '../services/mc.service.js';
import {
  mcCommentSchema,
  mcLinkCodeSchema,
  mcPlayerSessionSchema,
  mcRegisterSchema,
  mcStatusSchema,
  mcTicketActionSchema,
  mcTicketListQuerySchema,
  mcTicketSchema,
  mcUnlinkSchema,
  mcViewerSchema,
} from '../schemas/mc.js';

const router = Router();

router.use(serverAuthMiddleware);

router.post('/register', authLimiter, async (req: Request, res: Response) => {
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
    data.emailVerificationCode,
  );
  res.status(201).json(result);
});

router.post('/link-code', authLimiter, async (req: Request, res: Response) => {
  const data = validate(mcLinkCodeSchema, req.body);

  const linkCode = await mcService.createLinkCode({
    minecraftUuid: data.minecraftUuid,
    minecraftName: data.minecraftName,
    serverId: req.server!.id,
  });

  res.status(201).json(linkCode);
});

router.post('/session', async (req: Request, res: Response) => {
  const data = validate(mcPlayerSessionSchema, req.body);
  const session = await mcService.issuePlayerSession({ ...data, serverId: req.server!.id });
  res.status(201).json(session);
});

router.post('/tickets', minecraftPlayerSessionMiddleware, async (req: Request, res: Response) => {
  const data = validate(mcTicketSchema, req.body);
  assertSessionUuid(req, data.minecraftUuid);

  const ticket = await mcService.createTicketFromMinecraft({
    title: data.title,
    body: data.body,
    template: data.template,
    formData: data.formData || {},
    identity: req.minecraftPlayer!,
    context: data.context,
    hidden: data.hidden,
  });

  res.status(201).json(ticket);
});

async function listMinecraftTickets(
  req: Request,
  res: Response,
  input: Omit<mcService.MinecraftTicketListInput, 'identity'> & { minecraftUuid?: string },
) {
  const { minecraftUuid, ...filters } = input;
  if (req.minecraftPlayer) assertSessionUuid(req, minecraftUuid);
  const result = await mcService.listTicketsForMinecraftViewer({
    ...filters,
    identity: req.minecraftPlayer ?? null,
  });
  res.json(result);
}

router.get(
  '/tickets',
  conditionalMinecraftPlayerSessionMiddleware,
  async (req: Request, res: Response) => {
    const query = validate(mcTicketListQuerySchema, req.query);
    await listMinecraftTickets(req, res, query);
  },
);

// Backward-compatible path for plugins from the previous release.
router.get(
  '/tickets/:uuid',
  conditionalMinecraftPlayerSessionMiddleware,
  async (req: Request, res: Response) => {
    await listMinecraftTickets(req, res, {
      ...parsePagination(req.query as Record<string, unknown>),
      minecraftUuid: String(req.params.uuid),
    });
  },
);

router.get(
  '/tickets/:id/detail',
  conditionalMinecraftPlayerSessionMiddleware,
  async (req: Request, res: Response) => {
    const query = validate(mcViewerSchema, req.query);
    if (req.minecraftPlayer) assertSessionUuid(req, query.minecraftUuid);
    const ticket = await mcService.getTicketForMinecraft(
      parseId(String(req.params.id)),
      req.minecraftPlayer ?? null,
    );
    res.json(ticket);
  },
);

router.get(
  '/tickets/:id/comments',
  conditionalMinecraftPlayerSessionMiddleware,
  async (req: Request, res: Response) => {
    const query = validate(mcViewerSchema, req.query);
    if (req.minecraftPlayer) assertSessionUuid(req, query.minecraftUuid);
    const comments = await mcService.listCommentsForMinecraft(
      parseId(String(req.params.id)),
      req.minecraftPlayer ?? null,
    );
    res.json(comments);
  },
);

router.get('/user/:uuid', minecraftPlayerSessionMiddleware, async (req: Request, res: Response) => {
  assertSessionUuid(req, String(req.params.uuid));
  const user = await mcService.getLinkedUser(req.minecraftPlayer!);
  res.json(user);
});

router.post('/comments', minecraftPlayerSessionMiddleware, async (req: Request, res: Response) => {
  const { minecraftUuid, ticketId, body } = validate(mcCommentSchema, req.body);
  assertSessionUuid(req, minecraftUuid);

  const comment = await mcService.createCommentFromMinecraft({
    ticketId,
    body,
    identity: req.minecraftPlayer!,
  });
  res.status(201).json(comment);
});

router.post(
  '/tickets/:id/close',
  minecraftPlayerSessionMiddleware,
  async (req: Request, res: Response) => {
    const { minecraftUuid } = validate(mcTicketActionSchema, req.body);
    assertSessionUuid(req, minecraftUuid);

    const ticket = await mcService.closeTicketFromMinecraft(
      parseId(String(req.params.id)),
      req.minecraftPlayer!,
    );
    res.json(ticket);
  },
);

router.post(
  '/tickets/:id/reopen',
  minecraftPlayerSessionMiddleware,
  async (req: Request, res: Response) => {
    const { minecraftUuid } = validate(mcTicketActionSchema, req.body);
    assertSessionUuid(req, minecraftUuid);

    const ticket = await mcService.reopenTicketFromMinecraft(
      parseId(String(req.params.id)),
      req.minecraftPlayer!,
    );
    res.json(ticket);
  },
);

router.post(
  '/tickets/:id/status',
  minecraftPlayerSessionMiddleware,
  async (req: Request, res: Response) => {
    const data = validate(mcStatusSchema, req.body);
    assertSessionUuid(req, data.minecraftUuid);

    const ticket = await mcService.updateTicketStatusFromMinecraft(parseId(String(req.params.id)), {
      status: data.status,
      identity: req.minecraftPlayer!,
    });
    res.json(ticket);
  },
);

router.post('/unlink', async (req: Request, _res: Response) => {
  validate(mcUnlinkSchema, req.body);
  throw new ForbiddenError('Minecraft 解绑必须由账户本人在 Web 端完成');
});

function assertSessionUuid(req: Request, minecraftUuid: string | undefined): void {
  if (!minecraftUuid || minecraftUuid !== req.minecraftPlayer?.minecraftUuid) {
    throw new ForbiddenError('Minecraft player session does not match requested UUID');
  }
}

export default router;
