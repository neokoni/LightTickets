import { describe, it, expect, afterEach, vi } from 'vitest';
import request from 'supertest';
import fs from 'fs';
import path from 'path';
import { createApp } from '../src/app.js';
import { dataPath } from '../src/paths.js';
import { prisma, serverData } from './setup.js';
import * as templateService from '../src/services/template.service.js';

const app = createApp({ enableInitialSetup: true });

const templatesDir = dataPath('templates');
const testTemplateNames = [
  'custom_test',
  'dup_tmpl',
  'missing_id_tmpl',
  'id_fallback_tmpl',
  'patch_tmpl',
  'delete_tmpl',
  'labeled_tmpl',
  'invalid_dropdown_tmpl',
  'invalid_selection_hook_tmpl_1',
  'invalid_selection_hook_tmpl_2',
  'invalid_selection_hook_tmpl_3',
  'invalid_selection_hook_tmpl_4',
  'invalid_selection_hook_tmpl_5',
  'invalid_selection_hook_tmpl_6',
  'invalid_selection_source_tmpl',
  'legacy_invalid_options_tmpl',
  'unknown_field_type_tmpl',
  'ambiguous_dropdown_tmpl',
  'assignee_store_tmpl',
  'assignee_reject_tmpl',
  'assignee_clear_tmpl',
  'assignee_source_tmpl',
  'assignee_public_tmpl',
];

afterEach(() => {
  for (const name of testTemplateNames) {
    const filePath = path.join(templatesDir, `${name}.yml`);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
});

async function setupAndGetAdmin() {
  await request(app)
    .post('/api/setup')
    .send({
      db: { provider: 'sqlite' },
      admin: { email: 'admin@tmpl.test', password: 'admin123', username: 'tmpladmin' },
    });
  const loginRes = await request(app)
    .post('/api/auth/login')
    .send({ emailOrUsername: 'admin@tmpl.test', password: 'admin123' });
  return loginRes.body.data.accessToken;
}

async function createUserAndGetToken(email = 'user@test.com') {
  const res = await request(app)
    .post('/api/auth/register')
    .send({ email, password: 'Password123!', username: email.split('@')[0] });
  return res.body.data.accessToken;
}

describe('GET /api/templates', () => {
  it('returns list of enabled templates', async () => {
    const token = await setupAndGetAdmin();

    const res = await request(app).get('/api/templates').set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);

    const tmpl = res.body.data[0];
    expect(tmpl).toHaveProperty('name');
    expect(tmpl).toHaveProperty('name_i18n');
    expect(tmpl).toHaveProperty('description');
    expect(tmpl).toHaveProperty('labels');
  });

  it('rejects unauthenticated requests', async () => {
    const list = await request(app).get('/api/templates');
    const detail = await request(app).get('/api/templates/bug_report');

    expect(list.status).toBe(401);
    expect(detail.status).toBe(401);
  });

  it('accepts a valid server key without a body serverId', async () => {
    await setupAndGetAdmin();
    await prisma().server.create({ data: serverData('tmpl-srv', 'tmpl-srv-key') });

    const list = await request(app).get('/api/templates').set('X-Server-Key', 'tmpl-srv-key');
    const detail = await request(app)
      .get('/api/templates/bug_report')
      .set('X-Server-Key', 'tmpl-srv-key');

    expect(list.status).toBe(200);
    expect(detail.status).toBe(200);
  });

  it('rejects an invalid server key', async () => {
    const res = await request(app).get('/api/templates').set('X-Server-Key', 'wrong-key');

    expect(res.status).toBe(401);
  });
});

describe('GET /api/templates/:name', () => {
  it('returns a specific template by name', async () => {
    const token = await setupAndGetAdmin();

    const res = await request(app)
      .get('/api/templates/bug_report')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data.name).toBeDefined();
    expect(res.body.data.description).toBeDefined();
    expect(res.body.data.body).toBeInstanceOf(Array);
    expect(res.body.data.title_prefix).toBe('[Bug]');
  });

  it('returns 404 for nonexistent template', async () => {
    const token = await setupAndGetAdmin();

    const res = await request(app)
      .get('/api/templates/nonexistent')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(404);
  });
});

describe('GET /api/admin/templates', () => {
  it('returns all templates for admin', async () => {
    const token = await setupAndGetAdmin();

    const res = await request(app)
      .get('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toBeInstanceOf(Array);
    expect(res.body.data.length).toBeGreaterThanOrEqual(1);
  });

  it('rejects non-admin user', async () => {
    await setupAndGetAdmin();
    const userToken = await createUserAndGetToken('nonadmin@tmpl.test');

    const res = await request(app)
      .get('/api/admin/templates')
      .set('Authorization', `Bearer ${userToken}`);

    expect(res.status).toBe(403);
  });

  it('loads legacy choice options without making the template unrepairable', async () => {
    await setupAndGetAdmin();
    const name = 'legacy_invalid_options_tmpl';
    const filePath = path.join(templatesDir, `${name}.yml`);
    const source = [
      'name: Legacy invalid options',
      'description: Historical choice options',
      'body:',
      '  - type: dropdown',
      '    id: permission',
      '    attributes:',
      '      label: Permission',
      '      options: ["v", "v"]',
      'completion_hooks:',
      '  - event: closed',
      '    type: selection',
      '    title: Pick',
      '    fields:',
      '      - type: dropdown',
      '        id: choice',
      '        attributes:',
      '          label: Choice',
      '          options: ["|x", 1]',
      '    actions:',
      '      - type: command',
      '        commands: ["say done"]',
      '',
    ].join('\n');

    fs.writeFileSync(filePath, source, 'utf-8');
    try {
      await templateService.initTemplates();
      const template = await templateService.adminGet(name);
      expect(template.name).toBe(name);
      expect(template.source).toContain('options: ["v", "v"]');
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await templateService.initTemplates();
    }
  });

  it('warns about ambiguous dropdown options while still loading the template', async () => {
    await setupAndGetAdmin();
    const name = 'ambiguous_dropdown_tmpl';
    const filePath = path.join(templatesDir, `${name}.yml`);
    const source = [
      'name: Ambiguous dropdown',
      'description: Duplicate option values',
      'body:',
      '  - type: dropdown',
      '    id: choice',
      '    attributes:',
      '      label: Choice',
      '      options: ["Yes|1", "No|1"]',
      '',
    ].join('\n');

    fs.writeFileSync(filePath, source, 'utf-8');
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    try {
      await templateService.initTemplates();
      const template = await templateService.adminGet(name);
      expect(template.name).toBe(name);
      expect(warn.mock.calls.some((call) => String(call[0]).includes(name))).toBe(true);
    } finally {
      warn.mockRestore();
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await templateService.initTemplates();
    }
  });

  it('loads templates with an unknown field type instead of dropping them', async () => {
    await setupAndGetAdmin();
    const name = 'unknown_field_type_tmpl';
    const filePath = path.join(templatesDir, `${name}.yml`);
    const source = [
      'name: Unknown field type',
      'description: Legacy or typo field type',
      'body:',
      '  - type: inputt',
      '    id: legacy',
      '    attributes:',
      '      label: Legacy',
      '',
    ].join('\n');

    fs.writeFileSync(filePath, source, 'utf-8');
    try {
      await templateService.initTemplates();
      const template = await templateService.adminGet(name);
      expect(template.name).toBe(name);

      // Writing an unknown field type through the service is still rejected.
      await expect(
        templateService.adminCreate({
          name: 'unknown_field_type_write',
          nameI18n: 'x',
          description: 'x',
          body: JSON.stringify([{ type: 'inputt', id: 'legacy', attributes: { label: 'x' } }]),
        }),
      ).rejects.toThrow();
    } finally {
      if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
      await templateService.initTemplates();
    }
  });
});

describe('GET /api/admin/templates/:id', () => {
  it('returns a single admin template', async () => {
    const token = await setupAndGetAdmin();

    const list = await request(app)
      .get('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`);

    const res = await request(app)
      .get(`/api/admin/templates/${list.body.data[0].name}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.data).toHaveProperty('name');
    expect(res.body.data).toHaveProperty('body');
    expect(res.body.data.source).toContain('body:');
    expect(JSON.parse(res.body.data.body)).toBeInstanceOf(Array);
    expect(JSON.parse(res.body.data.completionHooks)).toBeInstanceOf(Array);
  });
});

describe('POST /api/admin/templates', () => {
  it('creates a new template', async () => {
    const token = await setupAndGetAdmin();
    const source = [
      'name: Custom Test',
      'description: A test template',
      'title_prefix: "[Custom]  "',
      'body:',
      '  - type: input',
      '    id: reason',
      '    validations:',
      '      required: true',
      '    attributes:',
      '      label: Reason',
      'completion_hooks:',
      '  - event: closed',
      '    type: command',
      '    commands:',
      '      - say completed',
      '',
    ].join('\n');

    const res = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'custom_test',
        nameI18n: 'Custom Test',
        description: 'A test template',
        body: '- type: input\n  id: reason\n  validations:\n    required: true\n  attributes:\n    label: Reason',
        completionHooks: JSON.stringify([
          { event: 'closed', type: 'command', commands: ['say completed'] },
        ]),
        source,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.name).toBe('custom_test');
    expect(res.body.data.titlePrefix).toBe('[Custom]');
    expect(res.body.data.source).toBe(source);
    expect(JSON.parse(res.body.data.completionHooks)).toEqual([
      { event: 'closed', type: 'command', commands: ['say completed'] },
    ]);
  });

  it('rejects duplicate template name', async () => {
    const token = await setupAndGetAdmin();

    await request(app).post('/api/admin/templates').set('Authorization', `Bearer ${token}`).send({
      name: 'dup_tmpl',
      nameI18n: 'Dup',
      description: 'Dup template',
      body: '- type: input\n  id: x\n  attributes:\n    label: X',
    });

    const res = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'dup_tmpl',
        nameI18n: 'Dup 2',
        description: 'Dup template 2',
        body: '- type: input\n  id: x\n  attributes:\n    label: X',
      });

    expect(res.status).toBe(409);
  });

  it('rejects interactive body fields without an id', async () => {
    const token = await setupAndGetAdmin();

    const res = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'missing_id_tmpl',
        nameI18n: 'Missing ID',
        description: 'Invalid interactive field',
        body: '- type: input\n  attributes:\n    label: Details',
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('body 中非 markdown 字段必须提供 id');
  });

  it('allows markdown fields without an id and interactive fields without a label', async () => {
    const token = await setupAndGetAdmin();

    const res = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'id_fallback_tmpl',
        nameI18n: 'ID fallback',
        description: 'Valid fallback fields',
        body: [
          '- type: markdown',
          '  attributes:',
          '    value: Intro',
          '- type: input',
          '  id: details',
          '  attributes: {}',
        ].join('\n'),
      });

    expect(res.status).toBe(201);
    expect(JSON.parse(res.body.data.body)).toEqual([
      { type: 'markdown', attributes: { value: 'Intro' } },
      { type: 'input', id: 'details', attributes: {} },
    ]);
  });

  it.each([
    ['a non-string option', '[1]'],
    ['an empty submitted value', '["Visible|"]'],
    ['an empty display label', '["|value"]'],
    ['duplicate submitted values', '["First|same", "Second|same"]'],
    ['a submitted value colliding with another raw option', '["A|B", "C|A|B"]'],
  ])('rejects dropdowns with %s', async (_case, options) => {
    const token = await setupAndGetAdmin();
    const res = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'invalid_dropdown_tmpl',
        nameI18n: 'Invalid dropdown',
        description: 'Invalid dropdown options',
        body: [
          '- type: dropdown',
          '  id: permission',
          '  attributes:',
          '    label: Permission',
          `    options: ${options}`,
        ].join('\n'),
      });

    expect(res.status).toBe(400);
    expect(res.body.message).toBe('body 中选择字段必须提供有效且无歧义的 options');
  });

  it('rejects invalid options in selection hooks', async () => {
    const token = await setupAndGetAdmin();
    const cases: Array<{ name: string; type: string; options?: unknown[] }> = [
      { name: 'invalid_selection_hook_tmpl_1', type: 'dropdown' },
      { name: 'invalid_selection_hook_tmpl_2', type: 'dropdown', options: [] },
      { name: 'invalid_selection_hook_tmpl_3', type: 'dropdown', options: [1] },
      {
        name: 'invalid_selection_hook_tmpl_4',
        type: 'dropdown',
        options: ['Visible|'],
      },
      {
        name: 'invalid_selection_hook_tmpl_5',
        type: 'dropdown',
        options: ['A|B', 'C|A|B'],
      },
      { name: 'invalid_selection_hook_tmpl_6', type: 'checkboxes', options: [] },
    ];

    for (const testCase of cases) {
      const field: Record<string, unknown> = {
        type: testCase.type,
        id: 'choice',
        attributes: { label: 'Choice' },
      };
      if (testCase.options !== undefined) {
        (field.attributes as Record<string, unknown>).options = testCase.options;
      }
      const res = await request(app)
        .post('/api/admin/templates')
        .set('Authorization', `Bearer ${token}`)
        .send({
          name: testCase.name,
          nameI18n: 'Invalid selection hook',
          description: 'Invalid selection hook options',
          body: '- type: input\n  id: fallback\n  attributes:\n    label: Fallback',
          completionHooks: JSON.stringify([
            {
              event: 'closed',
              type: 'selection',
              title: 'Pick',
              fields: [field],
              actions: [{ type: 'command', commands: ['say done'] }],
            },
          ]),
        });

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('completionHooks 字段包含无效的钩子配置');
    }
  });

  it('rejects invalid options in selection hook source', async () => {
    const token = await setupAndGetAdmin();
    const source = [
      'name: Invalid selection source',
      'description: Invalid selection hook options',
      'body: []',
      'completion_hooks:',
      '  - event: closed',
      '    type: selection',
      '    title: Pick',
      '    fields:',
      '      - type: dropdown',
      '        id: choice',
      '        attributes:',
      '          label: Choice',
      '          options: ["A|B", "C|A|B"]',
      '    actions:',
      '      - type: command',
      '        commands: ["say done"]',
      '',
    ].join('\n');

    const res = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'invalid_selection_source_tmpl',
        nameI18n: 'Invalid selection source',
        description: 'Invalid selection hook options',
        body: '[]',
        source,
      });

    expect(res.status).toBe(400);
  });

  it('adds template labels referenced by their identifiers when a ticket is created', async () => {
    const token = await setupAndGetAdmin();
    const label = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({ id: 'template-label', name: 'Template label', color: '#3b82f6' });
    const secondaryLabel = await request(app)
      .post('/api/labels')
      .set('Authorization', `Bearer ${token}`)
      .send({
        id: 'secondary-template-label',
        name: 'Secondary template label',
        color: '#22c55e',
      });

    const template = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'labeled_tmpl',
        nameI18n: 'Labeled Template',
        description: 'Adds a label',
        labels: JSON.stringify([label.body.data.id, secondaryLabel.body.data.id]),
        body: '- type: input\n  id: reason\n  attributes:\n    label: Reason',
      });
    expect(template.status).toBe(201);

    const userToken = await createUserAndGetToken('labeled-ticket@tmpl.test');
    const ticket = await request(app)
      .post('/api/tickets')
      .set('Authorization', `Bearer ${userToken}`)
      .send({
        title: 'Labeled ticket',
        template: 'labeled_tmpl',
        formData: { reason: 'Testing labels' },
      });

    expect(ticket.status).toBe(201);
    expect(ticket.body.data.labels).toHaveLength(2);
    expect(
      ticket.body.data.labels.map((ticketLabel: { labelId: string }) => ticketLabel.labelId),
    ).toEqual(expect.arrayContaining([label.body.data.id, secondaryLabel.body.data.id]));
  });
});

describe('PATCH /api/admin/templates/:id', () => {
  it('updates a template', async () => {
    const token = await setupAndGetAdmin();

    const created = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'patch_tmpl',
        nameI18n: 'Patch Template',
        description: 'Original',
        body: '- type: input\n  id: x\n  attributes:\n    label: X',
      });

    const res = await request(app)
      .patch(`/api/admin/templates/${created.body.data.name}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ description: 'Updated description' });

    expect(res.status).toBe(200);
    expect(res.body.data.description).toBe('Updated description');

    const source = [
      'name: Raw Update',
      'description: Updated from YAML source',
      'body:',
      '  - type: markdown',
      '    attributes:',
      '      value: Direct edit',
      'completion_hooks: []',
      '',
    ].join('\n');
    const sourceRes = await request(app)
      .patch(`/api/admin/templates/${created.body.data.name}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ source });

    expect(sourceRes.status).toBe(200);
    expect(sourceRes.body.data.description).toBe('Updated from YAML source');
    expect(sourceRes.body.data.source).toBe(source);

    const invalidRes = await request(app)
      .patch(`/api/admin/templates/${created.body.data.name}`)
      .set('Authorization', `Bearer ${token}`)
      .send({ source: 'name: [invalid' });
    expect(invalidRes.status).toBe(400);

    const missingIdRes = await request(app)
      .patch(`/api/admin/templates/${created.body.data.name}`)
      .set('Authorization', `Bearer ${token}`)
      .send({
        source: [
          'name: Invalid body',
          'description: Missing interactive field ID',
          'body:',
          '  - type: input',
          '    attributes:',
          '      label: Details',
          '',
        ].join('\n'),
      });
    expect(missingIdRes.status).toBe(400);

    const unchanged = await request(app)
      .get(`/api/admin/templates/${created.body.data.name}`)
      .set('Authorization', `Bearer ${token}`);
    expect(unchanged.body.data.source).toBe(source);
  });
});

describe('DELETE /api/admin/templates/:id', () => {
  it('deletes a template', async () => {
    const token = await setupAndGetAdmin();

    const created = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'delete_tmpl',
        nameI18n: 'Delete Template',
        description: 'To be deleted',
        body: '- type: input\n  id: x\n  attributes:\n    label: X',
      });

    const res = await request(app)
      .delete(`/api/admin/templates/${created.body.data.name}`)
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(204);
  });
});

describe('template default assignees', () => {
  const assigneeBody = '- type: input\n  id: reason\n  attributes:\n    label: Reason';

  async function createRoleUser(email: string, role: 'player' | 'staff') {
    await request(app)
      .post('/api/auth/register')
      .send({ email, password: 'Password123!', username: email.split('@')[0] });
    const user = await prisma().user.findUnique({ where: { email } });
    if (!user) throw new Error(`user ${email} was not created`);
    if (role !== 'player') {
      await prisma().user.update({ where: { id: user.id }, data: { role } });
    }
    return user;
  }

  it('stores default assignees from structured fields', async () => {
    const token = await setupAndGetAdmin();
    const staff = await createRoleUser('assignee-store-staff@tmpl.test', 'staff');

    const res = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'assignee_store_tmpl',
        nameI18n: 'Assignee Store',
        description: 'Template with default assignees',
        assigneeIds: [staff.id],
        body: assigneeBody,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.assigneeIds).toEqual([staff.id]);
    expect(res.body.data.source).toContain('assignee_ids:');
  });

  it('rejects unknown, non-assignable and duplicate assignees', async () => {
    const token = await setupAndGetAdmin();
    const player = await createRoleUser('assignee-reject-player@tmpl.test', 'player');

    const unknown = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'assignee_reject_tmpl',
        nameI18n: 'Assignee Reject',
        description: 'Unknown assignee',
        assigneeIds: [2000000000],
        body: assigneeBody,
      });
    expect(unknown.status).toBe(400);
    expect(unknown.body.message).toContain('assignee_ids');

    const notAssignable = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'assignee_reject_tmpl',
        nameI18n: 'Assignee Reject',
        description: 'Player assignee',
        assigneeIds: [player.id],
        body: assigneeBody,
      });
    expect(notAssignable.status).toBe(400);
    expect(notAssignable.body.message).toContain('assignee_ids');

    const duplicate = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'assignee_reject_tmpl',
        nameI18n: 'Assignee Reject',
        description: 'Duplicate assignees',
        assigneeIds: [player.id, player.id],
        body: assigneeBody,
      });
    expect(duplicate.status).toBe(400);
    expect(duplicate.body.message).toContain('受理人不能重复');
  });

  it('clears default assignees through PATCH', async () => {
    const token = await setupAndGetAdmin();
    const staff = await createRoleUser('assignee-clear-staff@tmpl.test', 'staff');

    await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'assignee_clear_tmpl',
        nameI18n: 'Assignee Clear',
        description: 'Template to clear',
        assigneeIds: [staff.id],
        body: assigneeBody,
      });

    const res = await request(app)
      .patch('/api/admin/templates/assignee_clear_tmpl')
      .set('Authorization', `Bearer ${token}`)
      .send({ assigneeIds: [] });

    expect(res.status).toBe(200);
    expect(res.body.data.assigneeIds).toEqual([]);
    expect(res.body.data.source).not.toContain('assignee_ids');
  });

  it('accepts assignee_ids from the raw source document', async () => {
    const token = await setupAndGetAdmin();
    const staff = await createRoleUser('assignee-source-staff@tmpl.test', 'staff');

    const source = [
      'name: Source Assignee',
      'description: Template with assignees in source',
      `assignee_ids: [${staff.id}]`,
      'body:',
      '  - type: input',
      '    id: reason',
      '    attributes:',
      '      label: Reason',
      '',
    ].join('\n');

    const res = await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'assignee_source_tmpl',
        nameI18n: 'Source Assignee',
        description: 'Template with assignees in source',
        body: assigneeBody,
        source,
      });

    expect(res.status).toBe(201);
    expect(res.body.data.assigneeIds).toEqual([staff.id]);
  });

  it('keeps default assignees out of the public template detail', async () => {
    const token = await setupAndGetAdmin();
    const staff = await createRoleUser('assignee-public-staff@tmpl.test', 'staff');

    await request(app)
      .post('/api/admin/templates')
      .set('Authorization', `Bearer ${token}`)
      .send({
        name: 'assignee_public_tmpl',
        nameI18n: 'Assignee Public',
        description: 'Public detail hides assignees',
        assigneeIds: [staff.id],
        body: assigneeBody,
      });

    const res = await request(app)
      .get('/api/templates/assignee_public_tmpl')
      .set('Authorization', `Bearer ${token}`);
    expect(res.status).toBe(200);
    expect(res.body.data).not.toHaveProperty('assignee_ids');
    expect(res.body.data).not.toHaveProperty('assigneeIds');
  });
});
