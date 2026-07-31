import { afterAll, beforeAll, describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';
import * as ticketService from '../src/services/ticket.service.js';
import * as templateService from '../src/services/template.service.js';

const app = createApp();
const selectionTemplateName = 'selection_hook_test';
const disabledTemplateName = 'disabled_ticket_test';

beforeAll(async () => {
  for (const name of [selectionTemplateName, disabledTemplateName]) {
    if (templateService.getAdminDefinition(name)) {
      await templateService.adminDelete(name);
    }
  }
  await templateService.adminCreate({
    name: selectionTemplateName,
    nameI18n: 'Selection hook test',
    description: 'Interactive completion hook test template',
    body: JSON.stringify([
      {
        type: 'input',
        id: 'description',
        attributes: { label: 'Description' },
      },
    ]),
    completionHooks: JSON.stringify([
      {
        event: 'closed',
        type: 'selection',
        title: 'Choose resolution',
        visibility: 'public',
        fields: [
          {
            type: 'checkboxes',
            id: 'rewards',
            validations: { required: true },
            attributes: { label: 'Rewards', options: ['Coins', 'Items'] },
          },
          {
            type: 'input',
            id: 'note',
            attributes: { label: 'Note', placeholder: 'Optional note' },
          },
        ],
        actions: [
          {
            type: 'command',
            commands: ['say {selection.rewards}', 'tell {player_name} {selection.note}'],
          },
          {
            type: 'minimessage',
            message: '<green>Resolved #{ticket_id}</green>',
          },
        ],
      },
      {
        event: 'closed',
        type: 'selection',
        title: 'Hidden resolution',
        visibility: 'staff',
        fields: [
          {
            type: 'dropdown',
            id: 'internal_result',
            validations: { required: true },
            attributes: { label: 'Internal result', options: ['Accepted', 'Rejected'] },
          },
        ],
        actions: [
          {
            type: 'command',
            commands: ['say {selection.internal_result}'],
          },
        ],
      },
    ]),
    hidden: false,
  });
  await templateService.adminCreate({
    name: disabledTemplateName,
    nameI18n: 'Disabled ticket test',
    description: 'Disabled template must reject ticket creation',
    body: JSON.stringify([
      {
        type: 'input',
        id: 'reason',
        validations: { required: true },
        attributes: { label: 'Reason' },
      },
    ]),
    enabled: false,
    hidden: false,
  });
});

afterAll(async () => {
  for (const name of [selectionTemplateName, disabledTemplateName]) {
    if (templateService.getAdminDefinition(name)) {
      await templateService.adminDelete(name);
    }
  }
});

async function createUserAndGetToken(email = 'user@test.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  return res.body.data.accessToken;
}

async function createAdminAndGetToken(email = 'admin@test.com') {
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  const user = await prisma().user.findUnique({ where: { email } });
  if (user) await prisma().user.update({ where: { id: user.id }, data: { role: 'admin' } });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: email, password: 'Password123!' });
  return loginRes.body.data.accessToken;
}

async function createStaffAndGetToken(email = 'staff@test.com') {
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  const user = await prisma().user.findUnique({ where: { email } });
  if (user) await prisma().user.update({ where: { id: user.id }, data: { role: 'staff' } });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: email, password: 'Password123!' });
  return loginRes.body.data.accessToken;
}

async function createTicket(token: string, overrides: Record<string, unknown> = {}) {
  return request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Test Bug',
      template: 'bug_report',
      formData: { description: 'Something broke', reproduce: 'Step 1' },
      ...overrides,
    });
}

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

describe('POST /api/tickets', () => {
  it('creates a ticket', async () => {
    const token = await createUserAndGetToken();
    const res = await createTicket(token);

    expect(res.status).toBe(201);
    expect(res.body.data.title).toBe('[Bug] Test Bug');
    expect(res.body.data.status).toBe('open');
    expect(res.body.data.template).toBe('bug_report');
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({
        title: 'Test',
        template: 'bug_report',
        formData: { description: 'x', reproduce: 'y' },
      });

    expect(res.status).toBe(401);
  });

  it('rejects missing template', async () => {
    const token = await createUserAndGetToken('no-tmpl@test.com');
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test', formData: { description: 'x' } });

    expect(res.status).toBe(400);
  });

  it('rejects invalid template name', async () => {
    const token = await createUserAndGetToken('bad-tmpl@test.com');
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test', template: 'nonexistent', formData: {} });

    expect(res.status).toBe(400);
  });

  it('rejects unknown template fields and missing required fields', async () => {
    const token = await createUserAndGetToken('strict-form@test.com');
    const unknown = await createTicket(token, {
      formData: { description: 'x', reproduce: 'y', marker: 'injected' },
    });
    const missing = await createTicket(token, {
      formData: { description: 'x' },
    });

    expect(unknown.status).toBe(400);
    expect(missing.status).toBe(400);
  });

  it('rejects a disabled template through the default service lookup', async () => {
    const token = await createUserAndGetToken('disabled-tmpl@test.com');

    expect(templateService.getAdminDefinition(disabledTemplateName)).toBeDefined();
    expect(templateService.getDefinition(disabledTemplateName)).toBeUndefined();

    const res = await createTicket(token, {
      template: disabledTemplateName,
      formData: { reason: 'Should not be accepted' },
    });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('无效的模板');
    expect(await prisma().ticket.count()).toBe(0);
  });

  it('rejects a normal Web user assigning a Minecraft server', async () => {
    const token = await createUserAndGetToken('server-spoof@test.com');
    const server = await prisma().server.create({
      data: { name: 'Spoof target', apiKey: 'spoof-target-key' },
    });

    const res = await createTicket(token, { serverId: server.id });

    expect(res.status).toBe(403);
    expect(await prisma().ticket.count()).toBe(0);
  });

  it('checks Web server assignment permission before server existence', async () => {
    const token = await createUserAndGetToken('missing-server-spoof@test.com');

    const missing = await createTicket(token, { serverId: 'missing-server' });
    const empty = await createTicket(token, { serverId: '' });

    expect(missing.status).toBe(403);
    expect(empty.status).toBe(403);
    expect(await prisma().ticket.count()).toBe(0);
  });

  it('allows staff to assign a server to a Web-created ticket', async () => {
    const staffToken = await createStaffAndGetToken('server-staff@test.com');
    const server = await prisma().server.create({
      data: { name: 'Staff target', apiKey: 'staff-target-key' },
    });

    const res = await createTicket(staffToken, { serverId: server.id });

    expect(res.status).toBe(201);
    expect(res.body.data.serverId).toBe(server.id);
  });

  it('rejects a missing server assigned by staff', async () => {
    const staffToken = await createStaffAndGetToken('missing-server-staff@test.com');

    const res = await createTicket(staffToken, { serverId: 'missing-server' });

    expect(res.status).toBe(400);
    expect(await prisma().ticket.count()).toBe(0);
  });

  it('claims pre-uploaded markdown attachments during create without body audit', async () => {
    const token = await createUserAndGetToken('create-attachment@test.com');
    const upload = await request(app)
      .post('/api/attachments/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, 'pasted.png');
    const attachmentUrl = `/api/attachments/${upload.body.data.id}`;

    const res = await createTicket(token, {
      formData: {
        description: `Screenshot\n\n![](${attachmentUrl})`,
        reproduce: 'Step 1',
      },
      attachmentIds: [upload.body.data.id],
    });

    expect(res.status).toBe(201);
    expect(res.body.data.body).toContain(`![](${attachmentUrl})`);

    const attachment = await prisma().attachment.findUnique({
      where: { id: upload.body.data.id },
    });
    expect(attachment?.ticketId).toBe(res.body.data.id);
    expect(attachment?.status).toBe('attached');
    expect(attachment?.expiresAt).toBeNull();

    const auditCount = await prisma().auditLog.count({
      where: { ticketId: res.body.data.id, action: 'body_change' },
    });
    expect(auditCount).toBe(0);
  });

  it('atomically rejects an expired pre-uploaded attachment', async () => {
    const token = await createUserAndGetToken('create-expired-attachment@test.com');
    const upload = await request(app)
      .post('/api/attachments/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, 'expired.png');
    await prisma().attachment.update({
      where: { id: upload.body.data.id },
      data: { expiresAt: new Date(Date.now() - 1) },
    });

    const res = await createTicket(token, { attachmentIds: [upload.body.data.id] });

    expect(res.status).toBe(400);
    expect(await prisma().ticket.count()).toBe(0);
    const attachment = await prisma().attachment.findUnique({
      where: { id: upload.body.data.id },
    });
    expect(attachment?.status).toBe('pending');
    expect(attachment?.ticketId).toBeNull();
  });
});

describe('ticketService.create', () => {
  it('renders template title and body inside the service', async () => {
    await templateService.initTemplates();
    const user = await prisma().user.create({
      data: { email: 'service-create@test.com', passwordHash: 'x', username: 'service-create' },
    });

    const ticket = await ticketService.create({
      title: 'Service Bug',
      template: 'bug_report',
      formData: { description: 'Something broke', reproduce: 'Step 1' },
      authorId: user.id,
    });

    expect(ticket.title).toBe('[Bug] Service Bug');
    expect(ticket.body).toContain('Something broke');
    expect(ticket.body).toContain('Step 1');
  });
});

describe('GET /api/tickets', () => {
  it('returns paginated tickets with filters', async () => {
    const token = await createUserAndGetToken('filter@test.com');
    await createTicket(token, {
      title: 'Bug 1',
      template: 'bug_report',
      formData: { description: 'd', reproduce: 'r' },
    });
    await createTicket(token, {
      title: 'Suggestion 1',
      template: 'suggestion',
      formData: { description: 'd' },
    });

    const res = await request(app)
      .get('/api/tickets?type=bug_report')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.tickets).toHaveLength(1);
    expect(res.body.data).toHaveProperty('total');
    expect(res.body.data).toHaveProperty('page');
  });

  it('returns tickets without auth (public)', async () => {
    const token = await createUserAndGetToken('public@test.com');
    await createTicket(token);

    const res = await request(app).get('/api/tickets');
    expect(res.status).toBe(200);
    expect(res.body.data.tickets.length).toBeGreaterThanOrEqual(1);
  });

  it('filters Minecraft tickets by exact server name', async () => {
    const token = await createUserAndGetToken('server-name-filter@test.com');
    const author = await prisma().user.findUniqueOrThrow({
      where: { email: 'server-name-filter@test.com' },
    });
    const [testServer, otherServer] = await Promise.all([
      prisma().server.create({ data: { name: 'Test', apiKey: 'server-name-test-key' } }),
      prisma().server.create({ data: { name: 'Other', apiKey: 'server-name-other-key' } }),
    ]);
    const [matchingTicket] = await Promise.all([
      prisma().ticket.create({
        data: {
          title: 'Test server ticket',
          body: 'Body',
          template: 'bug_report',
          authorId: author.id,
          serverId: testServer.id,
        },
      }),
      prisma().ticket.create({
        data: {
          title: 'Other server ticket',
          body: 'Body',
          template: 'bug_report',
          authorId: author.id,
          serverId: otherServer.id,
        },
      }),
    ]);

    const res = await request(app)
      .get('/api/tickets?serverName=Test')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.tickets.map((ticket: { id: number }) => ticket.id)).toEqual([
      matchingTicket.id,
    ]);
  });
});

describe('GET /api/tickets/:id', () => {
  it('returns a single ticket', async () => {
    const token = await createUserAndGetToken('detail@test.com');
    const created = await createTicket(token);

    const res = await request(app).get(`/api/tickets/${created.body.data.id}`);
    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe(created.body.data.id);
    expect(res.body.data).toHaveProperty('author');
    expect(res.body.data).toHaveProperty('labels');
  });

  it('returns 404 for nonexistent ticket', async () => {
    const res = await request(app).get('/api/tickets/99999');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/tickets/:id', () => {
  it('allows author to close own ticket', async () => {
    const token = await createUserAndGetToken('patcher@test.com');
    const created = await createTicket(token, {
      title: 'To Close',
      template: 'suggestion',
      formData: { description: 'd' },
    });

    const res = await request(app)
      .patch(`/api/tickets/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('closed');
  });

  it('rejects author changing status to in_progress', async () => {
    const token = await createUserAndGetToken('patcher-progress@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(403);
  });

  it('rejects author changing status to invalid state', async () => {
    const token = await createUserAndGetToken('patcher-invalid@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'invalid' });

    expect(res.status).toBe(403);
  });

  it('allows staff to change status to invalid state', async () => {
    const token = await createUserAndGetToken('status-author@test.com');
    const staffToken = await createStaffAndGetToken('status-staff@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.data.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'invalid' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('invalid');
  });

  it('rejects author reopening an invalid ticket through status update', async () => {
    const token = await createUserAndGetToken('patcher-invalid-open@test.com');
    const staffToken = await createStaffAndGetToken('patcher-invalid-open-staff@test.com');
    const created = await createTicket(token);

    await request(app)
      .patch(`/api/tickets/${created.body.data.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'invalid' });

    const res = await request(app)
      .patch(`/api/tickets/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'open' });

    expect(res.status).toBe(403);
  });

  it('rejects author closing an invalid ticket through status update', async () => {
    const token = await createUserAndGetToken('patcher-invalid-closed@test.com');
    const staffToken = await createStaffAndGetToken('patcher-invalid-closed-staff@test.com');
    const created = await createTicket(token);

    await request(app)
      .patch(`/api/tickets/${created.body.data.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'invalid' });

    const res = await request(app)
      .patch(`/api/tickets/${created.body.data.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(403);
  });

  it('allows staff to reopen an invalid ticket through status update', async () => {
    const token = await createUserAndGetToken('staff-invalid-open-author@test.com');
    const staffToken = await createStaffAndGetToken('staff-invalid-open@test.com');
    const created = await createTicket(token);

    await request(app)
      .patch(`/api/tickets/${created.body.data.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'invalid' });

    const res = await request(app)
      .patch(`/api/tickets/${created.body.data.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'open' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('open');
  });

  it('rejects non-author non-staff update', async () => {
    const authorToken = await createUserAndGetToken('author3@test.com');
    const otherToken = await createUserAndGetToken('other3@test.com');
    const created = await createTicket(authorToken);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ status: 'invalid' });

    expect(res.status).toBe(403);
  });
});

describe('PATCH /api/tickets/:id/title', () => {
  it('allows author to update title', async () => {
    const token = await createUserAndGetToken('title-edit@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.data.id}/title`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.data.title).toBe('Updated Title');
  });

  it('rejects empty title', async () => {
    const token = await createUserAndGetToken('title-empty@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.data.id}/title`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: '' });

    expect(res.status).toBe(400);
  });
});

describe('PATCH /api/tickets/:id/body', () => {
  it('allows author to update body', async () => {
    const token = await createUserAndGetToken('body-edit@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.data.id}/body`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Updated body content' });

    expect(res.status).toBe(200);
    expect(res.body.data.body).toBe('Updated body content');
  });

  it('rejects empty body', async () => {
    const token = await createUserAndGetToken('body-empty@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.data.id}/body`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: '' });

    expect(res.status).toBe(400);
  });
});

describe('POST /api/tickets/:id/close', () => {
  it('allows author to close ticket', async () => {
    const token = await createUserAndGetToken('closer@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .post(`/api/tickets/${created.body.data.id}/close`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('closed');
  });

  it('rejects closing already closed ticket', async () => {
    const token = await createUserAndGetToken('close-dup@test.com');
    const created = await createTicket(token);
    await request(app)
      .post(`/api/tickets/${created.body.data.id}/close`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/tickets/${created.body.data.id}/close`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });

  it('requires staff confirmation for command hooks and emits one stable delivery under concurrency', async () => {
    const authorToken = await createUserAndGetToken('command-hook-author@test.com');
    const staffToken = await createStaffAndGetToken('command-hook-staff@test.com');
    const server = await prisma().server.create({
      data: { name: 'Command Hook Server', apiKey: 'command-hook-server-key' },
    });
    const created = await createTicket(authorToken, {
      template: 'permission_request',
      formData: { reason: 'Need access', permission: 'Bot权限' },
    });
    const ticketId = created.body.data.id as number;
    await prisma().ticket.update({ where: { id: ticketId }, data: { serverId: server.id } });

    const playerClose = await request(app)
      .post(`/api/tickets/${ticketId}/close`)
      .set('Authorization', `Bearer ${authorToken}`);
    expect(playerClose.status).toBe(403);

    const playerPatch = await request(app)
      .patch(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ status: 'closed' });
    expect(playerPatch.status).toBe(403);

    const results = await Promise.all([
      request(app)
        .post(`/api/tickets/${ticketId}/close`)
        .set('Authorization', `Bearer ${staffToken}`),
      request(app)
        .post(`/api/tickets/${ticketId}/close`)
        .set('Authorization', `Bearer ${staffToken}`),
    ]);
    expect(results.filter((result) => result.status === 200)).toHaveLength(1);
    expect(results.filter((result) => result.status !== 200)).toHaveLength(1);
    const loser = results.find((result) => result.status !== 200)!;
    expect([403, 409]).toContain(loser.status);

    const deliveries = await prisma().minecraftHookDelivery.findMany({ where: { ticketId } });
    const audits = await prisma().auditLog.findMany({
      where: { ticketId, action: 'status_change' },
    });
    expect(deliveries).toHaveLength(1);
    expect(audits).toHaveLength(1);
    const hooks = JSON.parse(deliveries[0].hooks) as Array<{
      hookId: string;
      type: string;
      content: string;
    }>;
    expect(hooks).toHaveLength(2);
    expect(hooks.every((hook) => hook.hookId.startsWith(`${deliveries[0].id}:`))).toBe(true);
    expect(hooks.some((hook) => hook.type === 'command')).toBe(true);
  });
});

describe('POST /api/tickets/:id/reopen', () => {
  it('allows author to reopen closed ticket', async () => {
    const token = await createUserAndGetToken('reopener@test.com');
    const created = await createTicket(token);
    await request(app)
      .post(`/api/tickets/${created.body.data.id}/close`)
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/tickets/${created.body.data.id}/reopen`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('open');
  });
});

describe('POST /api/tickets/:id/completion-hooks/:hookId/complete', () => {
  it('publishes only completed public decisions and records validated completions', async () => {
    const authorToken = await createUserAndGetToken('hook-author@test.com');
    const staffToken = await createStaffAndGetToken('hook-staff@test.com');
    const server = await prisma().server.create({
      data: { name: 'Hook Test Server', apiKey: 'hook-test-api-key' },
    });
    const created = await createTicket(authorToken, {
      template: selectionTemplateName,
      formData: { description: 'Needs a resolution' },
    });
    const ticketId = created.body.data.id as number;
    await prisma().ticket.update({ where: { id: ticketId }, data: { serverId: server.id } });

    await request(app)
      .post(`/api/tickets/${ticketId}/close`)
      .set('Authorization', `Bearer ${authorToken}`);

    const authorView = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${authorToken}`);
    expect(authorView.body.data.completionHooks).toBeUndefined();

    const staffView = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffView.body.data.completionHooks).toHaveLength(2);
    const publicHook = staffView.body.data.completionHooks.find(
      (hook: { title: string }) => hook.title === 'Choose resolution',
    );
    const hiddenHook = staffView.body.data.completionHooks.find(
      (hook: { title: string }) => hook.title === 'Hidden resolution',
    );
    expect(publicHook).toMatchObject({
      title: 'Choose resolution',
      status: 'pending',
      visibility: 'public',
      response: null,
    });
    expect(hiddenHook).toMatchObject({ status: 'pending', visibility: 'staff' });
    const hookId = publicHook.id as string;

    const pendingAudit = await prisma().auditLog.findFirst({
      where: { ticketId, action: 'completion_hook_pending' },
    });
    expect(pendingAudit?.newValue).toBe('2');

    const playerSubmit = await request(app)
      .post(`/api/tickets/${ticketId}/completion-hooks/${hookId}/complete`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ values: { rewards: ['Coins'], note: 'Done' } });
    expect(playerSubmit.status).toBe(403);

    const invalidSubmit = await request(app)
      .post(`/api/tickets/${ticketId}/completion-hooks/${hookId}/complete`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ values: { rewards: [], note: 'Done' } });
    expect(invalidSubmit.status).toBe(400);

    const completed = await request(app)
      .post(`/api/tickets/${ticketId}/completion-hooks/${hookId}/complete`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ values: { rewards: ['Coins', 'Items'], note: 'Granted' } });
    expect(completed.status).toBe(200);
    expect(completed.body.data).toMatchObject({
      id: hookId,
      status: 'completed',
      response: { rewards: ['Coins', 'Items'], note: 'Granted' },
    });
    expect(completed.body.data.completedBy.username).toBe('hook-staff');
    expect(completed.body.data.completedAt).toEqual(expect.any(String));

    const publishedView = await request(app).get(`/api/tickets/${ticketId}`);
    expect(publishedView.body.data.completionHooks).toHaveLength(1);
    expect(publishedView.body.data.completionHooks[0]).toMatchObject({
      id: hookId,
      status: 'completed',
      visibility: 'public',
    });

    const hiddenCompleted = await request(app)
      .post(`/api/tickets/${ticketId}/completion-hooks/${hiddenHook.id}/complete`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ values: { internal_result: 'Accepted' } });
    expect(hiddenCompleted.status).toBe(200);

    const publicAfterHiddenCompletion = await request(app).get(`/api/tickets/${ticketId}`);
    expect(publicAfterHiddenCompletion.body.data.completionHooks).toHaveLength(1);

    const duplicate = await request(app)
      .post(`/api/tickets/${ticketId}/completion-hooks/${hookId}/complete`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ values: { rewards: ['Coins'], note: 'Again' } });
    expect(duplicate.status).toBe(409);

    const audits = await prisma().auditLog.findMany({
      where: { ticketId, action: 'completion_hook' },
    });
    expect(audits).toHaveLength(2);
    expect(audits.map((audit) => audit.newValue)).toEqual(
      expect.arrayContaining(['Choose resolution', 'Hidden resolution']),
    );
  });

  it('keeps one decision set across reopen and close status cycles', async () => {
    const authorToken = await createUserAndGetToken('hook-cancel-author@test.com');
    const staffToken = await createStaffAndGetToken('hook-cancel-staff@test.com');
    const created = await createTicket(authorToken, {
      template: selectionTemplateName,
      formData: { description: 'Cancel this hook' },
    });
    const ticketId = created.body.data.id as number;

    await request(app)
      .post(`/api/tickets/${ticketId}/close`)
      .set('Authorization', `Bearer ${authorToken}`);

    const initialView = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    const initialIds = initialView.body.data.completionHooks.map((hook: { id: string }) => hook.id);
    const publicHook = initialView.body.data.completionHooks.find(
      (hook: { visibility: string }) => hook.visibility === 'public',
    );

    await request(app)
      .post(`/api/tickets/${ticketId}/reopen`)
      .set('Authorization', `Bearer ${authorToken}`);

    const completedWhileOpen = await request(app)
      .post(`/api/tickets/${ticketId}/completion-hooks/${publicHook.id}/complete`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ values: { rewards: ['Coins'], note: 'Completed while open' } });
    expect(completedWhileOpen.status).toBe(200);

    await request(app)
      .post(`/api/tickets/${ticketId}/close`)
      .set('Authorization', `Bearer ${authorToken}`);

    const staffView = await request(app)
      .get(`/api/tickets/${ticketId}`)
      .set('Authorization', `Bearer ${staffToken}`);
    expect(staffView.body.data.completionHooks).toHaveLength(2);
    expect(staffView.body.data.completionHooks.map((hook: { id: string }) => hook.id)).toEqual(
      initialIds,
    );
    expect(
      staffView.body.data.completionHooks.map((hook: { status: string }) => hook.status),
    ).toEqual(expect.arrayContaining(['completed', 'pending']));

    const pendingAudits = await prisma().auditLog.count({
      where: { ticketId, action: 'completion_hook_pending' },
    });
    expect(pendingAudits).toBe(1);
  });
});

describe('POST /api/tickets/:id/labels', () => {
  it('allows staff to add label to ticket', async () => {
    const token = await createUserAndGetToken('label-author@test.com');
    const adminToken = await createAdminAndGetToken('label-admin@test.com');
    const staffToken = await createStaffAndGetToken('label-staff@test.com');
    const created = await createTicket(token);

    const label = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: 'test-label', name: 'Test label', color: '#ef4444' });

    const res = await request(app)
      .post(`/api/tickets/${created.body.data.id}/labels`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ labelId: label.body.data.id });

    expect(res.status).toBe(201);
  });

  it('rejects non-staff adding label', async () => {
    const token = await createUserAndGetToken('label-player@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .post(`/api/tickets/${created.body.data.id}/labels`)
      .set('Authorization', `Bearer ${token}`)
      .send({ labelId: 'fake-id' });

    expect(res.status).toBe(403);
  });
});

describe('DELETE /api/tickets/:id/labels/:labelId', () => {
  it('allows staff to remove label from ticket', async () => {
    const token = await createUserAndGetToken('rmlabel-author@test.com');
    const adminToken = await createAdminAndGetToken('rmlabel-admin@test.com');
    const staffToken = await createStaffAndGetToken('rmlabel-staff@test.com');
    const created = await createTicket(token);

    const label = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ id: 'remove-me', name: 'Remove me', color: '#000000' });

    await request(app)
      .post(`/api/tickets/${created.body.data.id}/labels`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ labelId: label.body.data.id });

    const res = await request(app)
      .delete(`/api/tickets/${created.body.data.id}/labels/${label.body.data.id}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(204);
  });
});
