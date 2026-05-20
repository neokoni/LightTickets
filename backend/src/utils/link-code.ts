import crypto from 'crypto';

export function generateLinkCode(): string {
  return crypto.randomInt(100000, 999999).toString();
}
