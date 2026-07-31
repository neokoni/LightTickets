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
import { setRefreshCookie } from '../utils/auth-cookies.js';
import * as emailChangeService from '../services/email-change.service.js';

const router = Router();

export const unsubscribeSchema = z.object({ token: z.string().min(1) });
export const emailChangeCancelSchema = z.object({ token: z.string().min(1).max(256) }).strict();

router.post('/email-notifications/unsubscribe', async (req: Request, res: Response) => {
  const data = validate(unsubscribeSchema, req.body);
  const result = await ticketNotificationService.unsubscribe(data.token);
  res.json(result);
});

router.post('/email-change/cancel', authLimiter, async (req: Request, res: Response) => {
  const data = validate(emailChangeCancelSchema, req.body);
  res.json(await emailChangeService.cancelEmailChange(data.token));
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

export const userAvatarSchema = z.object({
  avatarUrl: z.string().url().nullable().or(z.literal('')),
});

router.patch('/me/avatar', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(userAvatarSchema, req.body);

  const url = data.avatarUrl || null;
  const user = await userService.updateAvatar(req.user!.userId, url);
  res.json(user);
});

export const usernameSchema = z.object({
  username: z.string().min(2).max(32),
});

router.patch('/me/username', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(usernameSchema, req.body);

  const user = await userService.updateUsername(req.user!.userId, data.username);
  res.json(user);
});

export const userPasswordSchema = z.object({
  currentPassword: z.string().min(1, '请输入当前密码'),
  newPassword: z.string().min(8, '新密码至少 8 个字符').max(128),
});

router.patch('/me/password', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(userPasswordSchema, req.body);

  const refreshToken = await userService.changePassword(
    req.user!.userId,
    data.currentPassword,
    data.newPassword,
  );
  setRefreshCookie(res, refreshToken);
  res.json({ message: '密码已更新' });
});

export const userEmailSchema = z
  .object({
    email: z.string().trim().email(),
    currentPassword: z.string().min(1, '请输入当前密码').max(128),
  })
  .strict();

export const userEmailVerificationSchema = z
  .object({ code: z.string().regex(/^\d{6}$/, '请输入 6 位邮箱验证码') })
  .strict();

router.patch('/me/email', authLimiter, authMiddleware, async (req: Request, res: Response) => {
  const data = validate(userEmailSchema, req.body);
  res.json(
    await emailChangeService.requestEmailChange(req.user!.userId, data.email, data.currentPassword),
  );
});

router.post(
  '/me/email/verify',
  authLimiter,
  authMiddleware,
  async (req: Request, res: Response) => {
    const data = validate(userEmailVerificationSchema, req.body);
    const result = await emailChangeService.verifyEmailChange(req.user!.userId, data.code);
    setRefreshCookie(res, result.refreshToken);
    res.json(result.user);
  },
);

router.delete('/me/email', authLimiter, authMiddleware, async (req: Request, res: Response) => {
  res.json(await emailChangeService.cancelPendingEmailChange(req.user!.userId));
});

export const userNotificationSettingsSchema = z.object({
  receiveEmailNotifications: z.boolean(),
});

router.patch('/me/notifications', authMiddleware, async (req: Request, res: Response) => {
  const data = validate(userNotificationSettingsSchema, req.body);
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

export const userRoleSchema = z.object({
  role: z.enum([ROLE.PLAYER, ROLE.STAFF, ROLE.ADMIN]),
});

router.patch(
  '/:id/role',
  authMiddleware,
  requireRole(ROLE.ADMIN),
  async (req: Request, res: Response) => {
    const data = validate(userRoleSchema, req.body);

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
