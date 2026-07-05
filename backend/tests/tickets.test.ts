import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

async function createUserAndGetToken(email = 'user@test.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  return res.body.accessToken;
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
  return loginRes.body.accessToken;
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
  return loginRes.body.accessToken;
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

describe('POST /api/tickets', () => {
  it('creates a ticket', async () => {
    const token = await createUserAndGetToken();
    const res = await createTicket(token);

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('[Bug] Test Bug');
    expect(res.body.status).toBe('open');
    expect(res.body.template).toBe('bug_report');
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({ title: 'Test', template: 'bug_report', formData: { description: 'x', reproduce: 'y' } });

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
});

describe('GET /api/tickets', () => {
  it('returns paginated tickets with filters', async () => {
    const token = await createUserAndGetToken('filter@test.com');
    await createTicket(token, { title: 'Bug 1', template: 'bug_report', formData: { description: 'd', reproduce: 'r' } });
    await createTicket(token, { title: 'Suggestion 1', template: 'suggestion', formData: { description: 'd' } });

    const res = await request(app)
      .get('/api/tickets?type=bug_report')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
  });

  it('returns tickets without auth (public)', async () => {
    const token = await createUserAndGetToken('public@test.com');
    await createTicket(token);

    const res = await request(app).get('/api/tickets');
    expect(res.status).toBe(200);
    expect(res.body.tickets.length).toBeGreaterThanOrEqual(1);
  });
});

describe('GET /api/tickets/:id', () => {
  it('returns a single ticket', async () => {
    const token = await createUserAndGetToken('detail@test.com');
    const created = await createTicket(token);

    const res = await request(app).get(`/api/tickets/${created.body.id}`);
    expect(res.status).toBe(200);
    expect(res.body.id).toBe(created.body.id);
    expect(res.body).toHaveProperty('author');
    expect(res.body).toHaveProperty('labels');
  });

  it('returns 404 for nonexistent ticket', async () => {
    const res = await request(app).get('/api/tickets/99999');
    expect(res.status).toBe(404);
  });
});

describe('PATCH /api/tickets/:id', () => {
  it('allows author to close own ticket', async () => {
    const token = await createUserAndGetToken('patcher@test.com');
    const created = await createTicket(token, { title: 'To Close', template: 'suggestion', formData: { description: 'd' } });

    const res = await request(app)
      .patch(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
  });

  it('rejects author changing status to in_progress', async () => {
    const token = await createUserAndGetToken('patcher-progress@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'in_progress' });

    expect(res.status).toBe(403);
  });

  it('rejects author changing status to invalid state', async () => {
    const token = await createUserAndGetToken('patcher-invalid@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'invalid' });

    expect(res.status).toBe(403);
  });

  it('allows staff to change status to invalid state', async () => {
    const token = await createUserAndGetToken('status-author@test.com');
    const staffToken = await createStaffAndGetToken('status-staff@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'invalid' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('invalid');
  });

  it('rejects author reopening an invalid ticket through status update', async () => {
    const token = await createUserAndGetToken('patcher-invalid-open@test.com');
    const staffToken = await createStaffAndGetToken('patcher-invalid-open-staff@test.com');
    const created = await createTicket(token);

    await request(app)
      .patch(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'invalid' });

    const res = await request(app)
      .patch(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'open' });

    expect(res.status).toBe(403);
  });

  it('rejects author closing an invalid ticket through status update', async () => {
    const token = await createUserAndGetToken('patcher-invalid-closed@test.com');
    const staffToken = await createStaffAndGetToken('patcher-invalid-closed-staff@test.com');
    const created = await createTicket(token);

    await request(app)
      .patch(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'invalid' });

    const res = await request(app)
      .patch(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(403);
  });

  it('allows staff to reopen an invalid ticket through status update', async () => {
    const token = await createUserAndGetToken('staff-invalid-open-author@test.com');
    const staffToken = await createStaffAndGetToken('staff-invalid-open@test.com');
    const created = await createTicket(token);

    await request(app)
      .patch(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'invalid' });

    const res = await request(app)
      .patch(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ status: 'open' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('open');
  });

  it('rejects non-author non-staff update', async () => {
    const authorToken = await createUserAndGetToken('author3@test.com');
    const otherToken = await createUserAndGetToken('other3@test.com');
    const created = await createTicket(authorToken);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.id}`)
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
      .patch(`/api/tickets/${created.body.id}/title`)
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Updated Title' });

    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Title');
  });

  it('rejects empty title', async () => {
    const token = await createUserAndGetToken('title-empty@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.id}/title`)
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
      .patch(`/api/tickets/${created.body.id}/body`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Updated body content' });

    expect(res.status).toBe(200);
    expect(res.body.body).toBe('Updated body content');
  });

  it('rejects empty body', async () => {
    const token = await createUserAndGetToken('body-empty@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .patch(`/api/tickets/${created.body.id}/body`)
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
      .post(`/api/tickets/${created.body.id}/close`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
  });

  it('rejects closing already closed ticket', async () => {
    const token = await createUserAndGetToken('close-dup@test.com');
    const created = await createTicket(token);
    await request(app).post(`/api/tickets/${created.body.id}/close`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/tickets/${created.body.id}/close`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/tickets/:id/reopen', () => {
  it('allows author to reopen closed ticket', async () => {
    const token = await createUserAndGetToken('reopener@test.com');
    const created = await createTicket(token);
    await request(app).post(`/api/tickets/${created.body.id}/close`).set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .post(`/api/tickets/${created.body.id}/reopen`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('open');
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
      .send({ name: 'test-label', color: '#ef4444' });

    const res = await request(app)
      .post(`/api/tickets/${created.body.id}/labels`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ labelId: label.body.id });

    expect(res.status).toBe(201);
  });

  it('rejects non-staff adding label', async () => {
    const token = await createUserAndGetToken('label-player@test.com');
    const created = await createTicket(token);

    const res = await request(app)
      .post(`/api/tickets/${created.body.id}/labels`)
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
      .send({ name: 'remove-me', color: '#000000' });

    await request(app)
      .post(`/api/tickets/${created.body.id}/labels`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ labelId: label.body.id });

    const res = await request(app)
      .delete(`/api/tickets/${created.body.id}/labels/${label.body.id}`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(204);
  });
});
