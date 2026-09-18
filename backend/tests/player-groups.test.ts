import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import request from 'supertest';
import { createApp } from '../src/app.js';
import * as templateService from '../src/services/template.service.js';
import { dataPath } from '../src/paths.js';
import { prisma, serverData } from './setup.js';

const app = createApp({ enableInitialSetup: true });
let adminToken = '';
let userToken = '';

afterEach(async () => {
  for (const file of fs.readdirSync(dataPath('templates'))) {
    if (file.startsWith('review_')) fs.rmSync(path.join(dataPath('templates'), file));
  }
  await templateService.initTemplates();
});

beforeEach(async () => {
  await request(app)
    .post('/api/setup')
    .send({
      db: { provider: 'sqlite' },
      admin: { email: 'groups-admin@test.com', password: 'Password123!', username: 'groupsadmin' },
    });
  const adminLogin = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: 'groups-admin@test.com', password: 'Password123!' });
  adminToken = adminLogin.body.data.accessToken;
  const user = await request(app)
    .post('/api/auth/register')
    .send({ email: 'groups-user@test.com', password: 'Password123!', username: 'groupsuser' });
  userToken = user.body.data.accessToken;
});

describe('player groups', () => {
  it('keeps rejected creates and updates out of disk and cache during other saves', async () => {
    const original = { nameI18n: 'Original', description: 'Original', body: '[]' };
    await templateService.adminCreate({ name: 'review_other', ...original });
    const body = [{ type: 'player_select', id: 'players', attributes: { groups: ['missing'] } }];
    for (const sourceMode of [false, true]) {
      const invalid = sourceMode
        ? { source: JSON.stringify({ name: 'Invalid', description: 'Invalid', body }) }
        : { body: JSON.stringify(body) };
      const name = `review_invalid_${sourceMode}`;
      const creation = templateService.adminCreate({ name, ...original, ...invalid });
      const creationResult = creation.then(
        () => null,
        (error: unknown) => error,
      );
      await templateService.adminUpdate('review_other', { description: String(sourceMode) });
      expect(await creationResult).toMatchObject({ statusCode: 400 });
      expect(templateService.getDefinition(name)).toBeUndefined();
      expect(fs.existsSync(dataPath('templates', `${name}.yml`))).toBe(false);

      await templateService.adminCreate({ name, ...original });
      const before = await templateService.adminGet(name);
      const update = templateService.adminUpdate(name, invalid);
      const updateResult = update.then(
        () => null,
        (error: unknown) => error,
      );
      await templateService.adminUpdate('review_other', { description: `updated ${sourceMode}` });
      expect(await updateResult).toMatchObject({ statusCode: 400 });
      expect((await templateService.adminGet(name)).source).toBe(before.source);
      expect(templateService.getDefinition(name)?.body).toEqual([]);
    }
  });

  it('rejects duplicate creates, stale updates and updates to deleted templates', async () => {
    const data = {
      name: 'review_concurrent',
      nameI18n: 'Concurrent',
      description: 'Original',
      body: '[]',
    };
    const creates = await Promise.allSettled([
      templateService.adminCreate(data),
      templateService.adminCreate({ ...data, description: 'Duplicate' }),
    ]);
    expect(creates.map((result) => result.status)).toEqual(['fulfilled', 'rejected']);
    expect(creates[1]).toMatchObject({ reason: { statusCode: 409 } });
    for (const sourceMode of [false, true]) {
      const change = sourceMode
        ? { source: JSON.stringify({ name: 'Changed', description: 'Changed', body: [] }) }
        : { description: 'Changed' };
      const updates = await Promise.allSettled([
        templateService.adminUpdate(data.name, { description: `Winner ${sourceMode}` }),
        templateService.adminUpdate(data.name, change),
      ]);
      expect(updates.every((result) => result.status === 'fulfilled')).toBe(true);
      await templateService.adminDelete(data.name);
      await expect(templateService.adminUpdate(data.name, change)).rejects.toMatchObject({
        statusCode: 404,
      });
      expect(templateService.getDefinition(data.name)).toBeUndefined();
      expect(fs.existsSync(dataPath('templates', `${data.name}.yml`))).toBe(false);
      await templateService.adminCreate(data);
    }
  });

  it('updates yaml templates in place and ignores fields on non-selection hooks', async () => {
    const name = 'review_yaml';
    const filePath = dataPath('templates', `${name}.yaml`);
    fs.writeFileSync(
      filePath,
      JSON.stringify({
        name,
        description: 'Original',
        body: [],
        completion_hooks: [
          { event: 'closed', type: 'command', commands: ['say done'], fields: 'legacy metadata' },
        ],
      }),
    );
    await templateService.initTemplates();
    await templateService.adminUpdate(name, { description: 'Updated' });
    expect((await templateService.adminGet(name)).description).toBe('Updated');
    expect(fs.existsSync(dataPath('templates', `${name}.yml`))).toBe(false);
    expect(templateService.usesPlayerGroup('unused')).toBe(false);
    await templateService.adminDelete(name);
    await templateService.initTemplates();
    expect(templateService.getDefinition(name)).toBeUndefined();
  });

  it('protects template references when deleting a whitespace-padded group ID', async () => {
    await request(app)
      .post('/api/admin/player-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: 'staff-a' })
      .expect(201);
    await templateService.adminCreate({
      name: 'review_reference',
      nameI18n: 'Reference',
      description: 'Reference',
      body: JSON.stringify([
        { type: 'player_select', id: 'players', attributes: { groups: ['staff-a'] } },
      ]),
    });
    await request(app)
      .delete('/api/admin/player-groups/%20staff-a%20')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
    expect(await prisma().playerGroup.findUnique({ where: { id: 'staff-a' } })).not.toBeNull();
  });

  it('manages groups and deduplicates search results across groups', async () => {
    for (const id of ['staff-a', 'staff-b']) {
      expect(
        (
          await request(app)
            .post('/api/admin/player-groups')
            .set('Authorization', `Bearer ${adminToken}`)
            .send({ id, name: id })
        ).status,
      ).toBe(201);
    }
    await request(app)
      .post('/api/admin/player-groups/staff-a/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ values: ['Alice', 'SharedPlayer'] })
      .expect(201);
    await request(app)
      .post('/api/admin/player-groups/staff-b/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ values: ['Bob', 'SharedPlayer', 'UniquePlayer'] })
      .expect(201);

    const search = await request(app)
      .get('/api/player-groups/search')
      .set('Authorization', `Bearer ${userToken}`)
      .query({ groupIds: 'staff-a,staff-b', q: 'Player' })
      .expect(200);
    expect(search.body.data).toEqual(['SharedPlayer', 'UniquePlayer']);

    const limitedSearch = await request(app)
      .get('/api/player-groups/search')
      .set('Authorization', `Bearer ${userToken}`)
      .query({ groupIds: 'staff-a,staff-b', q: 'Player', limit: 2 })
      .expect(200);
    expect(limitedSearch.body.data).toEqual(['SharedPlayer', 'UniquePlayer']);

    await request(app)
      .get('/api/admin/player-groups')
      .set('Authorization', `Bearer ${userToken}`)
      .expect(403);
    const groups = await request(app)
      .get('/api/admin/player-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(groups.body.data[0]).toMatchObject({ _count: { items: 2 } });
    expect(groups.body.data[0]).not.toHaveProperty('items');
    const group = await request(app)
      .get('/api/admin/player-groups/staff-a?page=1&pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(group.body.data).toMatchObject({
      group: { id: 'staff-a', _count: { items: 2 } },
      total: 2,
      page: 1,
      pageSize: 1,
    });
    expect(group.body.data.items).toHaveLength(1);
    const secondPage = await request(app)
      .get('/api/admin/player-groups/staff-a?page=2&pageSize=1')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(secondPage.body.data).toMatchObject({ total: 2, page: 2, pageSize: 1 });
    expect(secondPage.body.data.items).toHaveLength(1);
    expect(secondPage.body.data.items[0].id).not.toBe(group.body.data.items[0].id);
    const filteredGroup = await request(app)
      .get('/api/admin/player-groups/staff-a')
      .set('Authorization', `Bearer ${adminToken}`)
      .query({ q: 'Shared', page: 1, pageSize: 20 })
      .expect(200);
    expect(filteredGroup.body.data.items.map((item: { value: string }) => item.value)).toEqual([
      'SharedPlayer',
    ]);
    expect(filteredGroup.body.data.total).toBe(1);
    const alice = group.body.data.items.find((item: { value: string }) => item.value === 'Alice');
    await request(app)
      .patch('/api/admin/player-groups/staff-a')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ name: 'Staff A', note: 'Primary staff group' })
      .expect(200);
    await request(app)
      .patch(`/api/admin/player-groups/staff-a/items/${alice.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'SharedPlayer' })
      .expect(409);
    await request(app)
      .patch(`/api/admin/player-groups/staff-a/items/${alice.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ value: 'Alicia' })
      .expect(200);
    await request(app)
      .delete(`/api/admin/player-groups/staff-a/items/${alice.id}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
    const updatedGroup = await request(app)
      .get('/api/admin/player-groups/staff-a')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(200);
    expect(updatedGroup.body.data.group).toMatchObject({
      name: 'Staff A',
      note: 'Primary staff group',
    });
    expect(updatedGroup.body.data.items).not.toContainEqual(
      expect.objectContaining({ id: alice.id }),
    );
  });

  it('enforces player_select values unless input_any is enabled', async () => {
    await request(app)
      .post('/api/admin/player-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: 'staff-a', name: 'staff-a' })
      .expect(201);
    await request(app)
      .post('/api/admin/player-groups/staff-a/items')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ values: ['Alice'] })
      .expect(201);
    const strictName = 'player_select_strict';
    const anyName = 'player_select_any';
    for (const [name, inputAny] of [
      [strictName, false],
      [anyName, true],
    ] as const) {
      await templateService.adminCreate({
        name,
        nameI18n: name,
        description: name,
        body: JSON.stringify([
          {
            type: 'player_select',
            id: 'players',
            validations: { required: true },
            attributes: { label: 'Players', groups: ['staff-a'], input_any: inputAny },
          },
        ]),
      });
    }

    const strictValid = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'strict valid', template: strictName, formData: { players: 'Alice' } })
      .expect(201);
    expect(strictValid.body.data.body).toContain('**Players:** Alice');
    await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'strict invalid', template: strictName, formData: { players: 'Outside' } })
      .expect(400);
    await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'any value', template: anyName, formData: { players: 'Outside' } })
      .expect(201);
    await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'invalid player name',
        template: anyName,
        formData: { players: 'Not A Player' },
      })
      .expect(400);

    await templateService.adminDelete(strictName);
    await templateService.adminDelete(anyName);
  });

  it('accepts authenticated player uploads and rejects invalid requests', async () => {
    const serverKey = 'player-group-upload-key';
    await prisma().server.create({ data: serverData('player-group-upload', serverKey) });
    await request(app)
      .post('/api/admin/player-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: 'uploaded-players' })
      .expect(201);

    await request(app)
      .post('/api/mc/player-group/items')
      .set('X-Server-Key', serverKey)
      .send({ groupId: 'uploaded-players', value: 'Alice' })
      .expect(204);
    await expect(
      prisma().playerGroupItem.findUnique({
        where: { groupId_value: { groupId: 'uploaded-players', value: 'Alice' } },
      }),
    ).resolves.not.toBeNull();

    await request(app)
      .post('/api/mc/player-group/items')
      .send({ groupId: 'uploaded-players', value: 'Bob' })
      .expect(401);
    await request(app)
      .post('/api/mc/player-group/items')
      .set('X-Server-Key', serverKey)
      .send({ groupId: 'missing-players', value: 'Bob' })
      .expect(404);
  });

  it('keeps groups referenced by pending completion hooks', async () => {
    const groupId = 'hook-players';
    const templateName = 'player_group_pending_hook';
    await request(app)
      .post('/api/admin/player-groups')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: groupId })
      .expect(201);
    await request(app)
      .post(`/api/admin/player-groups/${groupId}/items`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ values: ['Alice'] })
      .expect(201);
    await templateService.adminCreate({
      name: templateName,
      nameI18n: templateName,
      description: templateName,
      body: JSON.stringify([{ type: 'markdown', attributes: { value: 'Pending hook test' } }]),
      completionHooks: JSON.stringify([
        {
          event: 'closed',
          type: 'selection',
          title: 'Select players',
          fields: [
            {
              type: 'player_select',
              id: 'players',
              attributes: { label: 'Players', groups: [groupId] },
            },
          ],
          actions: [{ type: 'command', commands: ['say {selection.players}'] }],
        },
      ]),
    });

    const ticket = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${userToken}`)
      .send({ title: 'pending group hook', template: templateName, formData: {} })
      .expect(201);
    await request(app)
      .post(`/api/tickets/${ticket.body.data.id}/close`)
      .set('Authorization', `Bearer ${userToken}`)
      .expect(200);
    await templateService.adminDelete(templateName);

    const deletion = await request(app)
      .delete(`/api/admin/player-groups/${groupId}`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
    expect(deletion.body.message).toContain('待处理完成钩子');
    await request(app)
      .delete(`/api/admin/player-groups/%20${groupId}%20`)
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(409);
    await expect(
      prisma().playerGroup.findUnique({ where: { id: groupId } }),
    ).resolves.not.toBeNull();
  });
});
