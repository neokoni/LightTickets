import crypto from 'crypto';

const SERVER_KEY_HASH_PATTERN = /^[a-f0-9]{64}$/;

export function hashServerApiKey(value: string): string {
  return crypto.createHash('sha256').update(value).digest('hex');
}

export function isServerApiKeyHash(value: string): boolean {
  return SERVER_KEY_HASH_PATTERN.test(value);
}
