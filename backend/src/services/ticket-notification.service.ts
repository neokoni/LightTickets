import jwt, { type JwtPayload, type SignOptions } from 'jsonwebtoken';
import { prisma } from '../db.js';
import { getConfig } from '../config.js';
import { ValidationError } from '../utils/errors.js';
import type { TicketStatus } from '@prisma/client';
import * as i18nService from './i18n.service.js';
import * as mailConfigService from './mail-config.service.js';
import * as mailService from './mail.service.js';
import { resolveSiteTitle } from './site.js';

const UNSUBSCRIBE_PURPOSE = 'ticket-email-unsubscribe';
const UNSUBSCRIBE_TOKEN_EXPIRY = '30d';
const FALLBACK_SITE_ORIGIN = 'http://localhost:23310';

type NotificationEvent =
  | { type: 'comment'; body: string }
  | { type: 'status'; oldStatus: TicketStatus; newStatus: TicketStatus };

function translate(
  messages: Record<string, string>,
  key: string,
  params: Record<string, string> = {},
) {
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

function resolveOrigin(siteUrl: string | null): string {
  try {
    return new URL(siteUrl || FALLBACK_SITE_ORIGIN).origin;
  } catch {
    return FALLBACK_SITE_ORIGIN;
  }
}

function absoluteUrl(value: string | null, origin: string): string | null {
  if (!value) return null;
  try {
    return new URL(value, origin).toString();
  } catch {
    return null;
  }
}

function statusKey(status: TicketStatus): string {
  return status === 'in_progress' ? 'ticket.status.inProgress' : `ticket.status.${status}`;
}

export function createUnsubscribeToken(userId: number): string {
  return jwt.sign({ userId, purpose: UNSUBSCRIBE_PURPOSE }, getConfig().security.jwtSecret, {
    expiresIn: UNSUBSCRIBE_TOKEN_EXPIRY,
  } as SignOptions);
}

function readUnsubscribeUserId(token: string): number {
  try {
    const payload = jwt.verify(token, getConfig().security.jwtSecret) as JwtPayload;
    if (
      payload.purpose !== UNSUBSCRIBE_PURPOSE ||
      typeof payload.userId !== 'number' ||
      !Number.isInteger(payload.userId)
    ) {
      throw new Error('invalid payload');
    }
    return payload.userId;
  } catch {
    throw new ValidationError('退订链接无效或已过期');
  }
}

export async function unsubscribe(token: string) {
  const userId = readUnsubscribeUserId(token);
  const updated = await prisma().user.updateMany({
    where: { id: userId },
    data: { receiveEmailNotifications: false },
  });
  if (updated.count !== 1) throw new ValidationError('退订链接无效或已过期');
  return { unsubscribed: true as const };
}

function buildEmail(input: {
  siteName: string;
  siteUrl: string | null;
  languageId: string;
  ticketId: number;
  ticketTitle: string;
  actorName: string;
  actorAvatarUrl: string | null;
  unsubscribeToken: string;
  event: NotificationEvent;
}) {
  const pack = i18nService.getLanguage(i18nService.resolveLanguageId(input.languageId));
  const messages = pack.messages;
  const siteName = resolveSiteTitle(input.siteName);
  const origin = resolveOrigin(input.siteUrl);
  const ticketUrl = `${origin}/tickets/${input.ticketId}`;
  const unsubscribeUrl = `${origin}/unsubscribe?token=${encodeURIComponent(input.unsubscribeToken)}`;
  const avatarUrl = absoluteUrl(input.actorAvatarUrl, origin);
  const eventTitle = translate(
    messages,
    input.event.type === 'comment'
      ? 'mail.ticketNotification.commentTitle'
      : 'mail.ticketNotification.statusTitle',
  );
  const detail =
    input.event.type === 'comment'
      ? input.event.body
      : translate(messages, 'mail.ticketNotification.statusDetail', {
          oldStatus: translate(messages, statusKey(input.event.oldStatus)),
          newStatus: translate(messages, statusKey(input.event.newStatus)),
        });
  const subject = translate(messages, 'mail.ticketNotification.subject', {
    siteName,
    ticketTitle: input.ticketTitle,
  });
  const intro = translate(messages, 'mail.ticketNotification.intro', {
    event: eventTitle,
  });
  const safeActorName = escapeHtml(input.actorName);
  const avatar = avatarUrl
    ? `<img src="${escapeHtml(avatarUrl)}" width="40" height="40" alt="${safeActorName}" style="display:block;width:40px;height:40px;border-radius:50%;object-fit:cover;background:#e2e8f0;" />`
    : `<div style="width:40px;height:40px;border-radius:50%;background:#e2e8f0;color:#475569;text-align:center;line-height:40px;font-size:16px;font-weight:700;">${escapeHtml(input.actorName.slice(0, 1).toUpperCase())}</div>`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#f8fafc;font-family:Arial,sans-serif;color:#0f172a;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="padding:28px 16px;background:#f8fafc;"><tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;background:#fff;border:1px solid #e2e8f0;border-radius:8px;overflow:hidden;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #e2e8f0;"><div style="font-size:13px;color:#64748b;">${escapeHtml(siteName)}</div><h1 style="margin:8px 0 0;font-size:21px;line-height:29px;">${escapeHtml(input.ticketTitle)}</h1></td></tr>
        <tr><td style="padding:24px 28px;">
          <table role="presentation" cellspacing="0" cellpadding="0"><tr><td style="padding-right:12px;vertical-align:top;">${avatar}</td><td style="vertical-align:middle;"><strong style="font-size:14px;">${safeActorName}</strong><div style="margin-top:3px;font-size:13px;color:#64748b;">${escapeHtml(intro)}</div></td></tr></table>
          <div style="margin:20px 0;padding:14px 16px;background:#f8fafc;border-left:3px solid #64748b;white-space:pre-wrap;word-break:break-word;font-size:14px;line-height:22px;">${escapeHtml(detail)}</div>
          <a href="${escapeHtml(ticketUrl)}" style="display:inline-block;padding:10px 16px;border-radius:6px;background:#0f172a;color:#fff;text-decoration:none;font-size:14px;font-weight:600;">${escapeHtml(translate(messages, 'mail.ticketNotification.viewTicket'))}</a>
        </td></tr>
        <tr><td style="padding:16px 28px;border-top:1px solid #e2e8f0;font-size:12px;line-height:20px;color:#64748b;">${escapeHtml(translate(messages, 'mail.ticketNotification.footer'))} <a href="${escapeHtml(unsubscribeUrl)}" style="color:#475569;">${escapeHtml(translate(messages, 'mail.ticketNotification.unsubscribe'))}</a></td></tr>
      </table>
    </td></tr></table>
  </body>
</html>`;
  const text = [
    `${siteName} - ${input.ticketTitle}`,
    '',
    `${input.actorName}: ${intro}`,
    detail,
    '',
    `${translate(messages, 'mail.ticketNotification.viewTicket')}: ${ticketUrl}`,
    `${translate(messages, 'mail.ticketNotification.unsubscribe')}: ${unsubscribeUrl}`,
  ].join('\n');
  return { subject, html, text };
}

export async function notifyTicketAuthor(
  ticketId: number,
  actorUserId: number,
  event: NotificationEvent,
): Promise<void> {
  try {
    const [status, mailConfig] = await Promise.all([
      prisma().setupStatus.findFirst(),
      mailConfigService.getFullMailConfig(),
    ]);
    if (
      !status?.sendEmailNotifications ||
      !mailConfigService.canSendPasswordResetMail(mailConfig)
    ) {
      return;
    }

    const ticket = await prisma().ticket.findUnique({
      where: { id: ticketId },
      select: {
        id: true,
        title: true,
        authorId: true,
        author: {
          select: { email: true, username: true, receiveEmailNotifications: true },
        },
      },
    });
    if (!ticket || ticket.authorId === actorUserId || !ticket.author.receiveEmailNotifications) {
      return;
    }

    const actor = await prisma().user.findUnique({
      where: { id: actorUserId },
      select: { username: true, minecraftName: true, avatarUrl: true },
    });
    if (!actor) return;

    const mail = buildEmail({
      siteName: status.siteName,
      siteUrl: status.siteUrl,
      languageId: status.defaultLanguage,
      ticketId: ticket.id,
      ticketTitle: ticket.title,
      actorName: actor.minecraftName || actor.username,
      actorAvatarUrl: actor.avatarUrl,
      unsubscribeToken: createUnsubscribeToken(ticket.authorId),
      event,
    });
    await mailService.sendMail({ to: ticket.author.email, ...mail });
  } catch {
    // Notification delivery must never make the originating ticket operation fail.
  }
}
