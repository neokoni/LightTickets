import assert from 'node:assert/strict';
import test from 'node:test';

import { safeReturnTo } from './src/utils/returnTo.ts';

test('safeReturnTo preserves internal paths', () => {
  assert.equal(safeReturnTo('/'), '/');
  assert.equal(
    safeReturnTo('/tickets/42?tab=activity#comment-1'),
    '/tickets/42?tab=activity#comment-1',
  );
  assert.equal(safeReturnTo('  /profile?section=account  '), '/profile?section=account');
});

test('safeReturnTo rejects external and malformed paths', () => {
  for (const value of [
    undefined,
    null,
    '',
    'https://attacker.example/path',
    '//attacker.example/path',
    '/\\attacker.example/path',
    'javascript:alert(1)',
  ]) {
    assert.equal(safeReturnTo(value), '/');
  }
});
