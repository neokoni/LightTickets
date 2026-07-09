import fs from 'fs';
import path from 'path';
import yaml from 'js-yaml';
import { describe, expect, it } from 'vitest';
import {
  evaluateTemplateCondition,
  resolveHooks,
  renderBody,
  type TemplateDefinition,
} from '../src/services/template.service.js';

describe('template if syntax', () => {
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
});
