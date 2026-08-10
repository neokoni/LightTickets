import { describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma, serverData } from './setup.js';
import * as minecraftHookDeliveryService from '../src/services/minecraft-hook-delivery.service.js';
import { generateAccessToken } from '../src/utils/token.js';

const app = createApp();

describe('minecraft hook delivery outbox', () => {
  it('creates stable hook IDs and accepts ACK only from the target server', async () => {
    const [server, otherServer] = await Promise.all([
      prisma().server.create({ data: serverData('hook-outbox', 'hook-outbox-key') }),
      prisma().server.create({ data: serverData('hook-outbox-other', 'hook-other-key') }),
    ]);
    const user = await prisma().user.create({
      data: { email: 'hook-outbox@test.com', username: 'hookoutbox', passwordHash: 'x' },
    });
    const ticket = await prisma().ticket.create({
      data: {
        title: 'Hook outbox',
        body: 'Body',
        template: 'suggestion',
        authorId: user.id,
        serverId: server.id,
      },
    });

    const deliveryId = await prisma().$transaction((tx) =>
      minecraftHookDeliveryService.createForResolvedHooks(
        tx,
        { ...ticket, author: { minecraftUuid: null, minecraftName: null } },
        'closed',
        [
          { type: 'command', content: 'say #{ticket_id}' },
          { type: 'minimessage', content: '<green>{ticket_title}</green>' },
        ],
        {
          ticket_id: String(ticket.id),
          ticket_title: '<click:run_command:/op>Click me</click>',
        },
      ),
    );

    expect(deliveryId).toEqual(expect.any(String));
    const delivery = await prisma().minecraftHookDelivery.findUniqueOrThrow({
      where: { id: deliveryId! },
    });
    expect(delivery.status).toBe('pending');
    const hooks = JSON.parse(delivery.hooks) as Array<{
      hookId: string;
      content: string;
      placeholders?: Record<string, string>;
    }>;
    expect(hooks.map((hook) => hook.hookId)).toEqual([`${delivery.id}:0`, `${delivery.id}:1`]);
    expect(hooks[0].content).toBe(`say #${ticket.id}`);
    expect(hooks[0].placeholders).toBeUndefined();
    expect(hooks[1]).toMatchObject({
      content: '<green>{ticket_title}</green>',
      placeholders: { ticket_title: '<click:run_command:/op>Click me</click>' },
    });

    await minecraftHookDeliveryService.dispatch(delivery.id);
    const offlineDelivery = await prisma().minecraftHookDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });
    expect(offlineDelivery.attempts).toBe(0);
    expect(offlineDelivery.lastAttemptAt).toBeNull();

    expect(await minecraftHookDeliveryService.acknowledge(otherServer.id, delivery.id)).toBe(false);
    expect(await minecraftHookDeliveryService.acknowledge(server.id, delivery.id)).toBe(true);
    expect(await minecraftHookDeliveryService.acknowledge(server.id, delivery.id)).toBe(false);
    const acknowledged = await prisma().minecraftHookDelivery.findUniqueOrThrow({
      where: { id: delivery.id },
    });
    expect(acknowledged.status).toBe('delivered');
    expect(acknowledged.acknowledgedAt).toBeInstanceOf(Date);
  });

  it('moves exhausted deliveries to a dead letter and supports manual retry', async () => {
    const server = await prisma().server.create({
      data: serverData('hook-dead-letter', 'hook-dead-letter-key'),
    });
    const user = await prisma().user.create({
      data: { email: 'hook-dead-letter@test.com', username: 'hookdeadletter', passwordHash: 'x' },
    });
    const ticket = await prisma().ticket.create({
      data: {
        title: 'Hook dead letter',
        body: 'Body',
        template: 'suggestion',
        authorId: user.id,
        serverId: server.id,
      },
    });
    const deliveryId = await prisma().minecraftHookDelivery.create({
      data: {
        ticketId: ticket.id,
        serverId: server.id,
        event: 'closed',
        hooks: '[]',
        status: 'failed',
        attempts: 5,
        failedAt: new Date(),
      },
    });

    expect((await minecraftHookDeliveryService.listDeadLetters()).map((item) => item.id)).toContain(
      deliveryId.id,
    );
    expect(await minecraftHookDeliveryService.retryDeadLetter(deliveryId.id)).toBe(true);
    const retried = await prisma().minecraftHookDelivery.findUniqueOrThrow({
      where: { id: deliveryId.id },
    });
    expect(retried.status).toBe('pending');
    expect(retried.attempts).toBe(0);
    expect(retried.failedAt).toBeNull();
  });

  it('restricts dead-letter management to admins', async () => {
    const user = await prisma().user.create({
      data: {
        email: 'hook-admin@test.com',
        username: 'hookadmin',
        passwordHash: 'x',
        role: 'admin',
      },
    });
    const token = generateAccessToken(user.id, 'admin');
    const res = await request(app)
      .get('/api/admin/minecraft-hook-deliveries')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
  });
});
