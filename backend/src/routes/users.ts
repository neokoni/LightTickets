import type { Request, Response } from 'express';
import { Router } from 'express';
import { z } from 'zod';
import * as userService from '../services/user.service.js';
import { authMiddleware } from '../middleware/auth.js';
import { requireRole } from '../middleware/role.js';
import { validate, parseId, parsePagination } from '../utils/validate.js';
import { ROLE } from '../constants/roles.js';
import * as ticketNotificationService from '../services/ticket-notification.service.js';
import * as federatedAuthService from '../services/federatedauth.service.js';
import { federatedAuthStartSchema, federatedAuthUnlinkSchema } from '../schemas/federatedauth.js';
import { FEDERATED_AUTH_INTENT } from '../constants/federatedauth.js';
import { setFederatedAuthFlowCookie } from '../utils/federatedauth-cookies.js';
import { authLimiter } from '../middleware/rate-limit.js';

const router = Router();

const unsubscribeSchema = z.object({ token: z.string().min(1) });

router.post('/email-notifications/unsubscribe', async (req: Request, res: Response) => {
  const data = validate(unsubscribeSchema, req.body);
  const result = await ticketNotificationService.unsubscribe(data.token);
  res.json(result);
});

router.get('/', authMiddleware, requireRole(ROLE.ADMIN), async (req: Request, res: Response) => {
  const { page, pageSize } = parsePagination(req.query as Record<string, unknown>);
  const result = await userService.listUsers(page, pageSize);
  res.json(result);
});

router.get(
  '/assignable',
  authMiddleware,
  requireRole(ROLE.STAFF),
  async (_req: Request, res: Response) => {
    const users = await userService.listAssignableUsers();
    res.json(users);
  },
);

const avatarSchema = z.object({
  avatarUrl: z.string().url().nullable().or(z.literal('')),
});

router.patch('/me/avatar', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(avatarSchema, req.body);

  const url = data.avatarUrl || null;
  const user = await userService.updateAvatar(req.user!.userId, url);
  res.json(user);
});

const usernameSchema = z.object({
  username: z.string().min(2).max(32),
});

router.patch('/me/username', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(usernameSchema, req.body);

  const user = await userService.updateUsername(req.user!.userId, data.username);
  res.json(user);
});

const passwordSchema = z.object({
  currentPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string().min(8, '新密码至少 8 个字符').max(128),
});

router.patch('/me/password', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(passwordSchema, req.body);

  await userService.changePassword(req.user!.userId, data.currentPassword, data.newPassword);
  res.json({ message: '密码已更新' });
});

const emailSchema = z.object({
  email: z.string().email(),
});

router.patch('/me/email', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(emailSchema, req.body);

  const user = await userService.updateEmail(req.user!.userId, data.email);
  res.json(user);
});

const notificationSettingsSchema = z.object({
  receiveEmailNotifications: z.boolean(),
});

router.patch('/me/notifications', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(notificationSettingsSchema, req.body);
  const user = await userService.updateEmailNotifications(
    req.user!.userId,
    data.receiveEmailNotifications,
  );
  res.json(user);
});

const federatedAuthParamsSchema = z.object({ value: z.string().min(1) });

router.get('/me/federatedauth', authMiddleware, async (req: Request, res: Response) => {
  res.json(await federatedAuthService.listFederatedAuthIdentities(req.user!.userId));
});

router.post(
  '/me/federatedauth/:value/start',
  authLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    const { value } = validate(federatedAuthParamsSchema, req.params);
    const data = validate(federatedAuthStartSchema, req.body);
    const result = await federatedAuthService.startFederatedAuth({
      slug: value,
      intent: FEDERATED_AUTH_INTENT.LINK,
      userId: req.user!.userId,
      returnTo: data.returnTo,
    });
    setFederatedAuthFlowCookie(res, result.browser);
    res.json({ authorizationUrl: result.authorizationUrl });
  },
);

router.delete(
  '/me/federatedauth/:value',
  authLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    const { value } = validate(federatedAuthParamsSchema, req.params);
    const data = validate(federatedAuthUnlinkSchema, req.body);
    await federatedAuthService.unlinkFederatedAuthIdentity(
      req.user!.userId,
      value,
      data.currentPassword,
    );
    res.status(204).end();
  },
);

const roleSchema = z.object({
  role: z.enum([ROLE.PLAYER, ROLE.STAFF, ROLE.ADMIN]),
});

router.patch(
  '/:id/role',
  authMiddleware,
  requireRole(ROLE.ADMIN),
  async (req: Request, res: Response) => {
    const data = validate(roleSchema, req.body);

    const userId = parseId(String(req.params.id));
    const user = await userService.changeRole(userId, data.role);
    res.json(user);
  },
);

router.delete(
  '/:id',
  authMiddleware,
  requireRole(ROLE.ADMIN),
  async (req: Request, res: Response) => {
    const userId = parseId(String(req.params.id));
    await userService.deleteUser(userId, req.user!.userId);
    res.status(204).end();
  },
);

export default router;
