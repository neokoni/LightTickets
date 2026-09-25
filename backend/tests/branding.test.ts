import { describe, it, expect, beforeEach, afterAll } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import { createApp } from '../src/app.js';
import { dataPath } from '../src/paths.js';
import { prisma } from './setup.js';
import {
  BRANDING_EXTENSIONS,
  BRANDING_MIME_BY_EXTENSION,
  BRANDING_MIME_TYPES,
  BRANDING_EXTENSION_BY_MIME,
  BRANDING_SLOTS,
} from '../src/constants/branding.js';
import { UPLOAD_TYPE_BY_MIME } from '../src/constants/upload.js';

const app = createApp();

const PNG_1x1 = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
  'base64',
);
const SVG_LOGO = Buffer.from(
  '<?xml version="1.0"?><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><rect width="16" height="16"/></svg>',
  'utf-8',
);
const SVG_WITH_SCRIPT = Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>',
  'utf-8',
);

function clearBrandingFiles(): void {
  for (const slot of BRANDING_SLOTS) {
    for (const extension of BRANDING_EXTENSIONS) {
      const filePath = dataPath(`${slot}.${extension}`);
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
    }
  }
}

async function getAdminToken(email = 'branding-admin@test.com'): Promise<string> {
  await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  const user = await prisma().user.findUnique({ where: { email } });
  if (user) await prisma().user.update({ where: { id: user.id }, data: { role: 'admin' } });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: email, password: 'Password123!' });
  return loginRes.body.data.accessToken;
}

async function getPlayerToken(email = 'branding-player@test.com'): Promise<string> {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  return res.body.data.accessToken;
}

beforeEach(() => {
  clearBrandingFiles();
});

afterAll(() => {
  clearBrandingFiles();
});

describe('GET /api/branding/{slot}', () => {
  it('returns 404 when no custom file exists', async () => {
    const res = await request(app).get('/api/branding/favicon');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });

  it('rejects unknown slots', async () => {
    const res = await request(app).get('/api/branding/brand');
    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('serves the uploaded file with its content type and revalidation caching', async () => {
    const token = await getAdminToken();
    await request(app)
      .put('/api/branding/favicon')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, { filename: 'favicon.png', contentType: 'image/png' });

    const res = await request(app).get('/api/branding/favicon');
    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toContain('image/png');
    expect(res.headers['cache-control']).toContain('must-revalidate');
    expect(Buffer.from(res.body).equals(PNG_1x1)).toBe(true);
  });
});

describe('PUT /api/branding/{slot}', () => {
  it('requires authentication and admin role', async () => {
    const anonymous = await request(app)
      .put('/api/branding/favicon')
      .attach('file', PNG_1x1, { filename: 'favicon.png', contentType: 'image/png' });
    expect(anonymous.status).toBe(401);

    const playerToken = await getPlayerToken();
    const player = await request(app)
      .put('/api/branding/favicon')
      .set('Authorization', `Bearer ${playerToken}`)
      .attach('file', PNG_1x1, { filename: 'favicon.png', contentType: 'image/png' });
    expect(player.status).toBe(403);
    expect(fs.existsSync(dataPath('favicon.png'))).toBe(false);
  });

  it('stores the file under the fixed name and reports its versioned url', async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .put('/api/branding/logo')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, { filename: 'brand.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.data.logoUrl).toMatch(/^\/api\/branding\/logo\?v=\d+$/);
    expect(res.body.data.faviconUrl).toBeNull();
    expect(fs.existsSync(dataPath('logo.png'))).toBe(true);
  });

  it('rejects a missing file', async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .put('/api/branding/favicon')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(400);
  });

  it('rejects content that does not match the declared type', async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .put('/api/branding/favicon')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('MZ'), { filename: 'evil.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(fs.existsSync(dataPath('favicon.png'))).toBe(false);
  });

  it('rejects mime types outside the branding whitelist', async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .put('/api/branding/favicon')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', Buffer.from('hello'), {
        filename: 'note.txt',
        contentType: 'text/plain',
      });
    expect(res.status).toBe(400);
  });

  it('rejects oversized files', async () => {
    const token = await getAdminToken();
    const oversized = Buffer.alloc(2 * 1024 * 1024 + 1, 0x41);
    const res = await request(app)
      .put('/api/branding/logo')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', oversized, { filename: 'logo.png', contentType: 'image/png' });
    expect(res.status).toBe(400);
    expect(fs.existsSync(dataPath('logo.png'))).toBe(false);
  });

  it('accepts svg logos without script content', async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .put('/api/branding/logo')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', SVG_LOGO, { filename: 'logo.svg', contentType: 'image/svg+xml' });

    expect(res.status).toBe(200);
    expect(res.body.data.logoUrl).toContain('/api/branding/logo?v=');

    const served = await request(app).get('/api/branding/logo');
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain('image/svg+xml');
    expect(served.headers['content-security-policy']).toContain('sandbox');
  });

  it('rejects svg logos containing script content', async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .put('/api/branding/logo')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', SVG_WITH_SCRIPT, { filename: 'logo.svg', contentType: 'image/svg+xml' });
    expect(res.status).toBe(400);
    expect(fs.existsSync(dataPath('logo.svg'))).toBe(false);
  });

  it('keeps only the newest file when the format changes', async () => {
    const token = await getAdminToken();
    await request(app)
      .put('/api/branding/favicon')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, { filename: 'favicon.png', contentType: 'image/png' });
    await request(app)
      .put('/api/branding/favicon')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', SVG_LOGO, { filename: 'favicon.svg', contentType: 'image/svg+xml' });

    expect(fs.existsSync(dataPath('favicon.png'))).toBe(false);
    expect(fs.existsSync(dataPath('favicon.svg'))).toBe(true);
  });
});

describe('DELETE /api/branding/{slot}', () => {
  it('removes the custom file and falls back to the built-in default', async () => {
    const token = await getAdminToken();
    await request(app)
      .put('/api/branding/favicon')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, { filename: 'favicon.png', contentType: 'image/png' });
    await request(app)
      .put('/api/branding/logo')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, { filename: 'logo.png', contentType: 'image/png' });

    const res = await request(app)
      .delete('/api/branding/favicon')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.faviconUrl).toBeNull();
    expect(res.body.data.logoUrl).toContain('/api/branding/logo?v=');
    expect(fs.existsSync(dataPath('favicon.png'))).toBe(false);
    expect(fs.existsSync(dataPath('logo.png'))).toBe(true);

    const gone = await request(app).get('/api/branding/favicon');
    expect(gone.status).toBe(404);
  });

  it('requires admin role', async () => {
    const token = await getPlayerToken();
    const res = await request(app)
      .delete('/api/branding/logo')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(403);
  });
});

describe('dark branding variants', () => {
  it('stores and serves dark variants under their own fixed names', async () => {
    const token = await getAdminToken();
    const res = await request(app)
      .put('/api/branding/favicon-dark')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, { filename: 'favicon-dark.png', contentType: 'image/png' });

    expect(res.status).toBe(200);
    expect(res.body.data.faviconDarkUrl).toMatch(/^\/api\/branding\/favicon-dark\?v=\d+$/);
    expect(res.body.data.faviconUrl).toBeNull();
    expect(fs.existsSync(dataPath('favicon-dark.png'))).toBe(true);

    const served = await request(app).get('/api/branding/favicon-dark');
    expect(served.status).toBe(200);
    expect(served.headers['content-type']).toContain('image/png');
    expect(Buffer.from(served.body).equals(PNG_1x1)).toBe(true);

    const light = await request(app).get('/api/branding/favicon');
    expect(light.status).toBe(404);
  });

  it('deletes a dark variant without touching the light one', async () => {
    const token = await getAdminToken();
    await request(app)
      .put('/api/branding/logo')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, { filename: 'logo.png', contentType: 'image/png' });
    await request(app)
      .put('/api/branding/logo-dark')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, { filename: 'logo-dark.png', contentType: 'image/png' });

    const res = await request(app)
      .delete('/api/branding/logo-dark')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.logoDarkUrl).toBeNull();
    expect(res.body.data.logoUrl).toContain('/api/branding/logo?v=');
    expect(fs.existsSync(dataPath('logo-dark.png'))).toBe(false);
    expect(fs.existsSync(dataPath('logo.png'))).toBe(true);

    const gone = await request(app).get('/api/branding/logo-dark');
    expect(gone.status).toBe(404);
  });
});

describe('branding urls in site config', () => {
  it('exposes light and dark branding urls on the public site config', async () => {
    const token = await getAdminToken();
    await request(app)
      .put('/api/branding/favicon')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, { filename: 'favicon.png', contentType: 'image/png' });
    await request(app)
      .put('/api/branding/logo-dark')
      .set('Authorization', `Bearer ${token}`)
      .attach('file', PNG_1x1, { filename: 'logo-dark.png', contentType: 'image/png' });

    const res = await request(app).get('/api/setup/site-config');
    expect(res.status).toBe(200);
    expect(res.body.data.faviconUrl).toMatch(/^\/api\/branding\/favicon\?v=\d+$/);
    expect(res.body.data.faviconDarkUrl).toBeNull();
    expect(res.body.data.logoUrl).toBeNull();
    expect(res.body.data.logoDarkUrl).toMatch(/^\/api\/branding\/logo-dark\?v=\d+$/);
  });
});

describe('branding constants', () => {
  it('keeps raster branding mime types in sync with the shared upload whitelist', () => {
    for (const mimeType of BRANDING_MIME_TYPES) {
      if (mimeType === 'image/svg+xml') continue;
      expect(UPLOAD_TYPE_BY_MIME.has(mimeType)).toBe(true);
    }
  });

  it('maps every mime type to a unique extension and probes them in a fixed order', () => {
    const extensions = Object.values(BRANDING_EXTENSION_BY_MIME);
    expect(new Set(extensions).size).toBe(extensions.length);
    expect(extensions.every((extension) => extension === extension.toLowerCase())).toBe(true);
    expect(BRANDING_EXTENSIONS).toEqual([...extensions]);
    expect(Object.keys(BRANDING_MIME_BY_EXTENSION).sort()).toEqual([...extensions].sort());
  });
});
