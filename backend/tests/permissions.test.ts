import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

async function setupPermissionTicket() {
  const reg = await request(app)
    .post('/api/auth/register')
    .send({ email: 'requester@test.com', password: 'Password123!', username: 'requester' });
  const token = reg.body.accessToken;

  const ticket = await request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Request builder rank',
      template: 'permission_request',
      formData: { reason: 'I want to build' },
    });

  await prisma().permissionRequest.create({
    data: { ticket: { connect: { id: ticket.body.id } }, groupName: 'builder' },
  });

  const staff = await request(app)
    .post('/api/auth/register')
    .send({ email: 'staff@test.com', password: 'Password123!', username: 'staffuser' });
  await prisma().user.update({ where: { email: 'staff@test.com' }, data: { role: 'staff' } });
  const staffLogin = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: 'staff@test.com', password: 'Password123!' });

  return { ticketId: ticket.body.id, staffToken: staffLogin.body.accessToken, playerToken: token };
}

describe('POST /api/tickets/:id/approve', () => {
  it('staff can approve a permission request', async () => {
    const { ticketId, staffToken } = await setupPermissionTicket();

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/approve`)
      .set('Authorization', `Bearer ${staffToken}`);

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
    expect(res.body.permissionRequest.executionStatus).toBe('pending');
  });

  it('player cannot approve', async () => {
    const { ticketId, playerToken } = await setupPermissionTicket();

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/approve`)
      .set('Authorization', `Bearer ${playerToken}`);

    expect(res.status).toBe(403);
  });
});

describe('POST /api/tickets/:id/reject', () => {
  it('staff can reject with reason', async () => {
    const { ticketId, staffToken } = await setupPermissionTicket();

    const res = await request(app)
      .post(`/api/tickets/${ticketId}/reject`)
      .set('Authorization', `Bearer ${staffToken}`)
      .send({ reason: 'Not enough playtime' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('invalid');
  });
});
