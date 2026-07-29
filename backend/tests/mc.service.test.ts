import { describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import { prisma } from './setup.js';
import * as mcService from '../src/services/mc.service.js';
import { hashMinecraftSecret } from '../src/utils/minecraft-credential.js';
import type { MinecraftPlayerIdentity } from '../src/middleware/minecraft-player-session.js';
import { createApp } from '../src/app.js';

createApp();

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

function identity(
  user: { id: number; role: string; minecraftUuid: string | null },
  serverId: string,
): MinecraftPlayerIdentity {
  return {
    userId: user.id,
    role: user.role,
    minecraftUuid: user.minecraftUuid!,
    serverId,
  };
}

describe('mc.service', () => {
  it('creates a link code and credential for an unlinked minecraft account', async () => {
    const server = await createServer('mc-service-link');

    const result = await mcService.createLinkCode({
      minecraftUuid: 'mc-service-link-uuid',
      minecraftName: 'Linker',
      serverId: server.id,
    });

    expect(result.code).toMatch(/^\d{6}$/);
    expect(result.expiresAt).toBeInstanceOf(Date);
    expect(result.playerCredential.length).toBeGreaterThanOrEqual(32);
    const stored = await prisma().linkCode.findUniqueOrThrow({ where: { code: result.code } });
    expect(stored.playerCredentialHash).toBe(hashMinecraftSecret(result.playerCredential));
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

  it('issues a server-bound session only for a valid player credential', async () => {
    const server = await createServer('mc-service-session');
    const user = await createLinkedUser({
      email: 'mc-service-session@test.com',
      username: 'mcservicesession',
      minecraftUuid: 'mc-service-session-uuid',
      minecraftName: 'SessionUser',
    });
    const credential = 'mc-service-valid-player-credential-value';
    await prisma().minecraftPlayerCredential.create({
      data: {
        userId: user.id,
        minecraftUuid: user.minecraftUuid!,
        credentialHash: hashMinecraftSecret(credential),
      },
    });

    const session = await mcService.issuePlayerSession({
      minecraftUuid: user.minecraftUuid!,
      playerCredential: credential,
      serverId: server.id,
    });

    expect(session.sessionToken.length).toBeGreaterThanOrEqual(32);
    expect(session.expiresAt.getTime()).toBeGreaterThan(Date.now());
    await expect(
      mcService.issuePlayerSession({
        minecraftUuid: user.minecraftUuid!,
        playerCredential: 'invalid-player-credential-value-0000',
        serverId: server.id,
      }),
    ).rejects.toMatchObject({ statusCode: 401 });
  });

  it('returns the linked user represented by the authenticated identity', async () => {
    const server = await createServer('mc-service-user');
    const user = await createLinkedUser({
      email: 'mc-service-user@test.com',
      username: 'mcserviceuser',
      minecraftUuid: 'mc-service-user-uuid',
      minecraftName: 'Lookup',
    });

    const result = await mcService.getLinkedUser(identity(user, server.id));

    expect(result.username).toBe('mcserviceuser');
    expect(result.minecraftUuid).toBe('mc-service-user-uuid');
  });

  it('creates a ticket for the authenticated minecraft identity', async () => {
    const server = await createServer('mc-service-ticket');
    const user = await createLinkedUser({
      email: 'mc-service-ticket@test.com',
      username: 'mcserviceticket',
      minecraftUuid: 'mc-service-ticket-uuid',
      minecraftName: 'TicketUser',
    });

    const ticket = await mcService.createTicketFromMinecraft({
      title: 'From service',
      body: 'Body',
      template: 'bug_report',
      formData: {},
      identity: identity(user, server.id),
    });

    expect(ticket.title).toBe('From service');
    expect(ticket.authorId).toBe(user.id);
    expect(ticket.serverId).toBe(server.id);
  });

  it('creates a minecraft comment for the authenticated identity', async () => {
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
      ticketId: ticket.id,
      body: 'From MC',
      identity: identity(user, server.id),
    });

    expect(comment.body).toBe('From MC');
    expect(comment.source).toBe('minecraft');
  });

  it('inherits staff permissions for close, reopen, and arbitrary status updates', async () => {
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
    const viewer = identity(user, server.id);

    const closed = await mcService.closeTicketFromMinecraft(ticket.id, viewer);
    expect(closed.status).toBe('closed');

    const reopened = await mcService.reopenTicketFromMinecraft(ticket.id, viewer);
    expect(reopened.status).toBe('open');

    const invalid = await mcService.updateTicketStatusFromMinecraft(ticket.id, {
      status: 'invalid',
      identity: viewer,
    });
    expect(invalid.status).toBe('invalid');
  });
});
