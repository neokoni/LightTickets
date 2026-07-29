import { describe, expect, it } from 'vitest';
import { prisma } from './setup.js';
import * as minecraftHookDeliveryService from '../src/services/minecraft-hook-delivery.service.js';

describe('minecraft hook delivery outbox', () => {
  it('creates stable hook IDs and accepts ACK only from the target server', async () => {
    const [server, otherServer] = await Promise.all([
      prisma().server.create({ data: { name: 'hook-outbox', apiKey: 'hook-outbox-key' } }),
      prisma().server.create({ data: { name: 'hook-outbox-other', apiKey: 'hook-other-key' } }),
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
          { type: 'minimessage', content: '<green>Done</green>' },
        ],
        { ticket_id: String(ticket.id) },
      ),
    );

    expect(deliveryId).toEqual(expect.any(String));
    const delivery = await prisma().minecraftHookDelivery.findUniqueOrThrow({
      where: { id: deliveryId! },
    });
    const hooks = JSON.parse(delivery.hooks) as Array<{ hookId: string; content: string }>;
    expect(hooks.map((hook) => hook.hookId)).toEqual([`${delivery.id}:0`, `${delivery.id}:1`]);
    expect(hooks[0].content).toBe(`say #${ticket.id}`);

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
    expect(acknowledged.acknowledgedAt).toBeInstanceOf(Date);
  });
});
