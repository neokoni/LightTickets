import { describe, expect, it } from 'vitest';
import {
  decryptFederatedAuth,
  encryptFederatedAuth,
} from '../src/services/federatedauth-crypto.service.js';

describe('FederatedAuth encryption', () => {
  it('encrypts with randomized authenticated encryption', () => {
    const first = encryptFederatedAuth('client-secret');
    const second = encryptFederatedAuth('client-secret');
    expect(first).not.toBe(second);
    expect(decryptFederatedAuth(first)).toBe('client-secret');
    expect(decryptFederatedAuth(second)).toBe('client-secret');
  });

  it('rejects tampered ciphertext', () => {
    const encrypted = encryptFederatedAuth('client-secret');
    const parts = encrypted.split('.');
    const ciphertext = Buffer.from(parts[3], 'base64url');
    ciphertext[0] ^= 1;
    parts[3] = ciphertext.toString('base64url');
    expect(() => decryptFederatedAuth(parts.join('.'))).toThrow();
  });
});
