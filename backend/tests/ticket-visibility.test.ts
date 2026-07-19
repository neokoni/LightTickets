import fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { dataPath } from '../src/paths.js';
import { prisma } from './setup.js';
import * as templateService from '../src/services/template.service.js';
import * as ticketService from '../src/services/ticket.service.js';

const app = createApp();
const optionalTemplateName = 'visibility_optional';
const optionalTemplatePath = path.join(dataPath('templates'), `${optionalTemplateName}.yml`);

afterEach(async () => {
  if (fs.existsSync(optionalTemplatePath)) fs.unlinkSync(optionalTemplatePath);
  await templateService.initTemplates();
});

async function createUser(
  username: string,
  options: { role?: 'player' | 'staff' | 'admin'; minecraftUuid?: string } = {},
) {
  const email = `${username}@visibility.test`;
  await request(app).post('/api/auth/register').send({ email, password: 'Password123!', username });
  let user = await prisma().user.findUniqueOrThrow({ where: { email } });
  if (options.role || options.minecraftUuid) {
    user = await prisma().user.update({
      where: { id: user.id },
      data: { role: options.role, minecraftUuid: options.minecraftUuid },
    });
  }
  const login = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: email, password: 'Password123!' });
  return { user, token: login.body.data.accessToken as string };
}

async function createOptionalTemplate(adminToken: string) {
  const response = await request(app)
    .post('/api/admin/templates')
    .set('Authorization', `Bearer ${adminToken}`)
    .send({
      name: optionalTemplateName,
      nameI18n: 'Visibility optional',
      description: 'Visibility test template',
      body: '- type: input\n  id: details\n  attributes:\n    label: Details',
      hidden: 'optional',
    });
  expect(response.status).toBe(201);
  expect(response.body.data.hidden).toBe('optional');
}

describe('ticket visibility policy helpers', () => {
  it('normalizes the optinal compatibility spelling and resolves all policies', () => {
    expect(templateService.normalizeTemplateHiddenMode('optinal')).toBe('optional');
    expect(ticketService.resolveTicketHidden(true, false)).toBe(true);
    expect(ticketService.resolveTicketHidden(false, true)).toBe(false);
    expect(ticketService.resolveTicketHidden('optional', true)).toBe(true);
    expect(() => ticketService.resolveTicketHidden('optional', undefined)).toThrow(
      '此模板必须选择议题可见性',
    );
  });
});

describe('ticket visibility on web routes', () => {
  it('enforces optional creation, returns 404 for related resources, and audits staff changes', async () => {
    const author = await createUser('visibility-author');
    const other = await createUser('visibility-other');
    const admin = await createUser('visibility-admin', { role: 'admin' });
    await createOptionalTemplate(admin.token);

    const missingVisibility = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${author.token}`)
      .send({
        title: 'Missing visibility',
        template: optionalTemplateName,
        formData: { details: 'private' },
      });
    expect(missingVisibility.status).toBe(400);

    const created = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${author.token}`)
      .send({
        title: 'Hidden issue',
        template: optionalTemplateName,
        formData: { details: 'private' },
        hidden: true,
      });
    expect(created.status).toBe(201);
    expect(created.body.data.hidden).toBe(true);
    const ticketId = created.body.data.id as number;

    const comment = await request(app)
      .post(`/api/tickets/${ticketId}/comments`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ body: 'Private comment' });
    expect(comment.status).toBe(201);
    await request(app)
      .patch(`/api/tickets/${ticketId}/title`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ title: 'Hidden issue renamed' });
    const attachment = await prisma().attachment.create({
      data: {
        ticketId,
        filename: 'private.txt',
        path: 'not-served-private.txt',
        mimeType: 'text/plain',
        size: 1,
        storageType: 'local',
        uploadedBy: author.user.id,
      },
    });

    const publicList = await request(app).get('/api/tickets');
    const otherList = await request(app)
      .get('/api/tickets')
      .set('Authorization', `Bearer ${other.token}`);
    const authorList = await request(app)
      .get('/api/tickets')
      .set('Authorization', `Bearer ${author.token}`);
    const adminList = await request(app)
      .get('/api/tickets')
      .set('Authorization', `Bearer ${admin.token}`);
    expect(publicList.body.data.tickets).toHaveLength(0);
    expect(otherList.body.data.tickets).toHaveLength(0);
    expect(authorList.body.data.tickets.map((ticket: { id: number }) => ticket.id)).toContain(
      ticketId,
    );
    expect(adminList.body.data.tickets.map((ticket: { id: number }) => ticket.id)).toContain(
      ticketId,
    );

    const hiddenPaths = [
      `/api/tickets/${ticketId}`,
      `/api/tickets/${ticketId}/comments`,
      `/api/tickets/${ticketId}/audit`,
      `/api/tickets/${ticketId}/attachments`,
      `/api/attachments/${attachment.id}`,
    ];
    for (const url of hiddenPaths) {
      const response = await request(app).get(url).set('Authorization', `Bearer ${other.token}`);
      expect(response.status, url).toBe(404);
    }
    expect((await request(app).get(`/api/tickets/${ticketId}`)).status).toBe(404);
    expect(
      (
        await request(app)
          .get(`/api/tickets/${ticketId}`)
          .set('Authorization', `Bearer ${author.token}`)
      ).status,
    ).toBe(200);
    expect(
      (
        await request(app)
          .get(`/api/tickets/${ticketId}`)
          .set('Authorization', `Bearer ${admin.token}`)
      ).status,
    ).toBe(200);

    const authorChange = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${author.token}`)
      .send({ hidden: false });
    expect(authorChange.status).toBe(403);

    const adminChange = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${admin.token}`)
      .send({ hidden: false });
    expect(adminChange.status).toBe(200);
    expect(adminChange.body.data.hidden).toBe(false);

    const audit = await request(app).get(`/api/tickets/${ticketId}/audit`);
    expect(audit.status).toBe(200);
    expect(audit.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          action: 'visibility_change',
          oldValue: 'true',
          newValue: 'false',
        }),
      ]),
    );
    expect((await request(app).get(`/api/tickets/${ticketId}`)).status).toBe(200);
  });

  it('defaults tickets created against the upgraded schema to public', async () => {
    const author = await createUser('visibility-default');
    const ticket = await prisma().ticket.create({
      data: { title: 'Legacy ticket', body: 'Body', template: '', authorId: author.user.id },
    });
    expect(ticket.hidden).toBe(false);
    expect((await request(app).get(`/api/tickets/${ticket.id}`)).status).toBe(200);
  });
});

describe('ticket visibility on Minecraft routes', () => {
  it('uses optional Minecraft identity to expose own or staff-visible hidden tickets', async () => {
    const authorUuid = '00000000-0000-0000-0000-000000000101';
    const otherUuid = '00000000-0000-0000-0000-000000000102';
    const staffUuid = '00000000-0000-0000-0000-000000000103';
    const author = await createUser('visibility-mc-author', { minecraftUuid: authorUuid });
    await createUser('visibility-mc-other', { minecraftUuid: otherUuid });
    await createUser('visibility-mc-staff', { role: 'staff', minecraftUuid: staffUuid });
    const server = await prisma().server.create({
      data: { name: 'visibility-mc', apiKey: 'visibility-mc-key' },
    });
    const ticket = await prisma().ticket.create({
      data: {
        title: 'MC hidden issue',
        body: 'Private body',
        template: 'bug_report',
        authorId: author.user.id,
        hidden: true,
      },
    });
    await prisma().comment.create({
      data: { ticketId: ticket.id, authorId: author.user.id, body: 'Private MC comment' },
    });

    async function mcGet(url: string) {
      return request(app).get(url).set('X-Server-Key', server.apiKey);
    }

    const publicList = await mcGet('/api/mc/tickets');
    const authorList = await mcGet(`/api/mc/tickets?minecraftUuid=${authorUuid}`);
    const otherList = await mcGet(`/api/mc/tickets?minecraftUuid=${otherUuid}`);
    const staffList = await mcGet(`/api/mc/tickets?minecraftUuid=${staffUuid}`);
    expect(publicList.body.data.tickets).toHaveLength(0);
    expect(otherList.body.data.tickets).toHaveLength(0);
    expect(authorList.body.data.tickets).toHaveLength(1);
    expect(staffList.body.data.tickets).toHaveLength(1);

    expect((await mcGet(`/api/mc/tickets/${ticket.id}/detail`)).status).toBe(404);
    expect(
      (await mcGet(`/api/mc/tickets/${ticket.id}/detail?minecraftUuid=${otherUuid}`)).status,
    ).toBe(404);
    expect(
      (await mcGet(`/api/mc/tickets/${ticket.id}/comments?minecraftUuid=${otherUuid}`)).status,
    ).toBe(404);
    expect(
      (await mcGet(`/api/mc/tickets/${ticket.id}/detail?minecraftUuid=${authorUuid}`)).status,
    ).toBe(200);
    expect(
      (await mcGet(`/api/mc/tickets/${ticket.id}/comments?minecraftUuid=${staffUuid}`)).status,
    ).toBe(200);
  });
});
