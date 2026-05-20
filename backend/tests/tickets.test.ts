import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

async function createUserAndGetToken(email = 'user@test.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  return res.body.accessToken;
}

describe('POST /api/tickets', () => {
  it('creates a ticket', async () => {
    const token = await createUserAndGetToken();
    const res = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Test Bug', body: 'Something broke', type: 'bug_report' });

    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Test Bug');
    expect(res.body.status).toBe('open');
  });

  it('rejects unauthenticated request', async () => {
    const res = await request(app)
      .post('/api/tickets')
      .send({ title: 'Test', body: 'Body', type: 'bug_report' });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/tickets', () => {
  it('returns paginated tickets with filters', async () => {
    const token = await createUserAndGetToken('filter@test.com');
    await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Bug 1', body: 'Body', type: 'bug_report' });
    await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'Suggestion 1', body: 'Body', type: 'suggestion' });

    const res = await request(app)
      .get('/api/tickets?type=bug_report')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.tickets).toHaveLength(1);
    expect(res.body.tickets[0].title).toBe('Bug 1');
    expect(res.body).toHaveProperty('total');
    expect(res.body).toHaveProperty('page');
  });
});

describe('PATCH /api/tickets/:id', () => {
  it('allows author to update status', async () => {
    const token = await createUserAndGetToken('patcher@test.com');
    const created = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${token}`)
      .send({ title: 'To Close', body: 'Body', type: 'suggestion' });

    const res = await request(app)
      .patch(`/api/tickets/${created.body.id}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ status: 'closed' });

    expect(res.status).toBe(200);
    expect(res.body.status).toBe('closed');
  });
});
