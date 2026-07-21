import { describe, expect, it } from 'vitest';
import { readJsonPath } from '../src/utils/json-path.js';

describe('readJsonPath', () => {
  it('reads nested object and array values', () => {
    const value = { data: { users: [{ username: 'alice' }] } };
    expect(readJsonPath(value, 'data.users.0.username')).toBe('alice');
  });

  it('returns undefined for missing and unsafe paths', () => {
    expect(readJsonPath({ data: {} }, 'data.username')).toBeUndefined();
    expect(readJsonPath({}, '__proto__.polluted')).toBeUndefined();
    expect(readJsonPath([], 'constructor')).toBeUndefined();
  });
});
