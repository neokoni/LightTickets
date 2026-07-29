import { describe, expect, it } from 'vitest';
import { resolveSocketServerKey } from '../src/utils/socket-auth.js';

describe('socket server authentication', () => {
  it('accepts a non-empty server key from the auth payload', () => {
    expect(resolveSocketServerKey({ auth: { serverKey: 'lt_socket-test-key' } })).toBe(
      'lt_socket-test-key',
    );
  });

  it('does not fall back to query parameters or headers', () => {
    const handshake = {
      auth: {},
      query: { serverKey: 'query-secret' },
      headers: { 'x-server-key': 'header-secret' },
    };

    expect(resolveSocketServerKey(handshake)).toBeUndefined();
  });

  it.each([undefined, null, '', ['lt_array-key'], { value: 'lt_object-key' }, 123, true])(
    'rejects a non-string or empty server key: %j',
    (serverKey) => {
      expect(resolveSocketServerKey({ auth: { serverKey } })).toBeUndefined();
    },
  );

  it('rejects server keys longer than the limit', () => {
    expect(resolveSocketServerKey({ auth: { serverKey: 'a'.repeat(128) } })).toHaveLength(128);
    expect(resolveSocketServerKey({ auth: { serverKey: 'a'.repeat(129) } })).toBeUndefined();
  });

  it.each([undefined, null, 'serverKey', [], 123])(
    'rejects a malformed auth payload: %j',
    (auth) => {
      expect(resolveSocketServerKey({ auth })).toBeUndefined();
    },
  );
});
