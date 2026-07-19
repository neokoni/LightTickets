import { describe, it, expect, vi } from 'vitest';
import express from 'express';
import fs from 'fs';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { dataPath } from '../src/paths.js';
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
    expect(res.body.data.defaultLanguage).toBe('zh-CN');
    expect(res.body.data.turnstile).toEqual({ enabled: false, siteKey: '' });
    expect(res.body.data.passwordResetEnabled).toBe(false);
    expect(res.body.data.registrationEmailVerificationEnabled).toBe(false);
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

  it('records the request Origin as corsOrigins in config.yml', async () => {
    fs.rmSync(dataPath('config.yml'), { force: true });

    const originApp = express();
    originApp.use(express.json());
    originApp.use('/api/setup', createSetupRoutes());

    const res = await request(originApp)
      .post('/api/setup')
      .set('Origin', 'https://tickets.example.com')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 'origin-test@example.com', password: 'admin123', username: 'origintest' },
      });

    expect(res.status).toBe(201);
    const config = fs.readFileSync(dataPath('config.yml'), 'utf-8');
    expect(config).toContain('https://tickets.example.com');
    expect(config).not.toContain('http://localhost:23310');
  });

  it('falls back to the Host header when Origin is absent', async () => {
    fs.rmSync(dataPath('config.yml'), { force: true });

    const originApp = express();
    originApp.use(express.json());
    originApp.use('/api/setup', createSetupRoutes());

    const res = await request(originApp)
      .post('/api/setup')
      .set('Host', 'tickets.internal:8080')
      .set('X-Forwarded-Proto', 'https')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 'host-test@example.com', password: 'admin123', username: 'hosttest' },
      });

    expect(res.status).toBe(201);
    const config = fs.readFileSync(dataPath('config.yml'), 'utf-8');
    expect(config).toContain('https://tickets.internal:8080');
    expect(config).not.toContain('http://localhost:23310');
  });

  it('persists local storage settings during setup', async () => {
    const res = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 'local-storage@example.com', password: 'admin123', username: 'localstore' },
        storage: { driver: 'local' },
      });

    expect(res.status).toBe(201);
    const config = await prisma().appConfig.findFirst();
    expect(config!.storageDriver).toBe('local');
    expect(config!.uploadDir).toBe('data/uploads');
    expect(config!.s3Config).toBeNull();
  });

  it('persists default language during setup', async () => {
    const res = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: { email: 'language-setup@example.com', password: 'admin123', username: 'langsetup' },
        site: { defaultLanguage: 'zh-CN' },
      });

    expect(res.status).toBe(201);
    expect(res.body.data.setup.defaultLanguage).toBe('zh-CN');

    const config = await request(app).get('/api/setup/site-config');
    expect(config.body.data.defaultLanguage).toBe('zh-CN');
  });

  it('does not accept turnstile configuration during setup', async () => {
    const res = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'turnstile-setup@example.com',
          password: 'admin123',
          username: 'turnstilesetup',
        },
        turnstile: {
          enabled: true,
          siteKey: 'site-key',
          secretKey: 'secret-key',
        },
      });

    expect([400, 422]).toContain(res.status);
    await expect(prisma().setupStatus.count()).resolves.toBe(0);
    await expect(prisma().appConfig.count()).resolves.toBe(0);
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

  it('rejects legacy mysql databaseUrl and user fields', async () => {
    const res = await request(app)
      .post('/api/setup')
      .send({
        db: {
          provider: 'mysql',
          databaseUrl: 'mysql://app:secret@db.internal:3307/lighttickets',
          user: 'app',
        },
        admin: { email: 'legacy-mysql@example.com', password: 'admin123', username: 'legacydb' },
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
  it('returns admin settings with masked mail config', async () => {
    const setupRes = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-read@test.com',
          password: 'admin123',
          username: 'settingsread',
        },
      });

    const res = await request(app)
      .get('/api/setup/settings')
      .set('Authorization', `Bearer ${setupRes.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.data.mail).toMatchObject({
      enabled: false,
      host: '',
      port: 587,
      secure: false,
      username: null,
      passwordSet: false,
      fromName: '',
      fromAddress: '',
    });
    expect(res.body.data.mail).not.toHaveProperty('password');
    expect(res.body.data.sendEmailNotifications).toBe(false);
    expect(res.body.data.turnstile).toMatchObject({
      enabled: false,
      siteKey: '',
      secretKeySet: false,
    });
    expect(res.body.data.turnstile).not.toHaveProperty('secretKey');
  });

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

  it('allows admin to enable ticket email notifications', async () => {
    const setupRes = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'notification-settings@test.com',
          password: 'admin123',
          username: 'notificationsettings',
        },
      });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${setupRes.body.data.accessToken}`)
      .send({ sendEmailNotifications: true });

    expect(res.status).toBe(200);
    expect(res.body.data.sendEmailNotifications).toBe(true);
    expect((await prisma().setupStatus.findFirst())?.sendEmailNotifications).toBe(true);
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

  it('allows admin to update default language', async () => {
    const setupRes = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-language@test.com',
          password: 'admin123',
          username: 'settingslanguage',
        },
      });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${setupRes.body.data.accessToken}`)
      .send({ defaultLanguage: 'zh-CN' });

    expect(res.status).toBe(200);
    expect(res.body.data.defaultLanguage).toBe('zh-CN');
  });

  it('allows admin to update mail settings without exposing password', async () => {
    const setupRes = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-mail@test.com',
          password: 'admin123',
          username: 'settingsmail',
        },
      });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${setupRes.body.data.accessToken}`)
      .send({
        mail: {
          enabled: true,
          host: 'smtp.example.com',
          port: 587,
          secure: false,
          username: 'mailer',
          password: 'secret',
          fromName: 'Tickets',
          fromAddress: 'noreply@example.com',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.mail).toMatchObject({
      enabled: true,
      host: 'smtp.example.com',
      port: 587,
      secure: false,
      username: 'mailer',
      passwordSet: true,
      fromName: 'Tickets',
      fromAddress: 'noreply@example.com',
    });
    expect(res.body.data.mail).not.toHaveProperty('password');

    const config = await prisma().appConfig.findFirst();
    const mailConfig = JSON.parse(config!.mailConfig!);
    expect(mailConfig.password).toBe('secret');

    const siteConfig = await request(app).get('/api/setup/site-config');
    expect(siteConfig.body.data.passwordResetEnabled).toBe(true);
    expect(siteConfig.body.data.registrationEmailVerificationEnabled).toBe(true);
    expect(siteConfig.body.data).not.toHaveProperty('mail');
  });

  it('keeps the existing mail password when password is omitted', async () => {
    const setupRes = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-mail-keep@test.com',
          password: 'admin123',
          username: 'settingsmailkeep',
        },
      });

    await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${setupRes.body.data.accessToken}`)
      .send({
        mail: {
          enabled: true,
          host: 'smtp.example.com',
          port: 587,
          username: 'mailer',
          password: 'secret',
          fromAddress: 'noreply@example.com',
        },
      });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${setupRes.body.data.accessToken}`)
      .send({
        mail: {
          enabled: true,
          host: 'smtp2.example.com',
          port: 465,
          secure: true,
          username: 'mailer',
          fromAddress: 'noreply@example.com',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.mail.passwordSet).toBe(true);
    const config = await prisma().appConfig.findFirst();
    const mailConfig = JSON.parse(config!.mailConfig!);
    expect(mailConfig.host).toBe('smtp2.example.com');
    expect(mailConfig.password).toBe('secret');
  });

  it('allows admin to update turnstile settings without exposing secret key', async () => {
    const setupRes = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-turnstile@test.com',
          password: 'admin123',
          username: 'settingsturnstile',
        },
      });

    const res = await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${setupRes.body.data.accessToken}`)
      .send({
        turnstile: {
          enabled: true,
          siteKey: 'site-key',
          secretKey: 'secret-key',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.data.turnstile).toMatchObject({
      enabled: true,
      siteKey: 'site-key',
      secretKeySet: true,
    });
    expect(res.body.data.turnstile).not.toHaveProperty('secretKey');

    const siteConfig = await request(app).get('/api/setup/site-config');
    expect(siteConfig.body.data.turnstile).toEqual({ enabled: true, siteKey: 'site-key' });

    const config = await prisma().appConfig.findFirst();
    const turnstileConfig = JSON.parse(config!.turnstileConfig!);
    expect(turnstileConfig.secretKey).toBe('secret-key');
  });

  it('does not expose turnstile as enabled without both keys', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-turnstile-partial@test.com',
          password: 'admin123',
          username: 'settingsturnstilepartial',
        },
      });
    const config = await prisma().appConfig.findFirst();
    await prisma().appConfig.update({
      where: { id: config!.id },
      data: {
        turnstileConfig: JSON.stringify({
          enabled: true,
          siteKey: 'site-key',
          secretKey: null,
        }),
      },
    });

    const siteConfig = await request(app).get('/api/setup/site-config');

    expect(siteConfig.body.data.turnstile).toEqual({ enabled: false, siteKey: 'site-key' });
  });

  it('allows admin to test saved mail settings', async () => {
    const setupRes = await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-mail-test@test.com',
          password: 'admin123',
          username: 'settingsmailtest',
        },
      });

    await request(app)
      .patch('/api/setup/settings')
      .set('Authorization', `Bearer ${setupRes.body.data.accessToken}`)
      .send({
        mail: {
          enabled: true,
          host: 'smtp.example.com',
          port: 587,
          username: 'mailer',
          password: 'secret',
          fromAddress: 'noreply@example.com',
        },
      });

    const res = await request(app)
      .post('/api/setup/settings/mail/test')
      .set('Authorization', `Bearer ${setupRes.body.data.accessToken}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('rejects mail test for non-admin users', async () => {
    await request(app)
      .post('/api/setup')
      .send({
        db: { provider: 'sqlite' },
        admin: {
          email: 'settings-mail-test-admin@test.com',
          password: 'admin123',
          username: 'settingsmailtestadmin',
        },
      });

    await request(app).post('/api/auth/register').send({
      email: 'settings-mail-test-player@test.com',
      password: 'Password123!',
      username: 'settingsmailtestplayer',
    });

    const loginRes = await request(app)
      .post('/api/auth/login')
      .send({ emailOrUsername: 'settingsmailtestplayer', password: 'Password123!' });

    const res = await request(app)
      .post('/api/setup/settings/mail/test')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);

    expect(res.status).toBe(403);
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

  it('allows empty siteName and falls back to the default title publicly', async () => {
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

    expect(res.status).toBe(200);
    expect(res.body.data.siteName).toBe('');

    const settings = await request(app)
      .get('/api/setup/settings')
      .set('Authorization', `Bearer ${loginRes.body.data.accessToken}`);
    expect(settings.status).toBe(200);
    expect(settings.body.data.siteName).toBe('');

    const siteConfig = await request(app).get('/api/setup/site-config');
    expect(siteConfig.status).toBe(200);
    expect(siteConfig.body.data.siteName).toBe('LightTickets');
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
