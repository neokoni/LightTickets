import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';

const app = createApp();

async function createUserAndGetToken(email = 'user@test.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  return res.body.data.accessToken;
}

async function createTicket(token: string) {
  return request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Comment Ticket',
      template: 'bug_report',
      formData: { description: 'desc', reproduce: 'steps' },
    });
}

describe('PATCH /api/tickets/:id/comments/:commentId/body', () => {
  it('allows author to edit comment body', async () => {
    const token = await createUserAndGetToken('comment-editor@test.com');
    const ticket = await createTicket(token);

    const comment = await request(app)
      .post(`/api/tickets/${ticket.body.data.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Original comment' });

    const res = await request(app)
      .patch(`/api/tickets/${ticket.body.data.id}/comments/${comment.body.data.id}/body`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Edited comment' });

    expect(res.status).toBe(200);
    expect(res.body.data.body).toBe('Edited comment');
  });

  it("rejects editing another user's comment", async () => {
    const authorToken = await createUserAndGetToken('comment-author@test.com');
    const otherToken = await createUserAndGetToken('comment-other@test.com');
    const ticket = await createTicket(authorToken);

    const comment = await request(app)
      .post(`/api/tickets/${ticket.body.data.id}/comments`)
      .set('Authorization', `Bearer ${authorToken}`)
      .send({ body: 'Not yours' });

    const res = await request(app)
      .patch(`/api/tickets/${ticket.body.data.id}/comments/${comment.body.data.id}/body`)
      .set('Authorization', `Bearer ${otherToken}`)
      .send({ body: 'Trying to edit' });

    expect(res.status).toBe(403);
  });

  it('rejects empty body', async () => {
    const token = await createUserAndGetToken('comment-empty@test.com');
    const ticket = await createTicket(token);

    const comment = await request(app)
      .post(`/api/tickets/${ticket.body.data.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'A comment' });

    const res = await request(app)
      .patch(`/api/tickets/${ticket.body.data.id}/comments/${comment.body.data.id}/body`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: '' });

    expect(res.status).toBe(400);
  });
});
