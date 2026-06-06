import { describe, it, expect } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';

const app = createApp();

describe('GET /api/health', () => {
  it('returns ok status', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
  });
});

describe('GET /api/setup/site-config', () => {
  it('returns default config when no setup record exists', async () => {
    const res = await request(app).get('/api/setup/site-config');
    expect(res.status).toBe(200);
    expect(res.body.isSetup).toBe(false);
    expect(res.body.siteName).toBe('LightTickets');
    expect(res.body).toHaveProperty('requireLogin');
  });

  it('returns footerContent and siteUrl in site config', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite', databaseUrl: 'file:./dev.db' },
        admin: { email: 'config-test@test.com', password: 'admin123', username: 'configtest' },
      });

    const res = await request(app).get('/api/setup/site-config');
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty('siteUrl');
    expect(res.body).toHaveProperty('footerContent');
  });
});

describe('POST /api/setup', () => {
  it('creates admin and setup record on first run', async () => {
    const res = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite', databaseUrl: 'file:./dev.db' },
        admin: { email: 'admin@example.com', password: 'admin123', username: 'admin' },
      });

    expect(res.status).toBe(201);
    expect(res.body.setup.isSetup).toBe(true);
    expect(res.body.admin.email).toBe('admin@example.com');
    expect(res.body.admin.role).toBe('admin');
    expect(res.body).toHaveProperty('accessToken');
    expect(res.body).toHaveProperty('refreshToken');

    const status = await request(app).get('/api/setup/site-config');
    expect(status.body.isSetup).toBe(true);
  });

  it('rejects invalid payload', async () => {
    const res = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite', databaseUrl: '' },
        admin: { email: 'bad', password: 'short', username: 'x' },
      });

    expect([400, 422]).toContain(res.status);
  });

  it('rejects setup after already initialized', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite', databaseUrl: 'file:./dev.db' },
        admin: { email: 'dupsetup@example.com', password: 'admin123', username: 'dupsetup' },
      });

    const res = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite', databaseUrl: 'file:./dev.db' },
        admin: { email: 'another@example.com', password: 'admin123', username: 'another' },
      });

    expect(res.status).toBe(409);
  });
});

describe('PATCH /api/setup/settings', () => {
  it('allows admin to update requireLogin setting', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite', databaseUrl: 'file:./dev.db' },
        admin: { email: 'settings-admin@test.com', password: 'admin123', username: 'settingsadmin' },
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'settings-admin@test.com', password: 'admin123' });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ requireLogin: true });

    expect(res.status).toBe(200);
    expect(res.body.requireLogin).toBe(true);
  });

  it('rejects non-admin user', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite', databaseUrl: 'file:./dev.db' },
        admin: { email: 'settings-admin2@test.com', password: 'admin123', username: 'settingsadmin2' },
      });

    await request(app)
      .post('/api/auth/register')
      .send({ email: 'settings-player@test.com', password: 'Password123!', username: 'settingsplayer' });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'settings-player@test.com', password: 'Password123!' });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ requireLogin: true });

    expect(res.status).toBe(403);
  });

  it('allows admin to update siteName, siteUrl, and footerContent', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite', databaseUrl: 'file:./dev.db' },
        admin: { email: 'settings-ext@test.com', password: 'admin123', username: 'settingsadminext' },
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'settings-ext@test.com', password: 'admin123' });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({
        siteName: 'My Tickets',
        siteUrl: 'https://tickets.example.com',
        footerContent: '<a href="https://beian.miit.gov.cn">京ICP备12345678号</a>',
      });

    expect(res.status).toBe(200);
    expect(res.body.siteName).toBe('My Tickets');
    expect(res.body.siteUrl).toBe('https://tickets.example.com');
    expect(res.body.footerContent).toBe('<a href="https://beian.miit.gov.cn">京ICP备12345678号</a>');
  });

  it('allows clearing siteUrl and footerContent with null', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite', databaseUrl: 'file:./dev.db' },
        admin: { email: 'settings-clear@test.com', password: 'admin123', username: 'settingsadminclear' },
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'settings-clear@test.com', password: 'admin123' });

    // First set values
    await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ siteUrl: 'https://example.com', footerContent: '<p>info</p>' });

    // Then clear them
    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ siteUrl: null, footerContent: null });

    expect(res.status).toBe(200);
    expect(res.body.siteUrl).toBeNull();
    expect(res.body.footerContent).toBeNull();
  });

  it('rejects empty siteName', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite', databaseUrl: 'file:./dev.db' },
        admin: { email: 'settings-valid@test.com', password: 'admin123', username: 'settingsadminvalid' },
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ email: 'settings-valid@test.com', password: 'admin123' });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.accessToken}`)
      .send({ siteName: '' });

    expect([400, 422]).toContain(res.status);
  });
});

describe('POST /api/auth/link-minecraft', () => {
  it('links minecraft account with valid code', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'link@test.com', password: 'Password123!', username: 'linkuser' });
    const token = regRes.body.accessToken;

    const server = await prisma().server.create({
      data: { name: 'link-srv', apiKey: 'link-key' },
    });

    const codeRes = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', 'link-key')
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440000', minecraftName: 'Steve' });

    const res = await request(app)
      .post('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: codeRes.body.code });

    expect(res.status).toBe(200);
    expect(res.body.uuid).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(res.body.name).toBe('Steve');
  });

  it('rejects invalid code', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'link-bad@test.com', password: 'Password123!', username: 'linkbaduser' });

    const res = await request(app)
      .post('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${regRes.body.accessToken}`)
      .send({ code: '000000' });

    expect(res.status).toBe(400);
  });

  it('rejects missing code', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'link-miss@test.com', password: 'Password123!', username: 'linkmissuser' });

    const res = await request(app)
      .post('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${regRes.body.accessToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
