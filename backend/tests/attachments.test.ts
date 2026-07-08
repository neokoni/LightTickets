import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';
import { reinitStorageAdapter } from '../src/services/storage/index.js';
import { resolveUploadDir } from '../src/paths.js';

const app = createApp();

async function getUploadDir() {
  const config = await prisma().appConfig.findFirst();
  return resolveUploadDir(config!.uploadDir);
}

beforeEach(async () => {
  await prisma().appConfig.deleteMany();
  await prisma().appConfig.create({ data: {} });
  reinitStorageAdapter();
});

async function createUserAndGetToken(email = 'user@test.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  return res.body.data.accessToken;
}

async function getAdminToken(email: string) {
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  const user = await prisma().user.findUnique({ where: { email } });
  if (user) {
    await prisma().user.update({ where: { id: user.id }, data: { role: 'admin' } });
  }
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: email, password: 'Password123!' });
  return loginRes.body.data.accessToken;
}

async function createTicket(token: string) {
  return request(app)
    .post('/api/tickets')
    .set('Authorization', `Bearer ${token}`)
    .send({
      title: 'Attachment Ticket',
      template: 'bug_report',
      formData: { description: 'desc', reproduce: 'steps' },
    });
}

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);

describe('POST /api/attachments/upload', () => {
  it('uploads a valid image and returns 201 with attachment row', async () => {
    const token = await createUserAndGetToken('upload-ok@test.com');
    const ticket = await createTicket(token);

    const res = await request(app)
      .post('/api/attachments/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, 'test.png')
      .field('ticketId', String(ticket.body.data.id));

    expect(res.status).toBe(201);
    expect(res.body.data.id).toBeDefined();
    expect(res.body.data.filename).toBe('test.png');
    expect(res.body.data.mimeType).toBe('image/png');
    expect(res.body.data.storageType).toBe('local');
    expect(res.body.data.size).toBe(PNG_1x1.length);

    const filePath = path.resolve(await getUploadDir(), res.body.data.path);
    expect(fs.existsSync(filePath)).toBe(true);
  });

  it('rejects disallowed MIME type with 400', async () => {
    const token = await createUserAndGetToken('upload-bad-mime@test.com');

    const res = await request(app)
      .post('/api/attachments/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('MZ'), 'evil.exe');

    expect(res.status).toBe(400);
  });

  it('rejects file exceeding 10 MiB with 400', async () => {
    const token = await createUserAndGetToken('upload-too-big@test.com');
    const big = Buffer.alloc(10 * 1024 * 1024 + 1, 0);

    const res = await request(app)
      .post('/api/attachments/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', big, 'big.png');

    expect(res.status).toBe(400);
  });
});

describe('GET /api/attachments/:id', () => {
  it('returns file content for an existing attachment', async () => {
    const token = await createUserAndGetToken('get-ok@test.com');
    const upload = await request(app)
      .post('/api/attachments/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, 'test.png');

    const res = await request(app).get(`/api/attachments/${upload.body.data.id}`);

    expect(res.status).toBe(200);
    expect(res.body).toEqual(PNG_1x1);
  });

  it('returns 404 for nonexistent attachment', async () => {
    const res = await request(app).get('/api/attachments/nonexistent-id');

    expect(res.status).toBe(404);
  });
});

describe('DELETE /api/attachments/:id', () => {
  it('allows uploader to delete their own attachment (204, file removed)', async () => {
    const token = await createUserAndGetToken('delete-owner@test.com');
    const upload = await request(app)
      .post('/api/attachments/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, 'test.png');

    const filePath = path.resolve(await getUploadDir(), upload.body.data.path);
    expect(fs.existsSync(filePath)).toBe(true);

    const res = await request(app)
      .delete(`/api/attachments/${upload.body.data.id}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
    expect(fs.existsSync(filePath)).toBe(false);

    const row = await prisma().attachment.findUnique({ where: { id: upload.body.data.id } });
    expect(row).toBeNull();
  });

  it('rejects deletion by non-uploader with 403', async () => {
    const ownerToken = await createUserAndGetToken('delete-owner2@test.com');
    const otherToken = await createUserAndGetToken('delete-other@test.com');
    const upload = await request(app)
      .post('/api/attachments/upload')
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', PNG_1x1, 'test.png');

    const res = await request(app)
      .delete(`/api/attachments/${upload.body.data.id}`)
      .set('Authorization', `Bearer ${otherToken}`);

    expect(res.status).toBe(403);

    const row = await prisma().attachment.findUnique({ where: { id: upload.body.data.id } });
    expect(row).not.toBeNull();
  });

  it('allows admin to delete others attachment (204)', async () => {
    const ownerToken = await createUserAndGetToken('delete-owner3@test.com');
    const adminToken = await getAdminToken('delete-admin@test.com');
    const upload = await request(app)
      .post('/api/attachments/upload')
      .set('Authorization', `Bearer ${ownerToken}`)
      .attach('file', PNG_1x1, 'test.png');

    const res = await request(app)
      .delete(`/api/attachments/${upload.body.data.id}`)
      .set('Authorization', `Bearer ${adminToken}`);

    expect(res.status).toBe(204);
    const row = await prisma().attachment.findUnique({ where: { id: upload.body.data.id } });
    expect(row).toBeNull();
  });

  it('returns 404 for nonexistent attachment', async () => {
    const token = await createUserAndGetToken('delete-missing@test.com');

    const res = await request(app)
      .delete('/api/attachments/nonexistent-id')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(404);
  });
});

describe('GET /api/tickets/:id/attachments', () => {
  it('returns list of attachments with url field', async () => {
    const token = await createUserAndGetToken('list-ok@test.com');
    const ticket = await createTicket(token);
    await request(app)
      .post('/api/attachments/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, 'a.png')
      .field('ticketId', String(ticket.body.data.id));
    await request(app)
      .post('/api/attachments/upload')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, 'b.png')
      .field('ticketId', String(ticket.body.data.id));

    const res = await request(app)
      .get(`/api/tickets/${ticket.body.data.id}/attachments`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveLength(2);
    expect(res.body.data[0].url).toBe(`/api/attachments/${res.body.data[0].id}`);
  });
});
