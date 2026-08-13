import { describe, it, expect, vi } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';
import * as attachmentService from '../src/services/attachment.service.js';

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
    await expect(
      prisma().auditLog.findFirst({
        where: { ticketId: ticket.body.data.id, action: 'comment_edit' },
        select: { oldValue: true, newValue: true },
      }),
    ).resolves.toEqual({ oldValue: 'Original comment', newValue: 'Edited comment' });
  });

  it('rolls back the body update when the audit insert fails', async () => {
    const token = await createUserAndGetToken('comment-transaction@test.com');
    const ticket = await createTicket(token);
    const comment = await request(app)
      .post(`/api/tickets/${ticket.body.data.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Transaction original' });

    await prisma().$executeRawUnsafe(`
      CREATE TRIGGER fail_comment_edit_audit
      BEFORE INSERT ON audit_logs
      WHEN NEW.action = 'comment_edit'
      BEGIN
        SELECT RAISE(ABORT, 'forced audit failure');
      END
    `);
    const res = await (async () => {
      try {
        return await request(app)
          .patch(`/api/tickets/${ticket.body.data.id}/comments/${comment.body.data.id}/body`)
          .set('Authorization', `Bearer ${token}`)
          .send({ body: 'Must not persist' });
      } finally {
        await prisma().$executeRawUnsafe('DROP TRIGGER IF EXISTS fail_comment_edit_audit');
      }
    })();

    expect(res.status).toBe(500);
    await expect(
      prisma().comment.findUniqueOrThrow({
        where: { id: comment.body.data.id },
        select: { body: true },
      }),
    ).resolves.toEqual({ body: 'Transaction original' });
    await expect(
      prisma().auditLog.count({
        where: { ticketId: ticket.body.data.id, action: 'comment_edit' },
      }),
    ).resolves.toBe(0);
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

describe('DELETE /api/tickets/:id/comments/:commentId', () => {
  it('keeps the comment when attachment cleanup fails', async () => {
    const token = await createUserAndGetToken('comment-delete-failure@test.com');
    const ticket = await createTicket(token);
    const comment = await request(app)
      .post(`/api/tickets/${ticket.body.data.id}/comments`)
      .set('Authorization', `Bearer ${token}`)
      .send({ body: 'Retain on cleanup failure' });

    vi.spyOn(attachmentService, 'cleanupCommentAttachments').mockRejectedValue(
      new Error('storage unavailable'),
    );

    const res = await request(app)
      .delete(`/api/tickets/${ticket.body.data.id}/comments/${comment.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(500);
    await expect(
      prisma().comment.findUnique({ where: { id: comment.body.data.id } }),
    ).resolves.toMatchObject({ body: 'Retain on cleanup failure' });
  });
});
