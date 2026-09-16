import assert from 'node:assert/strict';
import test from 'node:test';

import { parseTemplateOption } from './src/utils/template-options.ts';

test('parseTemplateOption separates display labels from submitted values', () => {
  assert.deepEqual(parseTemplateOption('Bot权|bukkit.command.bot'), {
    label: 'Bot权',
    value: 'bukkit.command.bot',
  });
  assert.deepEqual(parseTemplateOption('Plain'), { label: 'Plain', value: 'Plain' });
  assert.deepEqual(parseTemplateOption('a|b|c'), { label: 'a', value: 'b|c' });
  assert.deepEqual(parseTemplateOption('|x'), { label: '', value: 'x' });
  assert.deepEqual(parseTemplateOption('x|'), { label: 'x', value: '' });
  assert.deepEqual(parseTemplateOption({ label: 'Object|object.value' }), {
    label: 'Object',
    value: 'object.value',
  });
});

test('parseTemplateOption handles malformed options without throwing', () => {
  assert.deepEqual(parseTemplateOption(1), { label: '', value: '' });
  assert.deepEqual(parseTemplateOption({}), { label: '', value: '' });
  assert.deepEqual(parseTemplateOption(null), { label: '', value: '' });
});
