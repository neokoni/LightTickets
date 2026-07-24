<script setup lang="ts">
import { computed, ref, watch, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useTemplatesStore } from '@/stores/templates';
import { ToastType, useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { useConfirm } from '@/composables/useConfirm';
import { t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseTextarea from '@/components/base/BaseTextarea.vue';
import BaseToggle from '@/components/base/BaseToggle.vue';
import BaseSelect from '@/components/base/BaseSelect.vue';
import type {
  AdminTemplate,
  EditableTemplateCompletionHook,
  EditableTemplateField,
  EditableTemplateOption,
  TemplateCompletionHook,
} from '@/types/template';
import type { TemplateField, TemplateHiddenMode } from '@/types/ticket';
import { apiGetAdminTemplate } from '@/api/templates';

const templates = useTemplatesStore();
const ui = useUiStore();
const { confirm } = useConfirm();

const showModal = ref(false);
const editingName = ref<string | null>(null);
const activeSection = ref<'basic' | 'fields' | 'hooks' | 'source'>('basic');
const fields = ref<EditableTemplateField[]>([]);
const hooks = ref<EditableTemplateCompletionHook[]>([]);
const newFieldType = ref<TemplateField['type']>('textarea');
const newHookType = ref<EditableTemplateCompletionHook['type']>('minimessage');
const dragState = ref<{ group: 'fields' | 'hooks'; index: number } | null>(null);
const dragOver = ref<{ group: 'fields' | 'hooks'; index: number } | null>(null);
const source = ref('');
const initialSource = ref('');
const guiSourceSyncEnabled = ref(false);
let nextFieldKey = 0;
let nextHookKey = 0;
const form = ref({
  name: '',
  nameI18n: '',
  description: '',
  titlePrefix: '',
  labels: '[]',
  enabled: true,
  hidden: 'false',
});

const iconButtonClass =
  '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';
const dangerIconButtonClass = '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-red-500';

function openCreate() {
  guiSourceSyncEnabled.value = false;
  editingName.value = null;
  form.value = {
    name: '',
    nameI18n: '',
    description: '',
    titlePrefix: '',
    labels: '[]',
    enabled: true,
    hidden: 'false',
  };
  fields.value = [];
  hooks.value = [];
  newFieldType.value = 'textarea';
  newHookType.value = 'minimessage';
  onDragEnd();
  source.value = serializeTemplateSource();
  initialSource.value = source.value;
  guiSourceSyncEnabled.value = true;
  activeSection.value = 'basic';
  showModal.value = true;
}

async function openEdit(tmpl: AdminTemplate) {
  try {
    guiSourceSyncEnabled.value = false;
    const full = await apiGetAdminTemplate(tmpl.name);
    const parsed = JSON.parse(full.body) as TemplateField[];
    const parsedHooks = JSON.parse(full.completionHooks) as TemplateCompletionHook[];
    editingName.value = full.name;
    form.value = {
      name: full.name,
      nameI18n: full.nameI18n,
      description: full.description,
      titlePrefix: full.titlePrefix || '',
      labels: full.labels,
      enabled: full.enabled,
      hidden: String(full.hidden),
    };
    fields.value = parsed.map(deserializeField);
    hooks.value = parsedHooks.map(deserializeHook);
    source.value = full.source;
    initialSource.value = full.source;
    newFieldType.value = 'textarea';
    newHookType.value = 'minimessage';
    onDragEnd();
    guiSourceSyncEnabled.value = true;
    activeSection.value = 'basic';
    showModal.value = true;
  } catch (e) {
    handleError(e, t('admin.templates.deserializeFailed'));
  }
}

async function save() {
  try {
    if (editingName.value) {
      if (sourceChanged.value) {
        await templates.update(editingName.value, { source: source.value });
        ui.toast(t('admin.templates.updated'), ToastType.SUCCESS);
        showModal.value = false;
        return;
      }
      await templates.update(editingName.value, {
        nameI18n: form.value.nameI18n,
        description: form.value.description,
        titlePrefix: form.value.titlePrefix,
        labels: form.value.labels,
        body: serializeFields(),
        completionHooks: serializeHooks(),
        enabled: form.value.enabled,
        hidden: serializeHiddenMode(),
      });
      ui.toast(t('admin.templates.updated'), ToastType.SUCCESS);
    } else {
      await templates.create({
        ...form.value,
        body: serializeFields(),
        completionHooks: serializeHooks(),
        source: source.value,
        hidden: serializeHiddenMode(),
      });
      ui.toast(t('admin.templates.created'), ToastType.SUCCESS);
    }
    showModal.value = false;
  } catch (e) {
    handleError(e);
  }
}

function serializeHiddenMode(): TemplateHiddenMode {
  if (form.value.hidden === 'optional') return 'optional';
  return form.value.hidden === 'true';
}

function emptyField(type: EditableTemplateField['type']): EditableTemplateField {
  return {
    editorKey: nextFieldKey++,
    type,
    id: '',
    required: false,
    label: '',
    description: '',
    placeholder: '',
    value: '',
    options: [],
    advancedOpen: false,
  };
}

function normalizeOption(
  option: NonNullable<TemplateField['attributes']['options']>[number],
): EditableTemplateOption {
  return typeof option === 'string'
    ? { label: option, required: false }
    : { label: option.label, required: option.required ?? false };
}

function deserializeField(field: TemplateField): EditableTemplateField {
  return {
    ...emptyField(field.type),
    id: field.id ?? '',
    required: field.validations?.required ?? false,
    label: field.attributes.label ?? '',
    description: field.attributes.description ?? '',
    placeholder: field.attributes.placeholder ?? '',
    value: field.attributes.value ?? '',
    options: (field.attributes.options ?? []).map(normalizeOption),
  };
}

function addField() {
  fields.value.push(emptyField(newFieldType.value));
}

function removeField(index: number) {
  fields.value.splice(index, 1);
}

function moveField(index: number, offset: -1 | 1) {
  const target = index + offset;
  if (target < 0 || target >= fields.value.length) return;
  moveSortableItem('fields', index, target);
}

function addOption(field: EditableTemplateField) {
  field.options.push({ label: '', required: false });
}

function removeOption(field: EditableTemplateField, index: number) {
  field.options.splice(index, 1);
}

function serializeField(field: EditableTemplateField): TemplateField {
  const attributes: TemplateField['attributes'] = {};
  if (field.type === 'markdown') {
    if (field.value) attributes.value = field.value;
  } else {
    if (field.label.trim()) attributes.label = field.label.trim();
    if (field.description.trim()) attributes.description = field.description.trim();
    if (field.placeholder.trim()) attributes.placeholder = field.placeholder.trim();
    if (field.type === 'checkboxes' || field.type === 'dropdown') {
      attributes.options = field.options
        .filter((option) => option.label.trim())
        .map((option) =>
          option.required ? { label: option.label.trim(), required: true } : option.label.trim(),
        );
    }
  }

  const result: TemplateField = { type: field.type, attributes };
  if (field.id.trim()) result.id = field.id.trim();
  if (field.required) result.validations = { required: true };
  return result;
}

function serializeFields(): string {
  return JSON.stringify(fields.value.map(serializeField), null, 2);
}

function emptyHook(
  type: EditableTemplateCompletionHook['type'] = 'minimessage',
): EditableTemplateCompletionHook {
  return {
    editorKey: nextHookKey++,
    event: 'closed',
    type,
    condition: '',
    contents: [],
    advancedOpen: false,
  };
}

function deserializeHook(hook: TemplateCompletionHook): EditableTemplateCompletionHook {
  const type = hook.type ?? (hook.commands ? 'command' : 'minimessage');
  const contents =
    type === 'command'
      ? (hook.commands ?? [])
      : (hook.messages ?? (hook.message ? [hook.message] : []));
  return {
    ...emptyHook(type),
    event: hook.event === 'invalid' ? 'invalid' : 'closed',
    type,
    condition: hook.if ?? '',
    contents: [...contents],
  };
}

function addHook() {
  hooks.value.push(emptyHook(newHookType.value));
}

function removeHook(index: number) {
  hooks.value.splice(index, 1);
}

function moveHook(index: number, offset: -1 | 1) {
  const target = index + offset;
  if (target < 0 || target >= hooks.value.length) return;
  moveSortableItem('hooks', index, target);
}

function addHookContent(hook: EditableTemplateCompletionHook) {
  hook.contents.push('');
}

function removeHookContent(hook: EditableTemplateCompletionHook, index: number) {
  hook.contents.splice(index, 1);
}

function moveSortableItem(group: 'fields' | 'hooks', source: number, target: number) {
  if (source === target) return;
  if (group === 'fields') {
    if (source < 0 || target < 0 || source >= fields.value.length || target >= fields.value.length)
      return;
    const [item] = fields.value.splice(source, 1);
    fields.value.splice(target, 0, item);
    return;
  }
  if (source < 0 || target < 0 || source >= hooks.value.length || target >= hooks.value.length)
    return;
  const [item] = hooks.value.splice(source, 1);
  hooks.value.splice(target, 0, item);
}

function onDragStart(event: DragEvent, group: 'fields' | 'hooks', index: number) {
  dragState.value = { group, index };
  dragOver.value = { group, index };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', `${group}:${index}`);
  }
}

function onDragEnter(group: 'fields' | 'hooks', index: number) {
  const current = dragState.value;
  if (!current || current.group !== group) return;
  dragOver.value = { group, index };
}

function onDrop(group: 'fields' | 'hooks', index: number) {
  const current = dragState.value;
  if (current?.group === group) moveSortableItem(group, current.index, index);
  onDragEnd();
}

function onDragEnd() {
  dragState.value = null;
  dragOver.value = null;
}

function serializeHook(hook: EditableTemplateCompletionHook): TemplateCompletionHook {
  const result: TemplateCompletionHook = { event: hook.event, type: hook.type };
  if (hook.condition.trim()) result.if = hook.condition.trim();
  const contents = hook.contents.filter((content) => content.trim());
  if (hook.type === 'command') result.commands = contents;
  else result.messages = contents;
  return result;
}

function serializeHooks(): string {
  return JSON.stringify(hooks.value.map(serializeHook), null, 2);
}

function labelsForSource(): unknown {
  try {
    const parsed = JSON.parse(form.value.labels || '[]') as unknown;
    if (Array.isArray(parsed) && parsed.every((label) => typeof label === 'string')) return parsed;
  } catch {
    // Keep invalid input visible in the generated source so backend validation can reject it.
  }
  return form.value.labels;
}

function yamlScalar(value: unknown): string {
  if (value === null) return 'null';
  if (typeof value === 'boolean' || typeof value === 'number') return String(value);
  return JSON.stringify(String(value));
}

function dumpYaml(value: unknown, indent = 0): string {
  const padding = ' '.repeat(indent);
  if (Array.isArray(value)) {
    if (!value.length) return `${padding}[]`;
    return value
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          const lines = dumpYaml(item, indent + 2).split('\n');
          const first = lines[0].slice(indent + 2);
          return [`${padding}- ${first}`, ...lines.slice(1)].join('\n');
        }
        return `${padding}- ${yamlScalar(item)}`;
      })
      .join('\n');
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).filter(
      ([, entryValue]) => entryValue !== undefined,
    );
    if (!entries.length) return `${padding}{}`;
    return entries
      .map(([key, entryValue]) => {
        if (entryValue !== null && typeof entryValue === 'object') {
          if (Array.isArray(entryValue) && !entryValue.length) return `${padding}${key}: []`;
          return `${padding}${key}:\n${dumpYaml(entryValue, indent + 2)}`;
        }
        return `${padding}${key}: ${yamlScalar(entryValue)}`;
      })
      .join('\n');
  }
  return `${padding}${yamlScalar(value)}`;
}

function serializeTemplateSource(): string {
  const template: Record<string, unknown> = {
    name: form.value.nameI18n,
    description: form.value.description,
  };
  if (form.value.titlePrefix) template.title_prefix = form.value.titlePrefix;
  template.labels = labelsForSource();
  template.body = fields.value.map(serializeField);
  template.completion_hooks = hooks.value.map(serializeHook);
  template.enabled = form.value.enabled;
  template.hidden = serializeHiddenMode();
  return `${dumpYaml(template)}\n`;
}

const generatedSource = computed(serializeTemplateSource);

watch(
  generatedSource,
  (value) => {
    if (!guiSourceSyncEnabled.value) return;
    source.value = value;
  },
  { flush: 'sync' },
);

function fieldTypeLabel(type: EditableTemplateField['type']): string {
  return t(`admin.templates.fieldType.${type}`);
}

function fieldIcon(type: EditableTemplateField['type']): string {
  if (type === 'markdown') return 'lucide:text';
  if (type === 'checkboxes') return 'lucide:list-checks';
  if (type === 'dropdown') return 'lucide:list-collapse';
  if (type === 'input') return 'lucide:text-cursor-input';
  return 'lucide:align-left';
}

const sourceChanged = computed(() => source.value !== initialSource.value);

const canSave = computed(() => {
  if (editingName.value && sourceChanged.value) return !!source.value.trim();
  return !!form.value.name.trim() && !!form.value.nameI18n.trim() && fields.value.length > 0;
});

const editorNavItems = [
  { key: 'basic' as const, labelKey: 'admin.templates.section.basic', icon: 'lucide:info' },
  { key: 'fields' as const, labelKey: 'admin.templates.section.fields', icon: 'lucide:list-plus' },
  { key: 'hooks' as const, labelKey: 'admin.templates.section.hooks', icon: 'lucide:workflow' },
  {
    key: 'source' as const,
    labelKey: 'admin.templates.section.source',
    icon: 'lucide:file-code-2',
  },
];

const mobileSectionOptions = computed(() =>
  editorNavItems.map((item) => ({
    value: item.key,
    label: t(item.labelKey),
    icon: item.icon,
  })),
);

const selectedSection = computed({
  get: () => activeSection.value,
  set: (section: string) => {
    if (editorNavItems.some((item) => item.key === section)) {
      activeSection.value = section as typeof activeSection.value;
    }
  },
});

const hiddenModeOptions = [
  { value: 'false', label: t('admin.templates.visibilityPublic'), icon: 'lucide:eye' },
  { value: 'true', label: t('admin.templates.visibilityHidden'), icon: 'lucide:eye-off' },
  { value: 'optional', label: t('admin.templates.visibilityOptional'), icon: 'lucide:settings-2' },
];

const hookEventOptions = [
  { value: 'closed', label: t('admin.templates.hookEvent.closed'), icon: 'lucide:circle-check' },
  { value: 'invalid', label: t('admin.templates.hookEvent.invalid'), icon: 'lucide:circle-x' },
];

const hookTypeOptions = [
  { value: 'minimessage', label: 'MiniMessage', icon: 'lucide:message-square' },
  { value: 'command', label: t('admin.templates.hookType.command'), icon: 'lucide:terminal' },
];

const fieldTypeOptions = [
  { value: 'input', label: t('admin.templates.fieldType.input'), icon: 'lucide:text-cursor-input' },
  { value: 'textarea', label: t('admin.templates.fieldType.textarea'), icon: 'lucide:align-left' },
  { value: 'markdown', label: t('admin.templates.fieldType.markdown'), icon: 'lucide:text' },
  {
    value: 'checkboxes',
    label: t('admin.templates.fieldType.checkboxes'),
    icon: 'lucide:list-checks',
  },
  {
    value: 'dropdown',
    label: t('admin.templates.fieldType.dropdown'),
    icon: 'lucide:list-collapse',
  },
];

async function toggleEnabled(tmpl: AdminTemplate) {
  try {
    await templates.update(tmpl.name, { enabled: !tmpl.enabled });
    ui.toast(
      tmpl.enabled ? t('admin.templates.disabled') : t('admin.templates.enabled'),
      ToastType.SUCCESS,
    );
  } catch (e) {
    handleError(e);
  }
}

async function remove(name: string) {
  if (!(await confirm(t('admin.templates.deleteConfirm')))) return;
  try {
    await templates.remove(name);
    ui.toast(t('admin.templates.deleted'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.deleteFailed'));
  }
}

onMounted(() => {
  if (!templates.loaded) templates.fetchList();
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
        {{ t('admin.templates.title') }}
      </h2>
      <BaseButton size="sm" icon="lucide:plus" @click="openCreate">{{
        t('admin.templates.create')
      }}</BaseButton>
    </div>

    <div
      class="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800/80 rounded-xl"
    >
      <div
        v-for="tmpl in templates.templates"
        :key="tmpl.name"
        class="flex items-center justify-between px-4 py-3"
      >
        <div class="flex items-center gap-3">
          <span class="text-sm font-medium text-slate-900 dark:text-white">{{
            tmpl.nameI18n
          }}</span>
          <span class="text-xs text-slate-400 font-mono">{{ tmpl.name }}</span>
          <span
            v-if="!tmpl.enabled"
            class="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500"
            >{{ t('admin.templates.disabledBadge') }}</span
          >
        </div>
        <div class="flex items-center gap-1">
          <BaseButton
            :class="iconButtonClass"
            :title="tmpl.enabled ? t('admin.templates.disable') : t('admin.templates.enable')"
            @click="toggleEnabled(tmpl)"
          >
            <Icon :icon="tmpl.enabled ? 'lucide:eye' : 'lucide:eye-off'" class="w-4 h-4" />
          </BaseButton>
          <BaseButton :class="iconButtonClass" :title="t('common.edit')" @click="openEdit(tmpl)">
            <Icon icon="lucide:pencil" class="w-4 h-4" />
          </BaseButton>
          <BaseButton
            :class="dangerIconButtonClass"
            :title="t('common.delete')"
            @click="remove(tmpl.name)"
          >
            <Icon icon="lucide:trash-2" class="w-4 h-4" />
          </BaseButton>
        </div>
      </div>
      <div
        v-if="!templates.templates.length"
        class="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400"
      >
        {{ t('admin.templates.empty') }}
      </div>
    </div>

    <BaseModal
      v-model="showModal"
      :title="editingName ? t('admin.templates.editTitle') : t('admin.templates.create')"
      size="wide"
    >
      <form
        class="flex h-[calc(100vh-10rem)] min-h-0 max-h-[52rem] flex-col"
        @submit.prevent="save"
      >
        <div
          class="grid min-h-0 flex-1 grid-rows-[auto_minmax(0,1fr)] gap-5 md:grid-cols-[200px_minmax(0,1fr)] md:grid-rows-1 md:gap-6"
        >
          <div class="md:hidden">
            <BaseSelect
              v-model="selectedSection"
              :options="mobileSectionOptions"
              variant="subtle"
            />
          </div>

          <nav class="settings-side-nav settings-side-nav-desktop self-start">
            <BaseButton
              v-for="item in editorNavItems"
              :key="item.key"
              class="settings-side-nav-item"
              type="button"
              :data-active="activeSection === item.key"
              @click="activeSection = item.key"
            >
              <Icon :icon="item.icon" class="h-4 w-4" />
              {{ t(item.labelKey) }}
            </BaseButton>
          </nav>

          <div class="scrollbar-hidden min-h-0 min-w-0 overflow-y-auto pr-1">
            <section v-if="activeSection === 'basic'" class="max-w-2xl space-y-4">
              <div>
                <h4 class="text-base font-semibold text-slate-900 dark:text-white">
                  {{ t('admin.templates.section.basic') }}
                </h4>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ t('admin.templates.basicHelp') }}
                </p>
              </div>
              <BaseInput
                v-model="form.name"
                :label="t('admin.templates.key')"
                placeholder="bug_report"
                :disabled="!!editingName"
              />
              <p v-if="!!editingName" class="-mt-3 text-xs text-slate-500">
                {{ t('admin.templates.keyImmutable') }}
              </p>
              <BaseInput
                v-model="form.nameI18n"
                :label="t('admin.templates.displayName')"
                :placeholder="t('admin.templates.displayNamePlaceholder')"
              />
              <BaseInput
                v-model="form.description"
                :label="t('common.description')"
                :placeholder="t('admin.templates.descriptionPlaceholder')"
              />
              <BaseInput
                v-model="form.titlePrefix"
                :label="t('admin.templates.titlePrefix')"
                placeholder="[Bug] "
              />
              <BaseInput
                v-model="form.labels"
                :label="t('admin.templates.labelsJson')"
                placeholder='["bug"]'
              />
              <BaseSelect
                v-model="form.hidden"
                :label="t('admin.templates.visibility')"
                :options="hiddenModeOptions"
              />
              <div
                class="flex items-center justify-between gap-4 rounded-xl border border-slate-200/80 px-5 py-4 dark:border-slate-800/80"
              >
                <span class="text-sm text-slate-700 dark:text-slate-300">{{
                  t('admin.templates.enabledInCreate')
                }}</span>
                <BaseToggle v-model="form.enabled" />
              </div>
            </section>

            <section v-else-if="activeSection === 'fields'" class="min-w-0 space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 class="text-base font-semibold text-slate-900 dark:text-white">
                    {{ t('admin.templates.formFields') }}
                  </h4>
                  <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {{ t('admin.templates.formFieldsHelp') }}
                  </p>
                </div>
              </div>

              <div
                v-if="!fields.length"
                class="rounded-lg border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
              >
                {{ t('admin.templates.noFields') }}
              </div>

              <TransitionGroup name="template-item" tag="div" class="space-y-4">
                <article
                  v-for="(field, fieldIndex) in fields"
                  :key="field.editorKey"
                  class="space-y-4 rounded-lg border border-slate-200 p-4 transition-shadow dark:border-slate-800"
                  :class="{
                    'ring-2 ring-slate-400/50 dark:ring-slate-500/50':
                      dragOver?.group === 'fields' && dragOver.index === fieldIndex,
                  }"
                  @dragenter.prevent="onDragEnter('fields', fieldIndex)"
                  @dragover.prevent
                  @drop.prevent="onDrop('fields', fieldIndex)"
                >
                  <header class="flex items-center justify-between gap-3">
                    <div
                      class="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"
                    >
                      <BaseButton
                        :class="iconButtonClass"
                        type="button"
                        draggable="true"
                        :title="t('admin.templates.dragToReorder')"
                        @dragstart="onDragStart($event, 'fields', fieldIndex)"
                        @dragend="onDragEnd"
                      >
                        <Icon icon="lucide:grip-vertical" class="h-4 w-4 cursor-grab" />
                      </BaseButton>
                      <Icon :icon="fieldIcon(field.type)" class="h-4 w-4 shrink-0" />
                      <span>{{ fieldTypeLabel(field.type) }}</span>
                      <span class="font-mono text-xs font-normal text-slate-400"
                        >#{{ fieldIndex + 1 }}</span
                      >
                    </div>
                    <div class="flex items-center gap-1">
                      <BaseButton
                        :class="iconButtonClass"
                        type="button"
                        :title="t('admin.templates.moveUp')"
                        :disabled="fieldIndex === 0"
                        @click="moveField(fieldIndex, -1)"
                      >
                        <Icon icon="lucide:arrow-up" class="h-4 w-4" />
                      </BaseButton>
                      <BaseButton
                        :class="iconButtonClass"
                        type="button"
                        :title="t('admin.templates.moveDown')"
                        :disabled="fieldIndex === fields.length - 1"
                        @click="moveField(fieldIndex, 1)"
                      >
                        <Icon icon="lucide:arrow-down" class="h-4 w-4" />
                      </BaseButton>
                      <BaseButton
                        :class="dangerIconButtonClass"
                        type="button"
                        :title="t('common.delete')"
                        @click="removeField(fieldIndex)"
                      >
                        <Icon icon="lucide:trash-2" class="h-4 w-4" />
                      </BaseButton>
                    </div>
                  </header>

                  <BaseTextarea
                    v-if="field.type === 'markdown'"
                    v-model="field.value"
                    :label="t('admin.templates.markdownContent')"
                    :rows="5"
                    previewable
                  />
                  <template v-else>
                    <BaseInput v-model="field.label" :label="t('admin.templates.fieldLabel')" />

                    <div
                      v-if="field.type === 'checkboxes' || field.type === 'dropdown'"
                      class="space-y-2"
                    >
                      <div class="flex items-center justify-between gap-3">
                        <span class="text-sm font-medium text-slate-700 dark:text-slate-300">{{
                          t('admin.templates.options')
                        }}</span>
                        <BaseButton
                          size="sm"
                          type="button"
                          icon="lucide:plus"
                          @click="addOption(field)"
                        >
                          {{ t('admin.templates.addOption') }}
                        </BaseButton>
                      </div>
                      <div
                        v-for="(option, optionIndex) in field.options"
                        :key="optionIndex"
                        class="flex items-center gap-2"
                      >
                        <BaseInput
                          v-model="option.label"
                          class="min-w-0 flex-1"
                          :placeholder="t('admin.templates.optionPlaceholder')"
                        />
                        <label
                          v-if="field.type === 'checkboxes'"
                          class="flex shrink-0 items-center gap-2 text-xs text-slate-600 dark:text-slate-400"
                        >
                          <BaseToggle v-model="option.required" />
                          {{ t('admin.templates.requiredOption') }}
                        </label>
                        <BaseButton
                          :class="dangerIconButtonClass"
                          type="button"
                          :title="t('common.delete')"
                          @click="removeOption(field, optionIndex)"
                        >
                          <Icon icon="lucide:x" class="h-4 w-4" />
                        </BaseButton>
                      </div>
                    </div>

                    <BaseButton
                      size="sm"
                      type="button"
                      :aria-expanded="field.advancedOpen"
                      @click="field.advancedOpen = !field.advancedOpen"
                    >
                      {{ t('admin.templates.optionalSettings') }}
                      <Icon
                        :icon="field.advancedOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'"
                        class="h-4 w-4"
                      />
                    </BaseButton>
                    <div v-show="field.advancedOpen" class="grid gap-3 sm:grid-cols-2">
                      <BaseInput
                        v-model="field.id"
                        :label="t('admin.templates.fieldIdOptional')"
                        placeholder="description"
                      />
                      <BaseInput
                        v-if="field.type !== 'checkboxes'"
                        v-model="field.description"
                        :label="t('common.descriptionOptional')"
                      />
                      <BaseInput
                        v-if="field.type === 'textarea' || field.type === 'input'"
                        v-model="field.placeholder"
                        :label="t('admin.templates.placeholderOptional')"
                      />
                      <label
                        class="flex items-center justify-between gap-3 rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-700 dark:border-slate-800 dark:text-slate-300"
                      >
                        {{ t('admin.templates.requiredField') }}
                        <BaseToggle v-model="field.required" />
                      </label>
                    </div>
                  </template>
                </article>
              </TransitionGroup>

              <div
                class="grid gap-3 rounded-lg border border-dashed border-slate-300 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end dark:border-slate-700"
              >
                <BaseSelect
                  v-model="newFieldType"
                  :label="t('admin.templates.newFieldType')"
                  :options="fieldTypeOptions"
                />
                <BaseButton filled type="button" icon="lucide:plus" @click="addField">
                  {{ t('admin.templates.addField') }}
                </BaseButton>
              </div>
            </section>

            <section v-else-if="activeSection === 'hooks'" class="min-w-0 space-y-4">
              <div class="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h4 class="text-base font-semibold text-slate-900 dark:text-white">
                    {{ t('admin.templates.section.hooks') }}
                  </h4>
                  <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                    {{ t('admin.templates.hooksHelp') }}
                  </p>
                </div>
              </div>

              <div
                v-if="!hooks.length"
                class="rounded-lg border border-dashed border-slate-300 px-4 py-12 text-center text-sm text-slate-500 dark:border-slate-700 dark:text-slate-400"
              >
                {{ t('admin.templates.noHooks') }}
              </div>

              <TransitionGroup name="template-item" tag="div" class="space-y-4">
                <article
                  v-for="(hook, hookIndex) in hooks"
                  :key="hook.editorKey"
                  class="space-y-4 rounded-lg border border-slate-200 p-4 transition-shadow dark:border-slate-800"
                  :class="{
                    'ring-2 ring-slate-400/50 dark:ring-slate-500/50':
                      dragOver?.group === 'hooks' && dragOver.index === hookIndex,
                  }"
                  @dragenter.prevent="onDragEnter('hooks', hookIndex)"
                  @dragover.prevent
                  @drop.prevent="onDrop('hooks', hookIndex)"
                >
                  <header class="flex items-center justify-between gap-3">
                    <div
                      class="flex min-w-0 items-center gap-2 text-sm font-semibold text-slate-900 dark:text-white"
                    >
                      <BaseButton
                        :class="iconButtonClass"
                        type="button"
                        draggable="true"
                        :title="t('admin.templates.dragToReorder')"
                        @dragstart="onDragStart($event, 'hooks', hookIndex)"
                        @dragend="onDragEnd"
                      >
                        <Icon icon="lucide:grip-vertical" class="h-4 w-4 cursor-grab" />
                      </BaseButton>
                      <Icon
                        :icon="
                          hook.type === 'command' ? 'lucide:terminal' : 'lucide:message-square'
                        "
                        class="h-4 w-4 shrink-0"
                      />
                      <span>{{ t('admin.templates.hook') }}</span>
                      <span class="font-mono text-xs font-normal text-slate-400"
                        >#{{ hookIndex + 1 }}</span
                      >
                    </div>
                    <div class="flex items-center gap-1">
                      <BaseButton
                        :class="iconButtonClass"
                        type="button"
                        :title="t('admin.templates.moveUp')"
                        :disabled="hookIndex === 0"
                        @click="moveHook(hookIndex, -1)"
                      >
                        <Icon icon="lucide:arrow-up" class="h-4 w-4" />
                      </BaseButton>
                      <BaseButton
                        :class="iconButtonClass"
                        type="button"
                        :title="t('admin.templates.moveDown')"
                        :disabled="hookIndex === hooks.length - 1"
                        @click="moveHook(hookIndex, 1)"
                      >
                        <Icon icon="lucide:arrow-down" class="h-4 w-4" />
                      </BaseButton>
                      <BaseButton
                        :class="dangerIconButtonClass"
                        type="button"
                        :title="t('common.delete')"
                        @click="removeHook(hookIndex)"
                      >
                        <Icon icon="lucide:trash-2" class="h-4 w-4" />
                      </BaseButton>
                    </div>
                  </header>

                  <div class="grid gap-3 sm:grid-cols-2">
                    <BaseSelect
                      v-model="hook.event"
                      :label="t('admin.templates.hookEvent')"
                      :options="hookEventOptions"
                    />
                    <BaseSelect
                      v-model="hook.type"
                      :label="t('admin.templates.hookType')"
                      :options="hookTypeOptions"
                    />
                  </div>

                  <div class="space-y-2">
                    <div class="flex items-center justify-between gap-3">
                      <span class="text-sm font-medium text-slate-700 dark:text-slate-300">{{
                        hook.type === 'command'
                          ? t('admin.templates.commands')
                          : t('admin.templates.messages')
                      }}</span>
                      <BaseButton
                        size="sm"
                        type="button"
                        icon="lucide:plus"
                        @click="addHookContent(hook)"
                      >
                        {{
                          hook.type === 'command'
                            ? t('admin.templates.addCommand')
                            : t('admin.templates.addMessage')
                        }}
                      </BaseButton>
                    </div>
                    <div
                      v-for="(_, contentIndex) in hook.contents"
                      :key="contentIndex"
                      class="flex items-start gap-2"
                    >
                      <BaseTextarea
                        v-model="hook.contents[contentIndex]"
                        class="min-w-0 flex-1 [&_textarea]:font-mono"
                        :rows="2"
                        :placeholder="
                          hook.type === 'command'
                            ? t('admin.templates.commandPlaceholder')
                            : t('admin.templates.messagePlaceholder')
                        "
                      />
                      <BaseButton
                        :class="dangerIconButtonClass"
                        type="button"
                        :title="t('common.delete')"
                        @click="removeHookContent(hook, contentIndex)"
                      >
                        <Icon icon="lucide:x" class="h-4 w-4" />
                      </BaseButton>
                    </div>
                  </div>

                  <BaseButton
                    size="sm"
                    type="button"
                    :aria-expanded="hook.advancedOpen"
                    @click="hook.advancedOpen = !hook.advancedOpen"
                  >
                    {{ t('admin.templates.optionalSettings') }}
                    <Icon
                      :icon="hook.advancedOpen ? 'lucide:chevron-up' : 'lucide:chevron-down'"
                      class="h-4 w-4"
                    />
                  </BaseButton>
                  <BaseInput
                    v-show="hook.advancedOpen"
                    v-model="hook.condition"
                    :label="t('admin.templates.hookConditionOptional')"
                    placeholder="{field.priority}>=4"
                  />
                </article>
              </TransitionGroup>

              <div
                class="grid gap-3 rounded-lg border border-dashed border-slate-300 p-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end dark:border-slate-700"
              >
                <BaseSelect
                  v-model="newHookType"
                  :label="t('admin.templates.newHookType')"
                  :options="hookTypeOptions"
                />
                <BaseButton filled type="button" icon="lucide:plus" @click="addHook">
                  {{ t('admin.templates.addHook') }}
                </BaseButton>
              </div>
            </section>

            <section v-else class="min-w-0 space-y-4">
              <div>
                <h4 class="text-base font-semibold text-slate-900 dark:text-white">
                  {{ t('admin.templates.section.source') }}
                </h4>
                <p class="mt-1 text-xs text-slate-500 dark:text-slate-400">
                  {{ t('admin.templates.sourceHelp') }}
                </p>
              </div>
              <BaseTextarea
                v-model="source"
                :label="t('admin.templates.sourceLabel')"
                :rows="28"
                spellcheck="false"
                class="[&_textarea]:min-h-[28rem] [&_textarea]:font-mono"
              />
            </section>
          </div>
        </div>

        <div
          class="mt-5 flex shrink-0 justify-end gap-2 border-t border-slate-200 pt-4 dark:border-slate-800"
        >
          <BaseButton type="button" @click="showModal = false">{{ t('common.cancel') }}</BaseButton>
          <BaseButton filled type="submit" :disabled="!canSave">{{ t('common.save') }}</BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
</template>

<style scoped>
.template-item-move {
  transition: transform 240ms cubic-bezier(0.22, 1, 0.36, 1);
}
</style>
