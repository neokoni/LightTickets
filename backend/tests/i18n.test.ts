import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import { createApp } from '../src/app.js';
import { dataPath } from '../src/paths.js';

const app = createApp();

beforeEach(() => {
  fs.rmSync(dataPath('locales'), { recursive: true, force: true });
});

describe('GET /api/i18n/languages', () => {
  it('lists internal languages', async () => {
    const res = await request(app).get('/api/i18n/languages');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: 'zh-CN',
          displayName: '简体中文',
          source: 'internal',
        }),
        expect.objectContaining({
          id: 'en-US',
          displayName: 'English',
          source: 'internal',
        }),
      ]),
    );
  });

  it('lists custom languages from data/locales', async () => {
    fs.mkdirSync(dataPath('locales'), { recursive: true });
    fs.writeFileSync(
      dataPath('locales/en-US.json'),
      JSON.stringify({
        manifest: { displayName: 'English', nativeName: 'English', direction: 'ltr' },
        messages: { 'common.save': 'Save' },
      }),
      'utf-8',
    );

    const res = await request(app).get('/api/i18n/languages');

    expect(res.status).toBe(200);
    expect(res.body.data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ id: 'en-US', displayName: 'English', source: 'custom' }),
      ]),
    );
  });
});

describe('GET /api/i18n/languages/:id', () => {
  it('returns bundled English messages', async () => {
    const res = await request(app).get('/api/i18n/languages/en-US');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('en-US');
    expect(res.body.data.properties.displayName).toBe('English');
    expect(res.body.data.messages['common.save']).toBe('Save');
  });

  it('returns merged custom messages with zh-CN fallback', async () => {
    fs.mkdirSync(dataPath('locales'), { recursive: true });
    fs.writeFileSync(
      dataPath('locales/test-Lang.json'),
      JSON.stringify({
        manifest: { displayName: 'Test Language' },
        messages: { 'common.save': 'Save' },
      }),
      'utf-8',
    );

    const res = await request(app).get('/api/i18n/languages/test-Lang');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('test-Lang');
    expect(res.body.data.messages['common.save']).toBe('Save');
    expect(res.body.data.messages['common.cancel']).toBe('取消');
  });

  it('falls back to zh-CN for missing language', async () => {
    const res = await request(app).get('/api/i18n/languages/missing');

    expect(res.status).toBe(200);
    expect(res.body.data.id).toBe('zh-CN');
    expect(res.body.data.properties.displayName).toBe('简体中文');
  });
});
