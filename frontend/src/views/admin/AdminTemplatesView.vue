<script setup lang="ts">
import { ref, onMounted } from 'vue';
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
import type { AdminTemplate } from '@/types/template';
import { apiGetAdminTemplate } from '@/api/templates';

const templates = useTemplatesStore();
const ui = useUiStore();
const { confirm } = useConfirm();

const showModal = ref(false);
const editingName = ref<string | null>(null);
const form = ref({
  name: '',
  nameI18n: '',
  description: '',
  titlePrefix: '',
  labels: '[]',
  body: '',
  completionHooks: '[]',
  enabled: true,
});

const iconButtonClass =
  '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';
const dangerIconButtonClass = '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-red-500';

function openCreate() {
  editingName.value = null;
  form.value = {
    name: '',
    nameI18n: '',
    description: '',
    titlePrefix: '',
    labels: '[]',
    body: '',
    completionHooks: '[]',
    enabled: true,
  };
  showModal.value = true;
}

async function openEdit(tmpl: AdminTemplate) {
  const full = await apiGetAdminTemplate(tmpl.name);
  editingName.value = full.name;
  form.value = {
    name: full.name,
    nameI18n: full.nameI18n,
    description: full.description,
    titlePrefix: full.titlePrefix || '',
    labels: full.labels,
    body: full.body,
    completionHooks: full.completionHooks,
    enabled: full.enabled,
  };
  showModal.value = true;
}

async function save() {
  try {
    if (editingName.value) {
      await templates.update(editingName.value, {
        nameI18n: form.value.nameI18n,
        description: form.value.description,
        titlePrefix: form.value.titlePrefix,
        labels: form.value.labels,
        body: form.value.body,
        completionHooks: form.value.completionHooks,
        enabled: form.value.enabled,
      });
      ui.toast(t('admin.templates.updated'), ToastType.SUCCESS);
    } else {
      await templates.create(form.value);
      ui.toast(t('admin.templates.created'), ToastType.SUCCESS);
    }
    showModal.value = false;
  } catch (e) {
    handleError(e);
  }
}

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

function insertTextareaTab(e: KeyboardEvent) {
  if (e.key !== 'Tab') return;
  e.preventDefault();
  const textarea = e.target as HTMLTextAreaElement;
  const start = textarea.selectionStart;
  textarea.setRangeText('  ', start, textarea.selectionEnd, 'end');
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
    >
      <form class="space-y-4 max-h-[70vh] overflow-y-auto" @submit.prevent="save">
        <BaseInput
          v-model="form.name"
          :label="t('admin.templates.key')"
          placeholder="bug_report"
          :disabled="!!editingName"
        />
        <p v-if="!!editingName" class="text-xs text-slate-500 -mt-3">
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

        <div class="flex items-center justify-between gap-4">
          <span class="text-sm text-slate-700 dark:text-slate-300">{{
            t('admin.templates.enabledInCreate')
          }}</span>
          <BaseToggle v-model="form.enabled" />
        </div>

        <!-- YAML editors with Tab indentation support -->
        <BaseTextarea
          v-model="form.body"
          :label="t('admin.templates.formFieldsYaml')"
          :rows="16"
          spellcheck="false"
          class="[&_textarea]:font-mono"
          @keydown="insertTextareaTab"
        />
        <BaseTextarea
          v-model="form.completionHooks"
          :label="t('admin.templates.completionHooksYaml')"
          :rows="8"
          spellcheck="false"
          class="[&_textarea]:font-mono"
          @keydown="insertTextareaTab"
        />

        <div class="flex justify-end gap-2">
          <BaseButton type="button" @click="showModal = false">{{ t('common.cancel') }}</BaseButton>
          <BaseButton
            filled
            type="submit"
            :disabled="!form.name.trim() || !form.nameI18n.trim() || !form.body.trim()"
            >{{ t('common.save') }}</BaseButton
          >
        </div>
      </form>
    </BaseModal>
  </div>
</template>
