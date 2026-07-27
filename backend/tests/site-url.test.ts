import { describe, expect, it } from 'vitest';
import { siteUrlInputSchema, siteUrlSchema } from '../src/schemas/site.js';
import { normalizeSiteUrl, resolvePasswordResetOrigin } from '../src/utils/site-url.js';

describe('normalizeSiteUrl', () => {
  it.each([
    ['https://tickets.example.com', 'https://tickets.example.com'],
    [' https://tickets.example.com/ ', 'https://tickets.example.com'],
    ['https://tickets.example.com:443/', 'https://tickets.example.com'],
    ['https://tickets.example.com:8443/', 'https://tickets.example.com:8443'],
    ['http://localhost:23310/', 'http://localhost:23310'],
  ])('normalizes the safe site origin %s', (input, expected) => {
    expect(normalizeSiteUrl(input)).toBe(expected);
    expect(siteUrlSchema.safeParse(input).success).toBe(true);
  });

  it('allows only HTTPS origins for password reset links', () => {
    expect(resolvePasswordResetOrigin('https://tickets.example.com/')).toBe(
      'https://tickets.example.com',
    );
    expect(resolvePasswordResetOrigin('http://tickets.example.com')).toBeNull();
    expect(resolvePasswordResetOrigin('http://localhost:23310')).toBeNull();
  });

  it('keeps an empty input compatible as an unset site URL', () => {
    expect(siteUrlInputSchema.parse('')).toBe('');
    expect(siteUrlInputSchema.parse('   ')).toBe('');
    expect(siteUrlSchema.safeParse('').success).toBe(false);
  });

  it.each([
    null,
    undefined,
    '',
    'not-a-url',
    'https://user:password@tickets.example.com',
    'https://tickets.example.com/path',
    'https://tickets.example.com/?query=value',
    'https://tickets.example.com/#fragment',
    'javascript:alert(1)',
  ])('rejects an unsafe or missing site URL: %s', (input) => {
    expect(normalizeSiteUrl(input)).toBeNull();
    if (typeof input === 'string') {
      expect(siteUrlSchema.safeParse(input).success).toBe(false);
    }
  });
});
