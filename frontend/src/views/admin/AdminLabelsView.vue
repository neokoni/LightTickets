<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useLabelsStore } from '@/stores/labels';
import { ToastType, useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { useConfirm } from '@/composables/useConfirm';
import { t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseColorPicker from '@/components/base/BaseColorPicker.vue';
import BaseLoadingState from '@/components/base/BaseLoadingState.vue';
import type { Label } from '@/types/label';

const labels = useLabelsStore();
const ui = useUiStore();
const { confirm } = useConfirm();

const showModal = ref(false);
const editingId = ref<string | null>(null);
const form = ref({ id: '', name: '', color: '#3b82f6', description: '' });
const iconButtonClass =
  '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';
const dangerIconButtonClass = '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-red-500';

function openCreate() {
  editingId.value = null;
  form.value = { id: '', name: '', color: '#3b82f6', description: '' };
  showModal.value = true;
}

function openEdit(label: Label) {
  editingId.value = label.id;
  form.value = {
    id: label.id,
    name: label.name,
    color: label.color,
    description: label.description || '',
  };
  showModal.value = true;
}

async function save() {
  try {
    if (editingId.value) {
      await labels.update(editingId.value, {
        name: form.value.name,
        color: form.value.color,
        description: form.value.description,
      });
      ui.toast(t('admin.labels.updated'), ToastType.SUCCESS);
    } else {
      await labels.create(form.value);
      ui.toast(t('admin.labels.created'), ToastType.SUCCESS);
    }
    showModal.value = false;
  } catch (e) {
    handleError(e);
  }
}

async function remove(id: string) {
  if (!(await confirm(t('admin.labels.deleteConfirm')))) return;
  try {
    await labels.remove(id);
    ui.toast(t('admin.labels.deleted'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.deleteFailed'));
  }
}

onMounted(async () => {
  if (labels.loaded) return;
  try {
    await labels.fetchList();
  } catch (e) {
    handleError(e, t('common.loadFailed'));
  }
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
        {{ t('admin.labels.title') }}
      </h2>
      <BaseButton size="sm" icon="lucide:plus" @click="openCreate">{{
        t('admin.labels.create')
      }}</BaseButton>
    </div>

    <div class="admin-settings-list">
      <BaseLoadingState v-if="labels.loading && !labels.loaded" />
      <template v-else>
        <div v-for="label in labels.labels" :key="label.id" class="admin-settings-list-row">
          <div class="flex items-center gap-3">
            <span class="w-3 h-3 rounded-full" :style="{ backgroundColor: label.color }" />
            <span class="text-sm font-medium text-slate-900 dark:text-white">{{ label.name }}</span>
            <span class="font-mono text-xs text-slate-400">{{ label.id }}</span>
            <span v-if="label.description" class="text-xs text-slate-500">{{
              label.description
            }}</span>
          </div>
          <div class="flex items-center gap-1">
            <BaseButton :class="iconButtonClass" @click="openEdit(label)">
              <Icon icon="lucide:pencil" class="w-4 h-4" />
            </BaseButton>
            <BaseButton :class="dangerIconButtonClass" @click="remove(label.id)">
              <Icon icon="lucide:trash-2" class="w-4 h-4" />
            </BaseButton>
          </div>
        </div>
        <div v-if="!labels.labels.length" class="admin-settings-list-empty">
          {{ t('admin.labels.empty') }}
        </div>
      </template>
    </div>

    <BaseModal
      v-model="showModal"
      :title="editingId ? t('admin.labels.editTitle') : t('admin.labels.create')"
    >
      <form id="label-editor-form" class="space-y-4" @submit.prevent="save">
        <BaseInput
          v-model="form.id"
          :label="t('admin.labels.identifier')"
          :placeholder="t('admin.labels.identifierPlaceholder')"
          :disabled="!!editingId"
          maxlength="50"
          pattern="[a-zA-Z0-9_-]+"
          required
        />
        <p v-if="editingId" class="-mt-3 text-xs text-slate-500">
          {{ t('admin.labels.identifierImmutable') }}
        </p>
        <p v-else class="-mt-3 text-xs text-slate-500">
          {{ t('admin.labels.identifierHelp') }}
        </p>
        <BaseInput
          v-model="form.name"
          :label="t('common.name')"
          placeholder="bug, feature..."
          required
        />
        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">
            {{ t('common.color') }}<span class="base-field-required" aria-hidden="true">*</span>
          </label>
          <BaseColorPicker v-model="form.color" />
        </div>
        <BaseInput
          v-model="form.description"
          :label="t('common.descriptionOptional')"
          :placeholder="t('admin.labels.descriptionPlaceholder')"
        />
      </form>
      <template #footer>
        <BaseButton type="button" @click="showModal = false">{{ t('common.cancel') }}</BaseButton>
        <BaseButton
          filled
          type="submit"
          form="label-editor-form"
          :disabled="!form.name.trim() || (!editingId && !form.id.trim())"
          >{{ t('common.save') }}</BaseButton
        >
      </template>
    </BaseModal>
  </div>
</template>
