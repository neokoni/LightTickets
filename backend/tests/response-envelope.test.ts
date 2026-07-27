import { describe, expect, it } from 'vitest';
import express from 'express';
import request from 'supertest';
import { responseEnvelope } from '../src/middleware/response-envelope.js';

function createEnvelopeTestApp() {
  const app = express();
  app.use(responseEnvelope);
  app.get('/business-result', (_req, res) => {
    res.json({ success: false, message: 'connection failed' });
  });
  app.get('/standard-envelope', (_req, res) => {
    res.json({ success: true, data: { value: 1 } });
  });
  app.get('/standard-error', (_req, res) => {
    res.status(400).json({ success: false, statusCode: 400, message: 'bad request' });
  });
  return app;
}

describe('responseEnvelope', () => {
  const app = createEnvelopeTestApp();

  it('wraps business objects that merely contain a success field', async () => {
    const response = await request(app).get('/business-result');

    expect(response.body).toEqual({
      success: true,
      data: { success: false, message: 'connection failed' },
    });
  });

  it('does not double-wrap a strict success envelope', async () => {
    const response = await request(app).get('/standard-envelope');

    expect(response.body).toEqual({ success: true, data: { value: 1 } });
  });

  it('does not double-wrap a strict error envelope', async () => {
    const response = await request(app).get('/standard-error');

    expect(response.status).toBe(400);
    expect(response.body).toEqual({
      success: false,
      statusCode: 400,
      message: 'bad request',
    });
  });
});
