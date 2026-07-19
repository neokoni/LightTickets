import bcrypt from 'bcrypt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from './setup.js';
import { clearTestOutbox, getTestOutbox } from '../src/services/mail.service.js';
import * as mailService from '../src/services/mail.service.js';
import * as commentService from '../src/services/comment.service.js';
import * as ticketService from '../src/services/ticket.service.js';

const mailConfig = {
  enabled: true,
  host: 'smtp.example.com',
  port: 587,
  secure: false,
  username: 'mailer',
  password: 'secret',
  fromName: 'LightTickets',
  fromAddress: 'noreply@example.com',
};

async function configureNotifications(enabled = true) {
  await prisma().setupStatus.create({
    data: {
      isSetup: true,
      siteName: 'Test Tickets',
      siteUrl: 'https://tickets.example.com',
      sendEmailNotifications: enabled,
    },
  });
  await prisma().appConfig.create({ data: { mailConfig: JSON.stringify(mailConfig) } });
}

async function createUser(
  email: string,
  username: string,
  role: 'player' | 'staff' = 'player',
  receiveEmailNotifications = true,
) {
  return prisma().user.create({
    data: {
      email,
      username,
      passwordHash: await bcrypt.hash('Password123!', 4),
      role,
      receiveEmailNotifications,
      avatarUrl: role === 'staff' ? '/avatars/staff.png' : null,
    },
  });
}

async function createTicket(authorId: number) {
  return prisma().ticket.create({
    data: {
      title: '<Important> ticket',
      body: 'Ticket body',
      template: 'bug_report',
      authorId,
    },
  });
}

beforeEach(() => {
  clearTestOutbox();
  vi.restoreAllMocks();
});

describe('ticket email notifications', () => {
  it('emails the author when another user replies and renders safe absolute links', async () => {
    await configureNotifications();
    const author = await createUser('mail-author@test.com', 'mailauthor');
    const staff = await createUser('mail-staff@test.com', 'mailstaff', 'staff');
    const ticket = await createTicket(author.id);

    await commentService.create(ticket.id, staff.id, '<b>Staff reply</b>', undefined, 'staff');

    expect(getTestOutbox()).toHaveLength(1);
    const mail = getTestOutbox()[0];
    expect(mail.to).toBe(author.email);
    expect(mail.html).toContain('https://tickets.example.com/avatars/staff.png');
    expect(mail.html).toContain(`https://tickets.example.com/tickets/${ticket.id}`);
    expect(mail.html).toContain('https://tickets.example.com/unsubscribe?token=');
    expect(mail.html).toContain('&lt;b&gt;Staff reply&lt;/b&gt;');
    expect(mail.html).not.toContain('<b>Staff reply</b>');
  });

  it('emails the author when staff changes the status', async () => {
    await configureNotifications();
    const author = await createUser('status-author@test.com', 'statusauthor');
    const staff = await createUser('status-staff@test.com', 'statusstaff', 'staff');
    const ticket = await createTicket(author.id);

    await ticketService.update(ticket.id, staff.id, 'staff', { status: 'in_progress' });

    expect(getTestOutbox()).toHaveLength(1);
    expect(getTestOutbox()[0].text).toContain('状态由 开放 变更为 处理中');
  });

  it('does not email for self actions or when either preference is disabled', async () => {
    await configureNotifications(false);
    const author = await createUser('switch-author@test.com', 'switchauthor');
    const staff = await createUser('switch-staff@test.com', 'switchstaff', 'staff');
    const ticket = await createTicket(author.id);

    await commentService.create(ticket.id, staff.id, 'Platform disabled', undefined, 'staff');
    await commentService.create(ticket.id, author.id, 'Self reply');
    expect(getTestOutbox()).toHaveLength(0);

    await prisma().setupStatus.updateMany({ data: { sendEmailNotifications: true } });
    await prisma().user.update({
      where: { id: author.id },
      data: { receiveEmailNotifications: false },
    });
    await commentService.create(ticket.id, staff.id, 'Personal disabled', undefined, 'staff');
    expect(getTestOutbox()).toHaveLength(0);
  });

  it('keeps the reply when mail delivery fails', async () => {
    await configureNotifications();
    const author = await createUser('failure-author@test.com', 'failureauthor');
    const staff = await createUser('failure-staff@test.com', 'failurestaff', 'staff');
    const ticket = await createTicket(author.id);
    vi.spyOn(mailService, 'sendMail').mockRejectedValueOnce(new Error('SMTP unavailable'));

    const comment = await commentService.create(
      ticket.id,
      staff.id,
      'Persist despite failure',
      undefined,
      'staff',
    );

    expect(comment.body).toBe('Persist despite failure');
    expect(await prisma().comment.findUnique({ where: { id: comment.id } })).not.toBeNull();
  });
});
