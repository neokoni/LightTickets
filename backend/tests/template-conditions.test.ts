import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  evaluateTemplateCondition,
  createHookVariables,
  resolveHookActions,
  resolveHookPlaceholders,
  resolveHooks,
  resolveSelectionHooks,
  renderBody,
  validateAndNormalizeFormData,
  type TemplateDefinition,
} from '../src/services/template.service.js';

describe('template if syntax', () => {
  it('normalizes only declared fields and validates template options', () => {
    const def = yaml.load(`
name: Validation Test
description: Validation test
labels: []
body:
  - type: dropdown
    id: priority
    validations: { required: true }
    attributes:
      label: Priority
      options: [low, high]
  - type: checkboxes
    id: confirmations
    attributes:
      label: Confirmations
      options:
        - label: Rules accepted
          required: true
        - Updates accepted
completion_hooks: []
`) as TemplateDefinition;

    expect(
      validateAndNormalizeFormData(def, {
        priority: 'high',
        confirmations: 'Rules accepted,Updates accepted,Rules accepted',
      }),
    ).toEqual({
      priority: 'high',
      confirmations: 'Rules accepted,Updates accepted',
    });
    expect(() =>
      validateAndNormalizeFormData(def, { priority: 'root', confirmations: 'Rules accepted' }),
    ).toThrow('Priority 包含无效选项');
    expect(() => validateAndNormalizeFormData(def, { confirmations: 'Rules accepted' })).toThrow(
      'Priority 为必填项',
    );
    expect(() =>
      validateAndNormalizeFormData(def, { priority: 'high', confirmations: 'Updates accepted' }),
    ).toThrow('Confirmations 缺少必选项');
    expect(() =>
      validateAndNormalizeFormData(def, {
        priority: 'high',
        confirmations: 'Rules accepted,Injected option',
      }),
    ).toThrow('Confirmations 包含无效选项');
    expect(() =>
      validateAndNormalizeFormData(def, {
        priority: 'high',
        confirmations: 'Rules accepted',
        marker: 'injected',
      }),
    ).toThrow('提交内容包含未知字段');
  });

  it('accepts preset and custom values for select_input fields', () => {
    const def = yaml.load(`
name: Select Input Test
description: Select input test
labels: []
body:
  - type: select_input
    id: platform
    validations: { required: true }
    attributes:
      label: Platform
      options: [Paper, Fabric]
completion_hooks: []
`) as TemplateDefinition;

    expect(validateAndNormalizeFormData(def, { platform: 'Paper' })).toEqual({
      platform: 'Paper',
    });
    expect(validateAndNormalizeFormData(def, { platform: 'Custom server' })).toEqual({
      platform: 'Custom server',
    });
    expect(renderBody(def, { platform: 'Custom server' })).toBe('**Platform:** Custom server');
    expect(() => validateAndNormalizeFormData(def, { platform: '' })).toThrow('Platform 为必填项');
  });

  it('evaluates supported comparison operators', () => {
    const variables = {
      ticket_id: '42',
      ticket_title: '[Bug] Save button fails',
      player_name: 'Notch',
      player_uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
      'field.category': 'bug',
      'field.priority': '4',
      priority: '4',
      version: '1.20',
    };

    expect(evaluateTemplateCondition('{field.category}==bug', variables)).toBe(true);
    expect(evaluateTemplateCondition('{field.category}!=question', variables)).toBe(true);
    expect(evaluateTemplateCondition('{field.priority}<5', variables)).toBe(true);
    expect(evaluateTemplateCondition('{field.priority}<=4', variables)).toBe(true);
    expect(evaluateTemplateCondition('{field.priority}>3', variables)).toBe(true);
    expect(evaluateTemplateCondition('{field.priority}>=4', variables)).toBe(true);
    expect(evaluateTemplateCondition('{ticket_id}>0', variables)).toBe(true);
    expect(evaluateTemplateCondition('{ticket_title}=="[Bug] Save button fails"', variables)).toBe(
      true,
    );
    expect(evaluateTemplateCondition('{player_name}=="Notch"', variables)).toBe(true);
    expect(evaluateTemplateCondition('{player_uuid}!="unknown"', variables)).toBe(true);
    expect(evaluateTemplateCondition('version=="1.20"', variables)).toBe(true);
  });

  it('does not apply if syntax to body fields', () => {
    const def = yaml.load(`
name: Condition Test
description: Condition rendering test
labels: []
completion_hooks: []
body:
  - type: input
    id: category
    attributes:
      label: Category
  - type: textarea
    id: reproduction
    if: "{field.category}==feature"
    attributes:
      label: Reproduction
`) as TemplateDefinition;

    const body = renderBody(def, {
      category: 'bug',
      priority: '4',
      reproduction: 'Open the menu and click Save.',
    });

    expect(body).toContain('**Category:** bug');
    expect(body).toContain('**Reproduction:**');
    expect(body).toContain('Open the menu and click Save.');
  });

  it('filters completion hooks with full_example.yml conditional branches', () => {
    const raw = fs.readFileSync(path.resolve('templates/full_example.yml'), 'utf-8');
    const def = yaml.load(raw) as TemplateDefinition;
    const hooks = resolveHooks(def, 'closed', {
      ticket_id: '42',
      ticket_title: '[示例] 保存失败',
      player_name: 'Notch',
      player_uuid: '069a79f4-44e9-4726-a5be-fca90e38aaf5',
      'field.category': 'bug',
      'field.priority': '4',
    });

    expect(def.name).toBe('完整语法示例');
    expect(hooks).toEqual([
      {
        type: 'minimessage',
        content: '<color:#ffffff>Bug 议题 <color:#96bfff>#{ticket_id}</color> 已关闭</color>',
      },
      {
        type: 'command',
        content: 'tell {player_name} 你的议题 #{ticket_id} 已按常规优先级关闭',
      },
      {
        type: 'minimessage',
        content: '<color:#ffffff>高优先级议题 #{ticket_id} 已处理完成</color>',
      },
      {
        type: 'command',
        content: 'tell {player_name} 高优先级议题 #{ticket_id} 已关闭',
      },
      {
        type: 'minimessage',
        content:
          '<color:#ffffff>议题 <color:#96bfff>#{ticket_id}</color> 已关闭，标题：{ticket_title}</color>',
      },
    ]);
  });

  it('resolves selection hooks and all configured actions with submitted placeholders', () => {
    const def = yaml.load(`
name: Selection Test
description: Selection hook test
labels: []
body: []
completion_hooks:
  - event: closed
    type: selection
    title: Choose rewards
    fields:
      - type: checkboxes
        id: rewards
        attributes:
          label: Rewards
          options: [Coins, Items]
    actions:
      - type: command
        commands:
          - "say {selection.rewards}"
          - "tell {player_name} done"
      - type: minimessage
        messages:
          - "<green>#{ticket_id}</green>"
`) as TemplateDefinition;
    const variables = createHookVariables({
      id: 42,
      title: 'Reward ticket',
      formData: JSON.stringify({ priority: 'high' }),
      author: { minecraftName: 'Notch' },
    });
    variables['selection.rewards'] = 'Coins,Items';

    const selections = resolveSelectionHooks(def, 'closed', variables);
    expect(selections).toHaveLength(1);
    expect(selections[0].visibility).toBe('staff');
    expect(resolveHooks(def, 'closed', variables)).toEqual([]);
    expect(resolveHookActions(selections[0].actions, variables)).toEqual([
      { type: 'command', content: 'say Coins,Items' },
      { type: 'command', content: 'tell Notch done' },
      { type: 'minimessage', content: '<green>#{ticket_id}</green>' },
    ]);
  });

  it('sanitizes command placeholder values before interpolation', () => {
    const longValue = 'x'.repeat(2_001);
    const resolved = resolveHookPlaceholders('say {ticket_title} {field.body} {field.long}', {
      ticket_title: 'first\nsecond\rthird',
      'field.body': 'hello @a @e[limit=1]',
      'field.long': longValue,
    });

    expect(resolved).toBe(`say first second third hello ＠a ＠e[limit=1] ${'x'.repeat(2_000)}`);
    expect(resolved).not.toMatch(/[\r\n]/);
    expect(resolved).not.toMatch(/(^|\s)@[pares]/);
  });
});
