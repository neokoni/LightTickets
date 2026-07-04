import { describe, it, expect, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

const templatesDir = path.resolve('data/templates');
const testTemplateNames = ['custom_test', 'dup_tmpl', 'patch_tmpl', 'delete_tmpl'];

afterEach(() => {
  for (const name of testTemplateNames) {
    const filePath = path.join(templatesDir, `${name}.yml`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

async function setupAndGetAdmin() {
  await request(app)
    .post('/api/setup')
    .send({
      db: { provider: 'sqlite', databaseUrl: 'file:./dev.db' },
      admin: { email: 'admin@tmpl.test', password: 'admin123', username: 'tmpladmin' },
    });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: 'admin@tmpl.test', password: 'admin123' });
  return loginRes.body.accessToken;
}

async function createUserAndGetToken(email = 'user@test.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  return res.body.accessToken;
}

describe('GET /api/templates', () => {
  it('returns list of enabled templates', async () => {
    await setupAndGetAdmin();

    const res = await request(app).get('/api/templates');
    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThanOrEqual(1);

    const tmpl = res.body[0];
    expect(tmpl).toHaveProperty('name');
    expect(tmpl).toHaveProperty('name_i18n');
    expect(tmpl).toHaveProperty('description');
    expect(tmpl).toHaveProperty('labels');
  });
});

describe('GET /api/templates/:name', () => {
  it('returns a specific template by name', async () => {
    await setupAndGetAdmin();

    const res = await request(app).get('/api/templates/bug_report');
    expect(res.status).toBe(200);
    expect(res.body.name).toBeDefined();
    expect(res.body.description).toBeDefined();
    expect(res.body.body).toBeInstanceOf(Array);
  });

  it('returns 404 for nonexistent template', async () => {
    await setupAndGetAdmin();

    const res = await request(app).get('/api/templates/nonexistent');
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/templates', () => {
  it('returns all templates for admin', async () => {
    const token = await setupAndGetAdmin();

    const res = await request(app)
      .get('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toBeInstanceOf(Array);
    expect(res.body.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects non-admin user', async () => {
    await setupAndGetAdmin();
    const userToken = await createUserAndGetToken('nonadmin@tmpl.test');

    const res = await request(app)
      .get('/api/admin/templates')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });
});

describe('GET /api/admin/templates/:id', () => {
  it('returns a single admin template', async () => {
    const token = await setupAndGetAdmin();

    const list = await request(app)
      .get('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/api/admin/templates/${list.body[0].name}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('name');
    expect(res.body).toHaveProperty('body');
  });
});

describe('POST /api/admin/templates', () => {
  it('creates a new template', async () => {
    const token = await setupAndGetAdmin();

    const res = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'custom_test',
        nameI18n: 'Custom Test',
        description: 'A test template',
        body: '- type: input\n  id: reason\n  validations:\n    required: true\n  attributes:\n    label: Reason',
      });

    expect(res.status).toBe(201);
    expect(res.body.name).toBe('custom_test');
  });

  it('rejects duplicate template name', async () => {
    const token = await setupAndGetAdmin();

    await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'dup_tmpl',
        nameI18n: 'Dup',
        description: 'Dup template',
        body: '- type: input\n  id: x\n  attributes:\n    label: X',
      });

    const res = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'dup_tmpl',
        nameI18n: 'Dup 2',
        description: 'Dup template 2',
        body: '- type: input\n  id: x\n  attributes:\n    label: X',
      });

    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/admin/templates/:id', () => {
  it('updates a template', async () => {
    const token = await setupAndGetAdmin();

    const created = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'patch_tmpl',
        nameI18n: 'Patch Template',
        description: 'Original',
        body: '- type: input\n  id: x\n  attributes:\n    label: X',
      });

    const res = await request(app)
      .patch(`/api/admin/templates/${created.body.name}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(res.body.description).toBe('Updated description');
  });
});

describe('DELETE /api/admin/templates/:id', () => {
  it('deletes a template', async () => {
    const token = await setupAndGetAdmin();

    const created = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'delete_tmpl',
        nameI18n: 'Delete Template',
        description: 'To be deleted',
        body: '- type: input\n  id: x\n  attributes:\n    label: X',
      });

    const res = await request(app)
      .delete(`/api/admin/templates/${created.body.name}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });
});
