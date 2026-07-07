<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useLabelsStore } from '@/stores/labels';
import { useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { useConfirm } from '@/composables/useConfirm';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseModal from '@/components/base/BaseModal.vue';
import BaseColorPicker from '@/components/base/BaseColorPicker.vue';

const labels = useLabelsStore();
const ui = useUiStore();
const { confirm } = useConfirm();

const showModal = ref(false);
const editingId = ref<string | null>(null);
const form = ref({ name: '', color: '#3b82f6', description: '' });
const iconButtonClass =
  '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-slate-700 dark:hover:text-slate-200';
const dangerIconButtonClass = '!px-1.5 !py-1.5 border-none text-slate-400 hover:text-red-500';

function openCreate() {
  editingId.value = null;
  form.value = { name: '', color: '#3b82f6', description: '' };
  showModal.value = true;
}

function openEdit(label: { id: string; name: string; color: string; description?: string }) {
  editingId.value = label.id;
  form.value = { name: label.name, color: label.color, description: label.description || '' };
  showModal.value = true;
}

async function save() {
  try {
    if (editingId.value) {
      await labels.update(editingId.value, form.value);
      ui.toast('标签已更新', 'success');
    } else {
      await labels.create(form.value);
      ui.toast('标签已创建', 'success');
    }
    showModal.value = false;
  } catch (e) {
    handleError(e);
  }
}

async function remove(id: string) {
  if (!(await confirm('确定删除此标签？'))) return;
  try {
    await labels.remove(id);
    ui.toast('标签已删除', 'success');
  } catch (e) {
    handleError(e, '删除失败');
  }
}

onMounted(() => {
  if (!labels.loaded) labels.fetchList();
});
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">标签管理</h2>
      <BaseButton size="sm" icon="lucide:plus" @click="openCreate">新建标签</BaseButton>
    </div>

    <div
      class="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800/80 rounded-xl"
    >
      <div
        v-for="label in labels.labels"
        :key="label.id"
        class="flex items-center justify-between px-4 py-3"
      >
        <div class="flex items-center gap-3">
          <span class="w-3 h-3 rounded-full" :style="{ backgroundColor: label.color }" />
          <span class="text-sm font-medium text-slate-900 dark:text-white">{{ label.name }}</span>
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
      <div
        v-if="!labels.labels.length"
        class="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400"
      >
        暂无标签
      </div>
    </div>

    <BaseModal v-model="showModal" :title="editingId ? '编辑标签' : '新建标签'">
      <form class="space-y-4" @submit.prevent="save">
        <BaseInput v-model="form.name" label="名称" placeholder="bug, feature..." />
        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">颜色</label>
          <BaseColorPicker v-model="form.color" />
        </div>
        <BaseInput v-model="form.description" label="描述（可选）" placeholder="标签用途说明" />
        <div class="flex justify-end gap-2">
          <BaseButton type="button" @click="showModal = false">取消</BaseButton>
          <BaseButton filled type="submit" :disabled="!form.name.trim()">保存</BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
