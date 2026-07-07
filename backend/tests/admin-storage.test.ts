import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';
import { reinitStorageAdapter } from '../src/services/storage/index.js';

const app = createApp();

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
  return loginRes.body.data.accessToken;
}

async function resetAppConfig() {
  await prisma().appConfig.deleteMany();
  await prisma().appConfig.create({ data: {} });
  reinitStorageAdapter();
}

describe('GET /api/admin/storage', () => {
  beforeEach(resetAppConfig);

  it('returns current local storage config', async () => {
    const token = await getAdminToken('storage-get@test.com');
    const res = await request(app)
      .get('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.driver).toBe('local');
    expect(res.body.data.uploadDir).toBeDefined();
  });

  it('masks secretAccessKey when s3 configured', async () => {
    await prisma().appConfig.update({
      where: { id: (await prisma().appConfig.findFirst())!.id },
      data: {
        storageDriver: 's3',
        s3Config: JSON.stringify({
          endpoint: 'http://localhost:9000',
          region: 'us-east-1',
          bucket: 'test',
          accessKeyId: 'realkey',
          secretAccessKey: 'realsecret',
          forcePathStyle: true,
          presignExpiry: 300,
        }),
      },
    });

    const token = await getAdminToken('storage-mask@test.com');
    const res = await request(app)
      .get('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data.driver).toBe('s3');
    expect(res.body.data.s3.secretAccessKey).toBe('••••••••');
  });

  it('rejects non-admin with 403', async () => {
    const res = await request(app)
      .post('/api/auth/register')
      .send({ email: 'storage-noperm@test.com', password: 'Password123!', username: 'noperm' });
    const token = res.body.data.accessToken;

    const result = await request(app)
      .get('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`);

    expect(result.status).toBe(403);
  });
});

describe('PUT /api/admin/storage', () => {
  beforeEach(resetAppConfig);

  it('switches driver to s3 and persists to DB', async () => {
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
    expect(res.body.data.driver).toBe('s3');

    const config = await prisma().appConfig.findFirst();
    expect(config!.storageDriver).toBe('s3');
    const s3 = JSON.parse(config!.s3Config!);
    expect(s3.bucket).toBe('mybucket');
    expect(s3.presignExpiry).toBe(600);
  });

  it('preserves existing secret when not provided in update', async () => {
    const existing = await prisma().appConfig.findFirst();
    await prisma().appConfig.update({
      where: { id: existing!.id },
      data: {
        storageDriver: 's3',
        s3Config: JSON.stringify({
          endpoint: 'http://localhost:9000',
          region: 'us-east-1',
          bucket: 'oldbucket',
          accessKeyId: 'oldkey',
          secretAccessKey: 'oldsecret',
          forcePathStyle: true,
          presignExpiry: 300,
        }),
      },
    });

    const token = await getAdminToken('storage-preserve@test.com');
    const res = await request(app)
      .put('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`)
      .send({
        driver: 's3',
        s3: { bucket: 'newbucket' },
      });

    expect(res.status).toBe(200);
    const config = await prisma().appConfig.findFirst();
    const s3 = JSON.parse(config!.s3Config!);
    expect(s3.bucket).toBe('newbucket');
    expect(s3.accessKeyId).toBe('oldkey');
    expect(s3.secretAccessKey).toBe('oldsecret');
  });

  it('switches back to local', async () => {
    const token = await getAdminToken('storage-back@test.com');
    const res = await request(app)
      .put('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`)
      .send({ driver: 'local', uploadDir: 'data/uploads' });

    expect(res.status).toBe(200);
    expect(res.body.data.driver).toBe('local');
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
