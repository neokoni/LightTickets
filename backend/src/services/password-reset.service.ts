import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../db.js';
import { AppError, ValidationError } from '../utils/errors.js';
import * as i18nService from './i18n.service.js';
import * as mailService from './mail.service.js';
import * as mailConfigService from './mail-config.service.js';
import * as rateLimitConfigService from './rate-limit-config.service.js';
import { resolveSiteTitle } from './site.js';
import { resolvePasswordResetOrigin } from '../utils/site-url.js';
import * as refreshSessionService from './refresh-session.service.js';

const RESET_TOKEN_BYTES = 32;
const RESET_TOKEN_EXPIRY_MS = 30 * 60 * 1000;
const MISSING_ACCOUNT_COOLDOWNS = new Map<string, number>();
const COOLDOWN_CLEANUP_INTERVAL_MS = 60_000;

const cooldownCleanup = setInterval(() => {
  const now = Date.now();
  for (const [key, resetAt] of MISSING_ACCOUNT_COOLDOWNS) {
    if (resetAt <= now) MISSING_ACCOUNT_COOLDOWNS.delete(key);
  }
}, COOLDOWN_CLEANUP_INTERVAL_MS);
cooldownCleanup.unref();

function tokenHash(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function reserveMissingAccountCooldown(identifier: string, cooldownMs: number): void {
  const key = tokenHash(identifier.toLowerCase());
  const now = Date.now();
  const resetAt = MISSING_ACCOUNT_COOLDOWNS.get(key);
  if (resetAt && resetAt > now) {
    throw new AppError(429, '密码重置邮件发送过于频繁，请稍后再试');
  }
  MISSING_ACCOUNT_COOLDOWNS.set(key, now + cooldownMs);
}

function t(messages: Record<string, string>, key: string, params: Record<string, string> = {}) {
  let value = messages[key] ?? key;
  for (const [param, replacement] of Object.entries(params)) {
    value = value.replaceAll(`{${param}}`, replacement);
  }
  return value;
}

function buildResetUrl(token: string, origin: string): string {
  const url = new URL('/reset-password', origin);
  url.searchParams.set('token', token);
  return url.toString();
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function buildResetEmail(input: {
  siteName: string;
  username: string;
  resetUrl: string;
  languageId: string;
}) {
  const siteName = resolveSiteTitle(input.siteName);
  const pack = i18nService.getLanguage(i18nService.resolveLanguageId(input.languageId));
  const messages = pack.messages;
  const minutes = String(Math.floor(RESET_TOKEN_EXPIRY_MS / 60000));
  const subject = t(messages, 'mail.passwordReset.subject', { siteName });
  const title = t(messages, 'mail.passwordReset.title');
  const greeting = t(messages, 'mail.passwordReset.greeting', { username: input.username });
  const intro = t(messages, 'mail.passwordReset.intro', { siteName });
  const button = t(messages, 'mail.passwordReset.button');
  const expiry = t(messages, 'mail.passwordReset.expiry', { minutes });
  const ignore = t(messages, 'mail.passwordReset.ignore');
  const fallback = t(messages, 'mail.passwordReset.fallback');
  const safeSiteName = escapeHtml(siteName);
  const safeResetUrl = escapeHtml(input.resetUrl);

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Inter,ui-sans-serif,system-ui,-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f8fafc;padding:32px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
            <tr>
              <td style="padding:28px 32px;border-bottom:1px solid #e2e8f0;">
                <div style="font-size:12px;font-weight:700;letter-spacing:.16em;text-transform:uppercase;color:#64748b;">${safeSiteName}</div>
                <h1 style="margin:12px 0 0;font-size:24px;line-height:32px;font-weight:700;color:#020617;">${escapeHtml(title)}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:28px 32px;">
                <p style="margin:0 0 16px;font-size:15px;line-height:24px;color:#334155;">${escapeHtml(greeting)}</p>
                <p style="margin:0 0 24px;font-size:15px;line-height:24px;color:#334155;">${escapeHtml(intro)}</p>
                <a href="${safeResetUrl}" style="display:inline-block;padding:10px 16px;border-radius:8px;background:#0f172a;color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">${escapeHtml(button)}</a>
                <p style="margin:24px 0 0;font-size:13px;line-height:22px;color:#64748b;">${escapeHtml(expiry)}</p>
                <p style="margin:8px 0 0;font-size:13px;line-height:22px;color:#64748b;">${escapeHtml(ignore)}</p>
                <p style="margin:24px 0 8px;font-size:12px;line-height:20px;color:#94a3b8;">${escapeHtml(fallback)}</p>
                <p style="margin:0;word-break:break-all;font-size:12px;line-height:20px;color:#64748b;">${safeResetUrl}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [
    `${siteName} - ${title}`,
    '',
    greeting,
    intro,
    '',
    input.resetUrl,
    '',
    expiry,
    ignore,
  ].join('\n');

  return { subject, html, text };
}

export async function requestPasswordReset(emailOrUsername: string): Promise<void> {
  const [mailConfig, siteSettings] = await Promise.all([
    mailConfigService.getFullMailConfig(),
    prisma().setupStatus.findFirst({
      select: { siteName: true, siteUrl: true, defaultLanguage: true },
    }),
  ]);
  if (!mailConfigService.canSendPasswordResetMail(mailConfig)) {
    throw new ValidationError('邮件服务尚未启用');
  }
  const resetOrigin = resolvePasswordResetOrigin(siteSettings?.siteUrl);
  if (!resetOrigin) {
    throw new ValidationError('站点地址未配置为安全的 HTTPS origin，密码重置不可用');
  }

  const identifier = emailOrUsername.trim();
  const rateLimitConfig = await rateLimitConfigService.getRateLimitConfig();
  const cooldownMs = rateLimitConfig.email.cooldownSeconds * 1_000;
  const user = await prisma().user.findUnique({
    where: identifier.includes('@') ? { email: identifier } : { username: identifier },
  });
  if (!user) {
    reserveMissingAccountCooldown(identifier, cooldownMs);
    return;
  }

  const rawToken = crypto.randomBytes(RESET_TOKEN_BYTES).toString('base64url');
  const hash = tokenHash(rawToken);
  const expiresAt = new Date(Date.now() + RESET_TOKEN_EXPIRY_MS);
  const resetUrl = buildResetUrl(rawToken, resetOrigin);
  const mail = buildResetEmail({
    siteName: resolveSiteTitle(siteSettings?.siteName),
    username: user.username,
    resetUrl,
    languageId: i18nService.resolveLanguageId(siteSettings?.defaultLanguage),
  });

  const created = await prisma().$transaction(async (tx) => {
    const recentToken = await tx.passwordResetToken.findFirst({
      where: {
        userId: user.id,
        createdAt: { gte: new Date(Date.now() - cooldownMs) },
      },
      select: { id: true },
    });
    if (recentToken) {
      throw new AppError(429, '密码重置邮件发送过于频繁，请稍后再试');
    }

    await tx.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });
    return tx.passwordResetToken.create({
      data: { userId: user.id, tokenHash: hash, expiresAt },
    });
  });

  try {
    await mailService.sendMail({
      to: user.email,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  } catch (err) {
    await prisma()
      .passwordResetToken.delete({ where: { id: created.id } })
      .catch(() => {});
    throw err;
  }
}

export async function resetPassword(token: string, newPassword: string): Promise<void> {
  if (newPassword.length < 8) throw new ValidationError('密码至少 8 位');

  const hash = tokenHash(token);
  const resetToken = await prisma().passwordResetToken.findFirst({
    where: {
      tokenHash: hash,
      usedAt: null,
      expiresAt: { gt: new Date() },
    },
  });
  if (!resetToken) throw new ValidationError('重置链接无效或已过期');

  const passwordHash = await bcrypt.hash(newPassword, 12);
  await prisma().$transaction(async (tx) => {
    const now = new Date();
    await tx.emailChangeRequest.deleteMany({ where: { userId: resetToken.userId } });
    await tx.user.update({
      where: { id: resetToken.userId },
      data: { passwordHash, pendingEmail: null, tokenEpoch: { increment: 1 } },
    });
    await tx.passwordResetToken.update({
      where: { id: resetToken.id },
      data: { usedAt: now },
    });
    await tx.passwordResetToken.updateMany({
      where: { userId: resetToken.userId, usedAt: null },
      data: { usedAt: now },
    });
    await refreshSessionService.revokeAllUserRefreshSessions(resetToken.userId, tx);
  });
}
