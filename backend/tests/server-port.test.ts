import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { DEFAULT_SERVER_PORT, resolveServerPort } from '../src/server-port.js';

describe('server port', () => {
  const originalServerPort = process.env.LT_SERVER_PORT;
  const originalPort = process.env.PORT;

  beforeEach(() => {
    delete process.env.LT_SERVER_PORT;
    delete process.env.PORT;
  });

  afterEach(() => {
    if (originalServerPort === undefined) delete process.env.LT_SERVER_PORT;
    else process.env.LT_SERVER_PORT = originalServerPort;
    if (originalPort === undefined) delete process.env.PORT;
    else process.env.PORT = originalPort;
  });

  it('uses the new default when no configuration is supplied', () => {
    expect(resolveServerPort()).toBe(DEFAULT_SERVER_PORT);
    expect(DEFAULT_SERVER_PORT).toBe(23_320);
  });

  it('lets LT_SERVER_PORT override the configured port and PORT alias', () => {
    process.env.PORT = '24000';
    process.env.LT_SERVER_PORT = '25000';

    expect(resolveServerPort(23_320)).toBe(25_000);
  });

  it('keeps PORT as a compatibility alias', () => {
    process.env.PORT = '24000';

    expect(resolveServerPort(23_320)).toBe(24_000);
  });

  it('rejects invalid environment ports', () => {
    process.env.LT_SERVER_PORT = '0';

    expect(() => resolveServerPort()).toThrow(/LT_SERVER_PORT/);
  });
});
