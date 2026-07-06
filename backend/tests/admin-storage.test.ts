import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';
import { reinitStorageAdapter } from '../src/services/storage/index.js';
import { reloadConfig } from '../src/config.js';

const app = createApp();
const configPath = path.resolve('data/config.yml');

const baseConfig = `port: 3000
jwtSecret: 38fa1ae39140946ad7cbc627fb9aaf28d45e12ab72ce400d510e3eff1579cc23
jwtRefreshSecret: c2d8fee75bb94b326b855667e0313a5d8a6024093b87ba1ae2f04fce86d74b96
db:
  provider: sqlite
  databaseUrl: file:./dev.db
storage:
  driver: local
  uploadDir: data/uploads
`;

let originalConfig: string | null;

async function getAdminToken(email = 'storage-admin@test.com') {
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
  return loginRes.body.accessToken;
}

describe('GET /api/admin/storage', () => {
  beforeEach(() => {
    originalConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : null;
    fs.writeFileSync(configPath, baseConfig, 'utf-8');
    reinitStorageAdapter();
  });

  afterEach(() => {
    if (originalConfig !== null) fs.writeFileSync(configPath, originalConfig, 'utf-8');
    reinitStorageAdapter();
  });

  it('returns current local storage config', async () => {
    const token = await getAdminToken('storage-get@test.com');
    const res = await request(app)
      .get('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.driver).toBe('local');
    expect(res.body.uploadDir).toBeDefined();
  });

  it('masks secretAccessKey when s3 configured', async () => {
    const s3Config = `port: 3000
jwtSecret: 38fa1ae39140946ad7cbc627fb9aaf28d45e12ab72ce400d510e3eff1579cc23
jwtRefreshSecret: c2d8fee75bb94b326b855667e0313a5d8a6024093b87ba1ae2f04fce86d74b96
db:
  provider: sqlite
  databaseUrl: file:./dev.db
storage:
  driver: s3
  uploadDir: data/uploads
  s3:
    endpoint: http://localhost:9000
    region: us-east-1
    bucket: test
    accessKeyId: realkey
    secretAccessKey: realsecret
    forcePathStyle: true
    presignExpiry: 300
`;
    fs.writeFileSync(configPath, s3Config, 'utf-8');
    reloadConfig();

    const token = await getAdminToken('storage-mask@test.com');
    const res = await request(app)
      .get('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.driver).toBe('s3');
    expect(res.body.s3.secretAccessKey).toBe('••••••••');
  });

  it('rejects non-admin with 403', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'storage-noperm@test.com', password: 'Password123!', username: 'noperm' });
    const token = res.body.accessToken;

    const result = await request(app)
      .get('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`);

    expect(result.status).toBe(403);
  });
});

describe('PUT /api/admin/storage', () => {
  beforeEach(() => {
    originalConfig = fs.existsSync(configPath) ? fs.readFileSync(configPath, 'utf-8') : null;
    fs.writeFileSync(configPath, baseConfig, 'utf-8');
    reinitStorageAdapter();
  });

  afterEach(() => {
    if (originalConfig !== null) fs.writeFileSync(configPath, originalConfig, 'utf-8');
    reinitStorageAdapter();
  });

  it('switches driver to s3 and persists to config.yml', async () => {
    const token = await getAdminToken('storage-put@test.com');
    const res = await request(app)
      .put('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`)
      .send({
        driver: 's3',
        uploadDir: 'data/uploads',
        s3: {
          endpoint: 'http://localhost:9000',
          region: 'us-east-1',
          bucket: 'mybucket',
          accessKeyId: 'mykey',
          secretAccessKey: 'mysecret',
          forcePathStyle: true,
          presignExpiry: 600,
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.driver).toBe('s3');

    const written = fs.readFileSync(configPath, 'utf-8');
    const yaml = (await import('js-yaml')).load(written) as any;
    expect(yaml.storage.driver).toBe('s3');
    expect(yaml.storage.s3.bucket).toBe('mybucket');
    expect(yaml.storage.s3.presignExpiry).toBe(600);
  });

  it('preserves existing secret when not provided in update', async () => {
    const s3Config = `port: 3000
jwtSecret: 38fa1ae39140946ad7cbc627fb9aaf28d45e12ab72ce400d510e3eff1579cc23
jwtRefreshSecret: c2d8fee75bb94b326b855667e0313a5d8a6024093b87ba1ae2f04fce86d74b96
db:
  provider: sqlite
  databaseUrl: file:./dev.db
storage:
  driver: s3
  uploadDir: data/uploads
  s3:
    endpoint: http://localhost:9000
    region: us-east-1
    bucket: oldbucket
    accessKeyId: oldkey
    secretAccessKey: oldsecret
    forcePathStyle: true
    presignExpiry: 300
`;
    fs.writeFileSync(configPath, s3Config, 'utf-8');
    reloadConfig();

    const token = await getAdminToken('storage-preserve@test.com');
    const res = await request(app)
      .put('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`)
      .send({
        driver: 's3',
        s3: { bucket: 'newbucket' },
      });

    expect(res.status).toBe(200);
    const written = fs.readFileSync(configPath, 'utf-8');
    const yaml = (await import('js-yaml')).load(written) as any;
    expect(yaml.storage.s3.bucket).toBe('newbucket');
    expect(yaml.storage.s3.accessKeyId).toBe('oldkey');
    expect(yaml.storage.s3.secretAccessKey).toBe('oldsecret');
  });

  it('switches back to local', async () => {
    const token = await getAdminToken('storage-back@test.com');
    const res = await request(app)
      .put('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`)
      .send({ driver: 'local', uploadDir: 'data/uploads' });

    expect(res.status).toBe(200);
    expect(res.body.driver).toBe('local');
  });

  it('rejects s3 with missing required fields', async () => {
    const token = await getAdminToken('storage-missing@test.com');
    const res = await request(app)
      .put('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`)
      .send({ driver: 's3', s3: { endpoint: 'http://localhost:9000' } });

    expect(res.status).toBe(400);
  });
});
