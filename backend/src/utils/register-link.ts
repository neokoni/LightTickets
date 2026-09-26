import crypto from 'crypto';

export function generateRegisterToken(): string {
  return crypto.randomBytes(24).toString('base64url');
}
