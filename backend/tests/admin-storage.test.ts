import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import { createApp } from '../src/app.js';
import { prisma } from './setup.js';
import { reinitStorageAdapter } from '../src/services/storage/index.js';

const app = createApp();
const S3_CONFIG = {
  endpoint: 'http://localhost:9000',
  region: 'us-east-1',
  bucket: 'test-bucket',
  accessKeyId: 'old-key',
  secretAccessKey: 'old-secret',
  forcePathStyle: true,
  presignExpiry: 300,
};

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

  it('preserves the s3 secret when masked config is submitted unchanged', async () => {
    const existing = await prisma().appConfig.findFirstOrThrow();
    await prisma().appConfig.update({
      where: { id: existing.id },
      data: { storageDriver: 's3', s3Config: JSON.stringify(S3_CONFIG) },
    });
    const token = await getAdminToken('storage-masked-secret@test.com');

    const getRes = await request(app)
      .get('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`);
    expect(getRes.status).toBe(200);
    expect(getRes.body.data.s3.secretAccessKey).toBe('••••••••');

    const putRes = await request(app)
      .put('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`)
      .send(getRes.body.data);

    expect(putRes.status).toBe(200);
    const config = await prisma().appConfig.findFirstOrThrow();
    expect(JSON.parse(config.s3Config!).secretAccessKey).toBe(S3_CONFIG.secretAccessKey);
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

  it('preserves s3 config when switching back to local', async () => {
    const existing = await prisma().appConfig.findFirstOrThrow();
    await prisma().appConfig.update({
      where: { id: existing.id },
      data: { storageDriver: 's3', s3Config: JSON.stringify(S3_CONFIG) },
    });
    const token = await getAdminToken('storage-retain-s3@test.com');

    const res = await request(app)
      .put('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`)
      .send({ driver: 'local', uploadDir: 'data/uploads' });

    expect(res.status).toBe(200);
    expect(res.body.data.s3.secretAccessKey).toBe('••••••••');
    const config = await prisma().appConfig.findFirstOrThrow();
    expect(JSON.parse(config.s3Config!)).toEqual(S3_CONFIG);
  });

  it('rejects changing the local upload directory while local attachments exist', async () => {
    const token = await getAdminToken('storage-local-location@test.com');
    const user = await prisma().user.findUniqueOrThrow({
      where: { email: 'storage-local-location@test.com' },
    });
    await prisma().attachment.create({
      data: {
        filename: 'local.txt',
        path: 'local-key',
        mimeType: 'text/plain',
        size: 5,
        storageType: 'local',
        uploadedBy: user.id,
      },
    });

    const res = await request(app)
      .put('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`)
      .send({ driver: 'local', uploadDir: 'data/other-uploads' });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('不能修改上传目录');
    expect((await prisma().appConfig.findFirstOrThrow()).uploadDir).toBe('data/uploads');
  });

  it('rejects changing the s3 location while s3 attachments exist', async () => {
    const existing = await prisma().appConfig.findFirstOrThrow();
    await prisma().appConfig.update({
      where: { id: existing.id },
      data: { storageDriver: 's3', s3Config: JSON.stringify(S3_CONFIG) },
    });
    const token = await getAdminToken('storage-s3-location@test.com');
    const user = await prisma().user.findUniqueOrThrow({
      where: { email: 'storage-s3-location@test.com' },
    });
    await prisma().attachment.create({
      data: {
        filename: 's3.txt',
        path: 's3-key',
        mimeType: 'text/plain',
        size: 5,
        storageType: 's3',
        uploadedBy: user.id,
      },
    });

    const res = await request(app)
      .put('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`)
      .send({ driver: 's3', s3: { bucket: 'other-bucket' } });

    expect(res.status).toBe(409);
    expect(res.body.message).toContain('不能修改存储位置');
    const config = await prisma().appConfig.findFirstOrThrow();
    expect(JSON.parse(config.s3Config!).bucket).toBe(S3_CONFIG.bucket);
  });

  it('allows rotating s3 credentials and presign expiry with existing attachments', async () => {
    const existing = await prisma().appConfig.findFirstOrThrow();
    await prisma().appConfig.update({
      where: { id: existing.id },
      data: { storageDriver: 's3', s3Config: JSON.stringify(S3_CONFIG) },
    });
    const token = await getAdminToken('storage-s3-credentials@test.com');
    const user = await prisma().user.findUniqueOrThrow({
      where: { email: 'storage-s3-credentials@test.com' },
    });
    await prisma().attachment.create({
      data: {
        filename: 's3.txt',
        path: 's3-key',
        mimeType: 'text/plain',
        size: 5,
        storageType: 's3',
        uploadedBy: user.id,
      },
    });

    const res = await request(app)
      .put('/api/admin/storage')
      .set('Authorization', `Bearer ${token}`)
      .send({
        driver: 's3',
        s3: {
          accessKeyId: 'new-key',
          secretAccessKey: 'new-secret',
          presignExpiry: 600,
        },
      });

    expect(res.status).toBe(200);
    const config = await prisma().appConfig.findFirstOrThrow();
    expect(JSON.parse(config.s3Config!)).toEqual({
      ...S3_CONFIG,
      accessKeyId: 'new-key',
      secretAccessKey: 'new-secret',
      presignExpiry: 600,
    });
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

describe('POST /api/admin/storage/test', () => {
  beforeEach(resetAppConfig);

  it('returns a standard error envelope when S3 is not configured', async () => {
    const token = await getAdminToken('storage-test-unconfigured@test.com');
    const res = await request(app)
      .post('/api/admin/storage/test')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(400);
    expect(res.body).toEqual({
      success: false,
      statusCode: 400,
      message: '尚未配置 S3 存储后端',
    });
  });
});
