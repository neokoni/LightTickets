import { describe, it, expect, vi, beforeEach } from 'vitest';
import bcrypt from 'bcrypt';
import { CommentSource } from '@prisma/client';
import { prisma } from './setup.js';

vi.mock('../src/socket/events.js', () => ({
  emitTicketUpdate: vi.fn(),
  emitToAllServers: vi.fn(),
}));

const { emitTicketUpdate, emitToAllServers } = await import('../src/socket/events.js');
const commentService = await import('../src/services/comment.service.js');

async function createUser(input: {
  email: string;
  username: string;
  minecraftUuid?: string;
  role?: 'player' | 'staff' | 'admin';
}) {
  return prisma().user.create({
    data: {
      email: input.email,
      username: input.username,
      passwordHash: await bcrypt.hash('Password123!', 12),
      minecraftUuid: input.minecraftUuid,
      minecraftName: input.minecraftUuid ? input.username : null,
      role: input.role ?? 'player',
    },
  });
}

describe('comment Minecraft notifications', () => {
  beforeEach(() => {
    vi.mocked(emitTicketUpdate).mockClear();
    vi.mocked(emitToAllServers).mockClear();
  });

  it('notifies the ticket author when another user comments', async () => {
    const server = await prisma().server.create({
      data: { name: 'comment-notify-author', apiKey: 'comment-notify-author-key' },
    });
    const author = await createUser({
      email: 'comment-notify-author@test.com',
      username: 'commentnotifyauthor',
      minecraftUuid: '550e8400-e29b-41d4-a716-446655441001',
    });
    const staff = await createUser({
      email: 'comment-notify-staff@test.com',
      username: 'commentnotifystaff',
      minecraftUuid: '550e8400-e29b-41d4-a716-446655441002',
      role: 'staff',
    });
    const ticket = await prisma().ticket.create({
      data: {
        title: 'Author notify',
        body: 'Body',
        template: 'bug_report',
        authorId: author.id,
        serverId: server.id,
      },
    });

    await commentService.create(ticket.id, staff.id, 'Staff reply');

    expect(emitTicketUpdate).toHaveBeenCalledWith(
      server.id,
      'ticket:comment_created',
      expect.objectContaining({
        playerUuid: author.minecraftUuid,
        authorMinecraftUuid: staff.minecraftUuid,
        source: CommentSource.web,
      }),
    );
  });

  it('notifies assigned staff when the ticket author comments from Minecraft', async () => {
    const server = await prisma().server.create({
      data: { name: 'comment-notify-assignee', apiKey: 'comment-notify-assignee-key' },
    });
    const author = await createUser({
      email: 'comment-notify-mc-author@test.com',
      username: 'commentnotifymcauthor',
      minecraftUuid: '550e8400-e29b-41d4-a716-446655441003',
    });
    const assignee = await createUser({
      email: 'comment-notify-assignee@test.com',
      username: 'commentnotifyassignee',
      minecraftUuid: '550e8400-e29b-41d4-a716-446655441004',
      role: 'staff',
    });
    const ticket = await prisma().ticket.create({
      data: {
        title: 'Assignee notify',
        body: 'Body',
        template: 'bug_report',
        authorId: author.id,
        serverId: server.id,
      },
    });
    await prisma().ticketAssignee.create({
      data: { ticketId: ticket.id, userId: assignee.id },
    });

    await commentService.create(ticket.id, author.id, 'Minecraft reply', CommentSource.minecraft);

    expect(emitTicketUpdate).toHaveBeenCalledWith(
      server.id,
      'ticket:comment_created',
      expect.objectContaining({
        playerUuid: assignee.minecraftUuid,
        authorMinecraftUuid: author.minecraftUuid,
        source: CommentSource.minecraft,
      }),
    );
  });

  it('falls back to all linked staff when an author Minecraft comment has no assignee', async () => {
    const server = await prisma().server.create({
      data: { name: 'comment-notify-staff-fallback', apiKey: 'comment-notify-staff-fallback-key' },
    });
    const author = await createUser({
      email: 'comment-notify-fallback-author@test.com',
      username: 'commentnotifyfallbackauthor',
      minecraftUuid: '550e8400-e29b-41d4-a716-446655441005',
    });
    const staff = await createUser({
      email: 'comment-notify-fallback-staff@test.com',
      username: 'commentnotifyfallbackstaff',
      minecraftUuid: '550e8400-e29b-41d4-a716-446655441006',
      role: 'staff',
    });
    const ticket = await prisma().ticket.create({
      data: {
        title: 'Fallback staff notify',
        body: 'Body',
        template: 'bug_report',
        authorId: author.id,
        serverId: server.id,
      },
    });

    await commentService.create(ticket.id, author.id, 'Minecraft reply', CommentSource.minecraft);

    expect(emitTicketUpdate).toHaveBeenCalledWith(
      server.id,
      'ticket:comment_created',
      expect.objectContaining({
        playerUuid: staff.minecraftUuid,
        source: CommentSource.minecraft,
      }),
    );
  });
});
