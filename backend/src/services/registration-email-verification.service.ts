import crypto from 'node:crypto';
import { Prisma } from '@prisma/client';
import { getConfig } from '../config.js';
import { prisma } from '../db.js';
import { AppError, ValidationError } from '../utils/errors.js';
import * as i18nService from './i18n.service.js';
import * as mailConfigService from './mail-config.service.js';
import * as mailService from './mail.service.js';
import * as rateLimitConfigService from './rate-limit-config.service.js';
import * as setupService from './setup.service.js';
import { resolveSiteTitle } from './site.js';

const CODE_EXPIRY_MS = 10 * 60 * 1000;
const MAX_CODE_ATTEMPTS = 5;
const CODE_DIGITS = 6;

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

function createCodeHash(email: string, code: string): string {
  return crypto
    .createHmac('sha256', getConfig().security.jwtSecret)
    .update(`${email}\0${code}`)
    .digest('hex');
}

function buildVerificationEmail(input: { siteName: string; code: string; languageId: string }) {
  const siteName = resolveSiteTitle(input.siteName);
  const pack = i18nService.getLanguage(i18nService.resolveLanguageId(input.languageId));
  const messages = pack.messages;
  const minutes = String(Math.floor(CODE_EXPIRY_MS / 60_000));
  const subject = t(messages, 'mail.registrationVerification.subject', { siteName });
  const title = t(messages, 'mail.registrationVerification.title');
  const intro = t(messages, 'mail.registrationVerification.intro', { siteName });
  const expiry = t(messages, 'mail.registrationVerification.expiry', { minutes });
  const ignore = t(messages, 'mail.registrationVerification.ignore');
  const safeSiteName = escapeHtml(siteName);
  const safeCode = escapeHtml(input.code);

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
                <p style="margin:0 0 20px;font-size:15px;line-height:24px;color:#334155;">${escapeHtml(intro)}</p>
                <div style="padding:16px;border-radius:8px;background:#f1f5f9;text-align:center;font-size:30px;line-height:38px;font-weight:700;letter-spacing:.24em;color:#0f172a;">${safeCode}</div>
                <p style="margin:20px 0 0;font-size:13px;line-height:22px;color:#64748b;">${escapeHtml(expiry)}</p>
                <p style="margin:8px 0 0;font-size:13px;line-height:22px;color:#64748b;">${escapeHtml(ignore)}</p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = [`${siteName} - ${title}`, '', intro, '', input.code, '', expiry, ignore].join('\n');

  return { subject, html, text };
}

async function reserveCode(
  email: string,
  codeHash: string,
  now: Date,
  cooldownSeconds: number,
): Promise<void> {
  const cutoff = new Date(now.getTime() - cooldownSeconds * 1_000);
  const expiresAt = new Date(now.getTime() + CODE_EXPIRY_MS);
  const updated = await prisma().registrationEmailVerification.updateMany({
    where: { email, createdAt: { lte: cutoff } },
    data: { codeHash, expiresAt, attempts: 0, createdAt: now },
  });
  if (updated.count === 1) return;

  try {
    await prisma().registrationEmailVerification.create({
      data: { email, codeHash, expiresAt, createdAt: now },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new AppError(429, '验证码发送过于频繁，请稍后再试');
    }
    throw error;
  }
}

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export async function requestRegistrationEmailVerification(email: string): Promise<{
  accepted: true;
  retryAfterSeconds: number;
}> {
  const mailConfig = await mailConfigService.getFullMailConfig();
  if (!mailConfigService.canSendPasswordResetMail(mailConfig)) {
    throw new ValidationError('邮件服务尚未启用');
  }

  const normalizedEmail = normalizeEmail(email);
  const existingUser = await prisma().user.findUnique({ where: { email: normalizedEmail } });
  if (existingUser) throw new AppError(409, '该邮箱已被注册');

  const code = createCode();
  const codeHash = createCodeHash(normalizedEmail, code);
  const now = new Date();
  const rateLimitConfig = await rateLimitConfigService.getRateLimitConfig();
  const { cooldownSeconds } = rateLimitConfig.email;
  await prisma().registrationEmailVerification.deleteMany({
    where: { expiresAt: { lte: now } },
  });
  await reserveCode(normalizedEmail, codeHash, now, cooldownSeconds);

  try {
    const siteConfig = await setupService.getSiteConfig();
    const mail = buildVerificationEmail({
      siteName: siteConfig.siteName,
      code,
      languageId: siteConfig.defaultLanguage,
    });
    await mailService.sendMail({
      to: normalizedEmail,
      subject: mail.subject,
      html: mail.html,
      text: mail.text,
    });
  } catch {
    await prisma().registrationEmailVerification.deleteMany({
      where: { email: normalizedEmail, codeHash },
    });
    throw new AppError(503, '验证邮件发送失败，请稍后重试');
  }

  return {
    accepted: true,
    retryAfterSeconds: cooldownSeconds,
  };
}

export async function verifyRegistrationCode(email: string, code: string): Promise<string> {
  const normalizedEmail = normalizeEmail(email);
  const verification = await prisma().registrationEmailVerification.findUnique({
    where: { email: normalizedEmail },
  });
  if (
    !verification ||
    verification.expiresAt <= new Date() ||
    verification.attempts >= MAX_CODE_ATTEMPTS
  ) {
    throw new ValidationError('邮箱验证码错误或已失效，请重新获取');
  }

  const actualHash = createCodeHash(normalizedEmail, code);
  const matches =
    actualHash.length === verification.codeHash.length &&
    crypto.timingSafeEqual(
      Buffer.from(actualHash, 'hex'),
      Buffer.from(verification.codeHash, 'hex'),
    );
  if (!matches) {
    await prisma().registrationEmailVerification.updateMany({
      where: {
        email: normalizedEmail,
        codeHash: verification.codeHash,
        attempts: { lt: MAX_CODE_ATTEMPTS },
      },
      data: { attempts: { increment: 1 } },
    });
    throw new ValidationError('邮箱验证码错误或已失效，请重新获取');
  }

  return verification.codeHash;
}

export async function consumeRegistrationCode(
  tx: Prisma.TransactionClient,
  email: string,
  codeHash: string,
): Promise<void> {
  const consumed = await tx.registrationEmailVerification.deleteMany({
    where: {
      email: normalizeEmail(email),
      codeHash,
      expiresAt: { gt: new Date() },
      attempts: { lt: MAX_CODE_ATTEMPTS },
    },
  });
  if (consumed.count !== 1) {
    throw new ValidationError('邮箱验证码错误或已失效，请重新获取');
  }
}
