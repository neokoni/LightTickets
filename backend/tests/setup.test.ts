import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';
import createSetupRoutes from '../src/routes/setup.js';

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
    expect(res.body.data.isSetup).toBe(false);
    expect(res.body.data.siteName).toBe('LightTickets');
    expect(res.body.data).toHaveProperty('requireLogin');
  });

  it('returns footerContent and siteUrl in site config', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 'config-test@test.com', password: 'admin123', username: 'configtest' },
      });

    const res = await request(app).get('/api/setup/site-config');
    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('siteUrl');
    expect(res.body.data).toHaveProperty('footerContent');
  });
});

describe('POST /api/setup', () => {
  it('creates admin and setup record on first run', async () => {
    const res = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 'admin@example.com', password: 'admin123', username: 'admin' },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.setup.isSetup).toBe(true);
    expect(res.body.data.admin.email).toBe('admin@example.com');
    expect(res.body.data.admin.role).toBe('admin');
    expect(res.body.data).toHaveProperty('accessToken');
    expect(res.body.data).toHaveProperty('refreshToken');

    const status = await request(app).get('/api/setup/site-config');
    expect(status.body.data.isSetup).toBe(true);
  });

  it('persists local storage settings during setup', async () => {
    const res = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 'local-storage@example.com', password: 'admin123', username: 'localstore' },
        storage: { driver: 'local', uploadDir: 'data/setup-uploads' },
      });

    expect(res.status).toBe(201);
    const config = await prisma().appConfig.findFirst();
    expect(config!.storageDriver).toBe('local');
    expect(config!.uploadDir).toBe('data/setup-uploads');
    expect(config!.s3Config).toBeNull();
  });

  it('persists s3 storage settings during setup', async () => {
    const res = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 's3-storage@example.com', password: 'admin123', username: 's3store' },
        storage: {
          driver: 's3',
          s3: {
            endpoint: 'http://localhost:9000',
            bucket: 'lighttickets',
            accessKeyId: 'minioadmin',
            secretAccessKey: 'minioadmin',
            forcePathStyle: true,
            presignExpiry: 600,
          },
        },
      });

    expect(res.status).toBe(201);
    const config = await prisma().appConfig.findFirst();
    expect(config!.storageDriver).toBe('s3');
    const s3 = JSON.parse(config!.s3Config!);
    expect(s3.bucket).toBe('lighttickets');
    expect(s3.region).toBe('us-east-1');
    expect(s3.presignExpiry).toBe(600);
  });

  it('rejects invalid payload', async () => {
    const res = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 'bad', password: 'short', username: 'x' },
      });

    expect([400, 422]).toContain(res.status);
  });

  it('rejects setup after already initialized', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 'dupsetup@example.com', password: 'admin123', username: 'dupsetup' },
      });

    const res = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 'another@example.com', password: 'admin123', username: 'another' },
      });

    expect(res.status).toBe(409);
  });

  it('calls the setup completion callback after setup succeeds', async () => {
    const onSetupComplete = vi.fn();
    const setupApp = express();
    setupApp.use(express.json());
    setupApp.use('/api/setup', createSetupRoutes({ onSetupComplete }));

    const res = await request(setupApp)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 'callback@example.com', password: 'admin123', username: 'callback' },
      });

    expect(res.status).toBe(201);
    expect(onSetupComplete).toHaveBeenCalledOnce();
  });
});

describe('PATCH /api/setup/settings', () => {
  it('allows admin to update requireLogin setting', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-admin@test.com',
          password: 'admin123',
          username: 'settingsadmin',
        },
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'settings-admin@test.com', password: 'admin123' });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`)
      .send({ requireLogin: true });

    expect(res.status).toBe(200);
    expect(res.body.data.requireLogin).toBe(true);
  });

  it('rejects non-admin user', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-admin2@test.com',
          password: 'admin123',
          username: 'settingsadmin2',
        },
      });

    await request(app).post('/api/auth/register').send({
      email: 'settings-player@test.com',
      password: 'Password123!',
      username: 'settingsplayer',
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'settings-player@test.com', password: 'Password123!' });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`)
      .send({ requireLogin: true });

    expect(res.status).toBe(403);
  });

  it('allows admin to update allowMcRegister setting', async () => {
    const setupRes = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'mc-settings-admin@test.com',
          password: 'admin123',
          username: 'mcsettingsadmin',
        },
      });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${setupRes.body.data.accessToken}`)
      .send({ allowMcRegister: false });

    expect(res.status).toBe(200);
    expect(res.body.data.allowMcRegister).toBe(false);

    const config = await request(app).get('/api/setup/site-config');
    expect(config.body.data.allowMcRegister).toBe(false);
  });

  it('allows admin to update siteName, siteUrl, and footerContent', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-ext@test.com',
          password: 'admin123',
          username: 'settingsadminext',
        },
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'settings-ext@test.com', password: 'admin123' });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`)
      .send({
        siteName: 'My Tickets',
        siteUrl: 'https://tickets.example.com',
        footerContent: '<a href="https://beian.miit.gov.cn">京ICP备12345678号</a>',
      });

    expect(res.status).toBe(200);
    expect(res.body.data.siteName).toBe('My Tickets');
    expect(res.body.data.siteUrl).toBe('https://tickets.example.com');
    expect(res.body.data.footerContent).toBe(
      '<a href="https://beian.miit.gov.cn">京ICP备12345678号</a>',
    );
  });

  it('allows clearing siteUrl and footerContent with null', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-clear@test.com',
          password: 'admin123',
          username: 'settingsadminclear',
        },
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'settings-clear@test.com', password: 'admin123' });

    // First set values
    await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`)
      .send({ siteUrl: 'https://example.com', footerContent: '<p>info</p>' });

    // Then clear them
    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`)
      .send({ siteUrl: null, footerContent: null });

    expect(res.status).toBe(200);
    expect(res.body.data.siteUrl).toBeNull();
    expect(res.body.data.footerContent).toBeNull();
  });

  it('rejects empty siteName', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-valid@test.com',
          password: 'admin123',
          username: 'settingsadminvalid',
        },
      });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'settings-valid@test.com', password: 'admin123' });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`)
      .send({ siteName: '' });

    expect([400, 422]).toContain(res.status);
  });
});

describe('POST /api/auth/link-minecraft', () => {
  it('links minecraft account with valid code', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'link@test.com', password: 'Password123!', username: 'linkuser' });
    const token = regRes.body.data.accessToken;

    await prisma().server.create({
      data: { name: 'link-srv', apiKey: 'link-key' },
    });

    const codeRes = await request(app)
      .post('/api/mc/link-code')
      .set('X-Server-Key', 'link-key')
      .send({ minecraftUuid: '550e8400-e29b-41d4-a716-446655440000', minecraftName: 'Steve' });

    const res = await request(app)
      .post('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${token}`)
      .send({ code: codeRes.body.data.code });

    expect(res.status).toBe(200);
    expect(res.body.data.uuid).toBe('550e8400-e29b-41d4-a716-446655440000');
    expect(res.body.data.name).toBe('Steve');
  });

  it('rejects invalid code', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'link-bad@test.com', password: 'Password123!', username: 'linkbaduser' });

    const res = await request(app)
      .post('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${regRes.body.data.accessToken}`)
      .send({ code: '000000' });

    expect(res.status).toBe(400);
  });

  it('rejects missing code', async () => {
    const regRes = await request(app)
      .post('/api/auth/register')
      .send({ email: 'link-miss@test.com', password: 'Password123!', username: 'linkmissuser' });

    const res = await request(app)
      .post('/api/auth/link-minecraft')
      .set('Authorization', `Bearer ${regRes.body.data.accessToken}`)
      .send({});

    expect(res.status).toBe(400);
  });
});
