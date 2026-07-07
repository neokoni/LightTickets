import { describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import { prisma } from './setup.js';
import * as mcService from '../src/services/mc.service.js';

async function createServer(name: string) {
  return prisma().server.create({ data: { name, apiKey: `${name}-key` } });
}

async function createLinkedUser(input: {
  email: string;
  username: string;
  minecraftUuid: string;
  minecraftName: string;
  role?: 'player' | 'staff' | 'admin';
}) {
  return prisma().user.create({
    data: {
      email: input.email,
      username: input.username,
      passwordHash: await bcrypt.hash('Password123!', 12),
      minecraftUuid: input.minecraftUuid,
      minecraftName: input.minecraftName,
      role: input.role ?? 'player',
    },
  });
}

describe('mc.service', () => {
  it('creates a link code for an unlinked minecraft account', async () => {
    const server = await createServer('mc-service-link');

    const result = await mcService.createLinkCode({
      minecraftUuid: 'mc-service-link-uuid',
      minecraftName: 'Linker',
      serverId: server.id,
    });

    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.expiresAt).toBeInstanceOf(Date);
  });

  it('rejects link code creation for an already linked minecraft account', async () => {
    const server = await createServer('mc-service-link-bound');
    await createLinkedUser({
      email: 'mc-service-link-bound@test.com',
      username: 'mcservicelinkbound',
      minecraftUuid: 'mc-service-link-bound-uuid',
      minecraftName: 'Bound',
    });

    await expect(
      mcService.createLinkCode({
        minecraftUuid: 'mc-service-link-bound-uuid',
        minecraftName: 'Bound',
        serverId: server.id,
      }),
    ).rejects.toMatchObject({ statusCode: 409 });
  });

  it('returns a linked user by minecraft uuid', async () => {
    await createLinkedUser({
      email: 'mc-service-user@test.com',
      username: 'mcserviceuser',
      minecraftUuid: 'mc-service-user-uuid',
      minecraftName: 'Lookup',
    });

    const user = await mcService.getLinkedUser('mc-service-user-uuid');

    expect(user.username).toBe('mcserviceuser');
    expect(user.minecraftUuid).toBe('mc-service-user-uuid');
  });

  it('creates a ticket for a linked minecraft user', async () => {
    const server = await createServer('mc-service-ticket');
    await createLinkedUser({
      email: 'mc-service-ticket@test.com',
      username: 'mcserviceticket',
      minecraftUuid: 'mc-service-ticket-uuid',
      minecraftName: 'TicketUser',
    });

    const ticket = await mcService.createTicketFromMinecraft({
      minecraftUuid: 'mc-service-ticket-uuid',
      title: 'From service',
      body: 'Body',
      template: 'bug_report',
      formData: {},
      serverId: server.id,
    });

    expect(ticket.title).toBe('From service');
    expect(ticket.serverId).toBe(server.id);
  });

  it('creates a minecraft comment for a linked user', async () => {
    const server = await createServer('mc-service-comment');
    const user = await createLinkedUser({
      email: 'mc-service-comment@test.com',
      username: 'mcservicecomment',
      minecraftUuid: 'mc-service-comment-uuid',
      minecraftName: 'CommentUser',
    });
    const ticket = await prisma().ticket.create({
      data: {
        title: 'T',
        body: 'B',
        template: 'bug_report',
        authorId: user.id,
        serverId: server.id,
      },
    });

    const comment = await mcService.createCommentFromMinecraft({
      minecraftUuid: 'mc-service-comment-uuid',
      ticketId: ticket.id,
      body: 'From MC',
    });

    expect(comment.body).toBe('From MC');
    expect(comment.source).toBe('minecraft');
  });

  it('closes, reopens, and updates status for a linked minecraft user', async () => {
    const server = await createServer('mc-service-status');
    const user = await createLinkedUser({
      email: 'mc-service-status@test.com',
      username: 'mcservicestatus',
      minecraftUuid: 'mc-service-status-uuid',
      minecraftName: 'StatusUser',
      role: 'staff',
    });
    const ticket = await prisma().ticket.create({
      data: {
        title: 'T',
        body: 'B',
        template: 'bug_report',
        authorId: user.id,
        serverId: server.id,
      },
    });

    const closed = await mcService.closeTicketFromMinecraft(ticket.id, 'mc-service-status-uuid');
    expect(closed.status).toBe('closed');

    const reopened = await mcService.reopenTicketFromMinecraft(ticket.id, 'mc-service-status-uuid');
    expect(reopened.status).toBe('open');

    const invalid = await mcService.updateTicketStatusFromMinecraft(ticket.id, {
      minecraftUuid: 'mc-service-status-uuid',
      status: 'invalid',
    });
    expect(invalid.status).toBe('invalid');
  });
});
