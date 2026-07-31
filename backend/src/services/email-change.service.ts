import crypto from 'node:crypto';
import bcrypt from 'bcrypt';
import { Prisma } from '@prisma/client';
import { getConfig } from '../config.js';
import { prisma } from '../db.js';
import { AppError, NotFoundError, ValidationError } from '../utils/errors.js';
import { resolvePasswordResetOrigin } from '../utils/site-url.js';
import * as i18nService from './i18n.service.js';
import * as mailConfigService from './mail-config.service.js';
import * as mailService from './mail.service.js';
import * as rateLimitConfigService from './rate-limit-config.service.js';
import * as refreshSessionService from './refresh-session.service.js';
import { resolveSiteTitle } from './site.js';
import { USER_PUBLIC_SELECT } from './constants.js';
import { normalizeEmail } from './registration-email-verification.service.js';

const CODE_EXPIRY_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const CODE_DIGITS = 6;
const CANCEL_TOKEN_BYTES = 32;

function t(messages: Record<string, string>, key: string, params: Record<string, string> = {}) {
  let value = messages[key] ?? key;
  for (const [param, replacement] of Object.entries(params)) {
    value = value.replaceAll(`{${param}}`, replacement);
  }
  return value;
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function createCode(): string {
  const lowerBound = 10 ** (CODE_DIGITS - 1);
  return String(crypto.randomInt(lowerBound, lowerBound * 10));
}

function codeHash(userId: number, email: string, code: string): string {
  return crypto
    .createHmac('sha256', getConfig().security.jwtSecret)
    .update(`${userId}\0${email}\0${code}`)
    .digest('hex');
}

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function safeHashEqual(actual: string, expected: string): boolean {
  return (
    actual.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(actual, 'hex'), Buffer.from(expected, 'hex'))
  );
}

function buildCancelUrl(token: string, origin: string): string {
  const url = new URL('/cancel-email-change', origin);
  url.searchParams.set('token', token);
  return url.toString();
}

function buildVerificationEmail(input: { siteName: string; code: string; languageId: string }) {
  const siteName = resolveSiteTitle(input.siteName);
  const messages = i18nService.getLanguage(
    i18nService.resolveLanguageId(input.languageId),
  ).messages;
  const minutes = String(Math.floor(CODE_EXPIRY_MS / 60_000));
  const subject = t(messages, 'mail.emailChangeVerification.subject', { siteName });
  const title = t(messages, 'mail.emailChangeVerification.title');
  const intro = t(messages, 'mail.emailChangeVerification.intro', { siteName });
  const expiry = t(messages, 'mail.emailChangeVerification.expiry', { minutes });
  const ignore = t(messages, 'mail.emailChangeVerification.ignore');
  const safeSiteName = escapeHtml(siteName);
  const safeCode = escapeHtml(input.code);

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f8fafc;"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;"><div style="font-size:13px;color:#64748b;">${safeSiteName}</div><h1 style="margin:8px 0 0;font-size:22px;">${escapeHtml(title)}</h1></td></tr>
        <tr><td style="padding:24px 28px;"><p style="margin:0 0 20px;line-height:24px;color:#334155;">${escapeHtml(intro)}</p><div style="padding:16px;background:#f1f5f9;text-align:center;font-size:30px;font-weight:700;letter-spacing:.24em;">${safeCode}</div><p style="margin:20px 0 0;color:#64748b;">${escapeHtml(expiry)}</p><p style="margin:8px 0 0;color:#64748b;">${escapeHtml(ignore)}</p></td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;
  const text = [`${siteName} - ${title}`, '', intro, '', input.code, '', expiry, ignore].join('\n');
  return { subject, html, text };
}

function buildOldAddressNotice(input: {
  siteName: string;
  newEmail: string;
  cancelUrl: string;
  languageId: string;
}) {
  const siteName = resolveSiteTitle(input.siteName);
  const messages = i18nService.getLanguage(
    i18nService.resolveLanguageId(input.languageId),
  ).messages;
  const minutes = String(Math.floor(CODE_EXPIRY_MS / 60_000));
  const subject = t(messages, 'mail.emailChangeNotice.subject', { siteName });
  const title = t(messages, 'mail.emailChangeNotice.title');
  const intro = t(messages, 'mail.emailChangeNotice.intro', { newEmail: input.newEmail });
  const button = t(messages, 'mail.emailChangeNotice.cancel');
  const expiry = t(messages, 'mail.emailChangeNotice.expiry', { minutes });
  const fallback = t(messages, 'mail.emailChangeNotice.fallback');
  const safeUrl = escapeHtml(input.cancelUrl);

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:32px 16px;background:#f8fafc;"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;"><div style="font-size:13px;color:#64748b;">${escapeHtml(siteName)}</div><h1 style="margin:8px 0 0;font-size:22px;">${escapeHtml(title)}</h1></td></tr>
        <tr><td style="padding:24px 28px;"><p style="margin:0 0 20px;line-height:24px;color:#334155;">${escapeHtml(intro)}</p><a href="${safeUrl}" style="display:inline-block;padding:10px 16px;background:#0f172a;color:#fff;text-decoration:none;border-radius:6px;">${escapeHtml(button)}</a><p style="margin:20px 0 0;color:#64748b;">${escapeHtml(expiry)}</p><p style="margin:20px 0 8px;font-size:12px;color:#94a3b8;">${escapeHtml(fallback)}</p><p style="margin:0;word-break:break-all;font-size:12px;color:#64748b;">${safeUrl}</p></td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;
  const text = [`${siteName} - ${title}`, '', intro, '', input.cancelUrl, '', expiry].join('\n');
  return { subject, html, text };
}

async function clearRequest(
  userId: number,
  requestId: string,
  pendingEmail: string,
): Promise<void> {
  await prisma()
    .$transaction(async (tx) => {
      await tx.emailChangeRequest.deleteMany({ where: { id: requestId, userId } });
      await tx.user.updateMany({
        where: { id: userId, pendingEmail },
        data: { pendingEmail: null },
      });
    })
    .catch(() => {});
}

function conflictError(error: unknown): never {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
    throw new AppError(409, '该邮箱已被注册或正在等待验证');
  }
  throw error;
}

export async function requestEmailChange(
  userId: number,
  email: string,
  currentPassword: string,
): Promise<{ accepted: true; pendingEmail: string; retryAfterSeconds: number }> {
  const user = await prisma().user.findUnique({ where: { id: userId } });
  if (!user) throw new NotFoundError('用户不存在');
  if (!(await bcrypt.compare(currentPassword, user.passwordHash))) {
    throw new ValidationError('当前密码错误');
  }

  const normalizedEmail = normalizeEmail(email);
  if (normalizedEmail === user.email) throw new ValidationError('新邮箱不能与当前邮箱相同');

  const [mailConfig, siteSettings, rateLimitConfig] = await Promise.all([
    mailConfigService.getFullMailConfig(),
    prisma().setupStatus.findFirst({
      select: { siteName: true, siteUrl: true, defaultLanguage: true },
    }),
    rateLimitConfigService.getRateLimitConfig(),
  ]);
  if (!mailConfigService.canSendPasswordResetMail(mailConfig)) {
    throw new ValidationError('邮件服务尚未启用，无法更换邮箱');
  }
  const actionOrigin = resolvePasswordResetOrigin(siteSettings?.siteUrl);
  if (!actionOrigin) {
    throw new ValidationError('站点地址未配置为安全的 HTTPS origin，邮箱更换不可用');
  }

  const code = createCode();
  const cancelToken = crypto.randomBytes(CANCEL_TOKEN_BYTES).toString('base64url');
  const expiresAt = new Date(Date.now() + CODE_EXPIRY_MS);
  const cooldownSeconds = rateLimitConfig.email.cooldownSeconds;
  const cooldownCutoff = new Date(Date.now() - cooldownSeconds * 1_000);

  let created: { id: string };
  try {
    created = await prisma().$transaction(async (tx) => {
      const now = new Date();
      const reservation = await tx.emailChangeRequest.findUnique({
        where: { newEmail: normalizedEmail },
      });
      if (reservation && reservation.userId !== userId) {
        if (reservation.expiresAt > now) {
          throw new AppError(409, '该邮箱已被注册或正在等待验证');
        }
        await tx.emailChangeRequest.delete({ where: { id: reservation.id } });
        await tx.user.updateMany({
          where: { id: reservation.userId, pendingEmail: normalizedEmail },
          data: { pendingEmail: null },
        });
      }

      const emailOwner = await tx.user.findFirst({
        where: { id: { not: userId }, email: normalizedEmail },
        select: { id: true },
      });
      if (emailOwner) throw new AppError(409, '该邮箱已被注册');

      if (!reservation) {
        await tx.user.updateMany({
          where: { id: { not: userId }, pendingEmail: normalizedEmail },
          data: { pendingEmail: null },
        });
      }

      const existing = await tx.emailChangeRequest.findUnique({ where: { userId } });
      if (existing && existing.createdAt > cooldownCutoff) {
        throw new AppError(429, '邮箱更换邮件发送过于频繁，请稍后再试');
      }
      if (existing) await tx.emailChangeRequest.delete({ where: { id: existing.id } });

      await tx.user.update({ where: { id: userId }, data: { pendingEmail: normalizedEmail } });
      return tx.emailChangeRequest.create({
        data: {
          userId,
          newEmail: normalizedEmail,
          codeHash: codeHash(userId, normalizedEmail, code),
          cancelTokenHash: tokenHash(cancelToken),
          expiresAt,
        },
      });
    });
  } catch (error) {
    conflictError(error);
  }

  const siteName = resolveSiteTitle(siteSettings?.siteName);
  const languageId = i18nService.resolveLanguageId(siteSettings?.defaultLanguage);
  try {
    await mailService.sendMail({
      to: normalizedEmail,
      ...buildVerificationEmail({ siteName, code, languageId }),
    });
    await mailService.sendMail({
      to: user.email,
      ...buildOldAddressNotice({
        siteName,
        newEmail: normalizedEmail,
        cancelUrl: buildCancelUrl(cancelToken, actionOrigin),
        languageId,
      }),
    });
  } catch {
    await clearRequest(userId, created.id, normalizedEmail);
    throw new AppError(503, '邮箱更换邮件发送失败，请稍后重试');
  }

  return { accepted: true, pendingEmail: normalizedEmail, retryAfterSeconds: cooldownSeconds };
}

export async function verifyEmailChange(
  userId: number,
  code: string,
): Promise<{
  user: Prisma.UserGetPayload<{ select: typeof USER_PUBLIC_SELECT }>;
  refreshToken: string;
}> {
  const request = await prisma().emailChangeRequest.findUnique({ where: { userId } });
  if (!request || request.expiresAt <= new Date() || request.attempts >= MAX_CODE_ATTEMPTS) {
    throw new ValidationError('邮箱验证码错误或已失效，请重新获取');
  }

  const actualHash = codeHash(userId, request.newEmail, code);
  if (!safeHashEqual(actualHash, request.codeHash)) {
    await prisma().emailChangeRequest.updateMany({
      where: { id: request.id, codeHash: request.codeHash, attempts: { lt: MAX_CODE_ATTEMPTS } },
      data: { attempts: { increment: 1 } },
    });
    throw new ValidationError('邮箱验证码错误或已失效，请重新获取');
  }

  try {
    return await prisma().$transaction(async (tx) => {
      const current = await tx.emailChangeRequest.findUnique({ where: { userId } });
      if (
        !current ||
        current.id !== request.id ||
        current.codeHash !== request.codeHash ||
        current.expiresAt <= new Date() ||
        current.attempts >= MAX_CODE_ATTEMPTS
      ) {
        throw new ValidationError('邮箱验证码错误或已失效，请重新获取');
      }

      const conflict = await tx.user.findFirst({
        where: { id: { not: userId }, email: current.newEmail },
        select: { id: true },
      });
      if (conflict) throw new AppError(409, '该邮箱已被注册');

      const updated = await tx.user.update({
        where: { id: userId, pendingEmail: current.newEmail },
        data: { email: current.newEmail, pendingEmail: null },
        select: USER_PUBLIC_SELECT,
      });
      await tx.emailChangeRequest.delete({ where: { id: current.id } });
      await refreshSessionService.revokeAllUserRefreshSessions(userId, tx);
      const refreshToken = await refreshSessionService.createRefreshSession(userId, tx);
      return { user: updated, refreshToken };
    });
  } catch (error) {
    conflictError(error);
  }
}

export async function cancelPendingEmailChange(userId: number): Promise<{ cancelled: true }> {
  await prisma().$transaction(async (tx) => {
    const user = await tx.user.findUnique({ where: { id: userId }, select: { id: true } });
    if (!user) throw new NotFoundError('用户不存在');
    await tx.emailChangeRequest.deleteMany({ where: { userId } });
    await tx.user.update({ where: { id: userId }, data: { pendingEmail: null } });
  });
  return { cancelled: true };
}

export async function cancelEmailChange(token: string): Promise<{ cancelled: true }> {
  const request = await prisma().emailChangeRequest.findUnique({
    where: { cancelTokenHash: tokenHash(token) },
  });
  if (!request) throw new ValidationError('邮箱更换撤销链接无效或已失效');

  await prisma().$transaction(async (tx) => {
    const deleted = await tx.emailChangeRequest.deleteMany({
      where: { id: request.id, cancelTokenHash: request.cancelTokenHash },
    });
    if (deleted.count !== 1) throw new ValidationError('邮箱更换撤销链接无效或已失效');
    await tx.user.updateMany({
      where: { id: request.userId, pendingEmail: request.newEmail },
      data: { pendingEmail: null },
    });
  });
  return { cancelled: true };
}
