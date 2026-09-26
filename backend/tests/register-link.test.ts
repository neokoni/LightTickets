import { describe, it, expect } from 'vitest';
import { generateRegisterToken } from '../src/utils/register-link.js';

describe('generateRegisterToken', () => {
  it('generates a URL-safe token of fixed length', () => {
    expect(generateRegisterToken()).toMatch(/^[A-Za-z0-9_-]{32}$/);
  });

  it('does not repeat across calls', () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateRegisterToken()));
    expect(tokens.size).toBe(100);
  });
});
