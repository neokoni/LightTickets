<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useTemplatesStore } from '@/stores/templates';
import { useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { useConfirm } from '@/composables/useConfirm';
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
      ui.toast('模板已更新', 'success');
    } else {
      await templates.create(form.value);
      ui.toast('模板已创建', 'success');
    }
    showModal.value = false;
  } catch (e) {
    handleError(e);
  }
}

async function toggleEnabled(tmpl: AdminTemplate) {
  try {
    await templates.update(tmpl.name, { enabled: !tmpl.enabled });
    ui.toast(tmpl.enabled ? '已禁用模板' : '已启用模板', 'success');
  } catch (e) {
    handleError(e);
  }
}

async function remove(name: string) {
  if (!(await confirm('确定删除此模板？'))) return;
  try {
    await templates.remove(name);
    ui.toast('模板已删除', 'success');
  } catch (e) {
    handleError(e, '删除失败');
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
      <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">模板管理</h2>
      <BaseButton size="sm" icon="lucide:plus" @click="openCreate">新建模板</BaseButton>
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
            >已禁用</span
          >
        </div>
        <div class="flex items-center gap-1">
          <BaseButton
            :class="iconButtonClass"
            :title="tmpl.enabled ? '禁用' : '启用'"
            @click="toggleEnabled(tmpl)"
          >
            <Icon :icon="tmpl.enabled ? 'lucide:eye' : 'lucide:eye-off'" class="w-4 h-4" />
          </BaseButton>
          <BaseButton :class="iconButtonClass" title="编辑" @click="openEdit(tmpl)">
            <Icon icon="lucide:pencil" class="w-4 h-4" />
          </BaseButton>
          <BaseButton :class="dangerIconButtonClass" title="删除" @click="remove(tmpl.name)">
            <Icon icon="lucide:trash-2" class="w-4 h-4" />
          </BaseButton>
        </div>
      </div>
      <div
        v-if="!templates.templates.length"
        class="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400"
      >
        暂无模板
      </div>
    </div>

    <BaseModal v-model="showModal" :title="editingName ? '编辑模板' : '新建模板'">
      <form class="space-y-4 max-h-[70vh] overflow-y-auto" @submit.prevent="save">
        <BaseInput
          v-model="form.name"
          label="模板 Key"
          placeholder="bug_report"
          :disabled="!!editingName"
        />
        <p v-if="!!editingName" class="text-xs text-slate-500 -mt-3">模板 Key 创建后不可修改</p>
        <BaseInput v-model="form.nameI18n" label="显示名称" placeholder="Bug 反馈" />
        <BaseInput v-model="form.description" label="描述" placeholder="报告游戏中遇到的问题" />
        <BaseInput v-model="form.titlePrefix" label="标题前缀（可选）" placeholder="[Bug] " />
        <BaseInput v-model="form.labels" label="标签 (JSON 数组)" placeholder='["bug"]' />

        <div class="flex items-center justify-between gap-4">
          <span class="text-sm text-slate-700 dark:text-slate-300">启用（在创建议题页面显示）</span>
          <BaseToggle v-model="form.enabled" />
        </div>

        <!-- YAML editors with Tab indentation support -->
        <BaseTextarea
          v-model="form.body"
          label="表单字段 (YAML)"
          :rows="16"
          spellcheck="false"
          class="[&_textarea]:font-mono"
          @keydown="insertTextareaTab"
        />
        <BaseTextarea
          v-model="form.completionHooks"
          label="完成钩子 (YAML)"
          :rows="8"
          spellcheck="false"
          class="[&_textarea]:font-mono"
          @keydown="insertTextareaTab"
        />

        <div class="flex justify-end gap-2">
          <BaseButton type="button" @click="showModal = false">取消</BaseButton>
          <BaseButton
            filled
            type="submit"
            :disabled="!form.name.trim() || !form.nameI18n.trim() || !form.body.trim()"
            >保存</BaseButton
          >
        </div>
      </form>
    </BaseModal>
  </div>
</template>
