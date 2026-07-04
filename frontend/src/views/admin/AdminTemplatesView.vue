<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useTemplatesStore } from '@/stores/templates'
import { useUiStore } from '@/stores/ui'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import type { AdminTemplate } from '@/api/templates'
import { apiGetAdminTemplate } from '@/api/templates'

const templates = useTemplatesStore()
const ui = useUiStore()

const showModal = ref(false)
const editingName = ref<string | null>(null)
const form = ref({
  name: '',
  nameI18n: '',
  description: '',
  titlePrefix: '',
  labels: '[]',
  body: '',
  completionHooks: '[]',
  enabled: true,
})

function openCreate() {
  editingName.value = null
  form.value = { name: '', nameI18n: '', description: '', titlePrefix: '', labels: '[]', body: '', completionHooks: '[]', enabled: true }
  showModal.value = true
}

async function openEdit(tmpl: AdminTemplate) {
  const full = await apiGetAdminTemplate(tmpl.name)
  editingName.value = full.name
  form.value = {
    name: full.name,
    nameI18n: full.nameI18n,
    description: full.description,
    titlePrefix: full.titlePrefix || '',
    labels: full.labels,
    body: full.body,
    completionHooks: full.completionHooks,
    enabled: full.enabled,
  }
  showModal.value = true
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
      })
      ui.toast('模板已更新', 'success')
    } else {
      await templates.create(form.value)
      ui.toast('模板已创建', 'success')
    }
    showModal.value = false
  } catch (e: any) {
    ui.toast(e.message || '操作失败', 'error')
  }
}

async function toggleEnabled(tmpl: AdminTemplate) {
  try {
    await templates.update(tmpl.name, { enabled: !tmpl.enabled })
    ui.toast(tmpl.enabled ? '已禁用模板' : '已启用模板', 'success')
  } catch (e: any) {
    ui.toast(e.message || '操作失败', 'error')
  }
}

async function remove(name: string) {
  if (!confirm('确定删除此模板？')) return
  try {
    await templates.remove(name)
    ui.toast('模板已删除', 'success')
  } catch (e: any) {
    ui.toast(e.message || '删除失败', 'error')
  }
}

onMounted(() => {
  if (!templates.loaded) templates.fetch()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">模板管理</h2>
      <BaseButton size="sm" icon="lucide:plus" @click="openCreate">新建模板</BaseButton>
    </div>

    <div class="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800/80 rounded-xl">
      <div v-for="tmpl in templates.templates" :key="tmpl.name" class="flex items-center justify-between px-4 py-3">
        <div class="flex items-center gap-3">
          <span class="text-sm font-medium text-slate-900 dark:text-white">{{ tmpl.nameI18n }}</span>
          <span class="text-xs text-slate-400 font-mono">{{ tmpl.name }}</span>
          <span v-if="!tmpl.enabled" class="text-xs px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-500">已禁用</span>
        </div>
        <div class="flex items-center gap-1">
          <button @click="toggleEnabled(tmpl)" class="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" :title="tmpl.enabled ? '禁用' : '启用'">
            <Icon :icon="tmpl.enabled ? 'lucide:eye' : 'lucide:eye-off'" class="w-4 h-4" />
          </button>
          <button @click="openEdit(tmpl)" class="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" title="编辑">
            <Icon icon="lucide:pencil" class="w-4 h-4" />
          </button>
          <button @click="remove(tmpl.name)" class="p-1.5 rounded text-slate-400 hover:text-red-500" title="删除">
            <Icon icon="lucide:trash-2" class="w-4 h-4" />
          </button>
        </div>
      </div>
      <div v-if="!templates.templates.length" class="px-4 py-8 text-center text-sm text-slate-500 dark:text-slate-400">暂无模板</div>
    </div>

    <BaseModal v-model="showModal" :title="editingName ? '编辑模板' : '新建模板'">
      <form @submit.prevent="save" class="space-y-4 max-h-[70vh] overflow-y-auto">
        <BaseInput v-model="form.name" label="模板 Key" placeholder="bug_report" :disabled="!!editingName" />
        <p v-if="!!editingName" class="text-xs text-slate-500 -mt-3">模板 Key 创建后不可修改</p>
        <BaseInput v-model="form.nameI18n" label="显示名称" placeholder="Bug 反馈" />
        <BaseInput v-model="form.description" label="描述" placeholder="报告游戏中遇到的问题" />
        <BaseInput v-model="form.titlePrefix" label="标题前缀（可选）" placeholder="[Bug] " />
        <BaseInput v-model="form.labels" label="标签 (JSON 数组)" placeholder='["bug"]' />

        <label class="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300 cursor-pointer">
          <input v-model="form.enabled" type="checkbox" class="rounded" />
          启用（在创建议题页面显示）
        </label>

        <!-- YAML editors with Tab indentation support -->
        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">表单字段 (YAML)</label>
          <textarea
            v-model="form.body"
            :rows="16"
            spellcheck="false"
            class="w-full px-3 py-2 text-sm font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 dark:focus:ring-slate-100/20 dark:focus:border-slate-600 resize-y transition"
            @keydown="(e) => { if (e.key === 'Tab') { e.preventDefault(); const t = e.target as HTMLTextAreaElement; const s = t.selectionStart; t.setRangeText('  ', s, t.selectionEnd, 'end'); } }"
          />
        </div>
        <div class="space-y-1.5">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">完成钩子 (YAML)</label>
          <textarea
            v-model="form.completionHooks"
            :rows="8"
            spellcheck="false"
            class="w-full px-3 py-2 text-sm font-mono rounded-md border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 dark:placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/20 focus:border-slate-400 dark:focus:ring-slate-100/20 dark:focus:border-slate-600 resize-y transition"
            @keydown="(e) => { if (e.key === 'Tab') { e.preventDefault(); const t = e.target as HTMLTextAreaElement; const s = t.selectionStart; t.setRangeText('  ', s, t.selectionEnd, 'end'); } }"
          />
        </div>

        <div class="flex justify-end gap-2">
          <BaseButton type="button" @click="showModal = false">取消</BaseButton>
          <BaseButton filled type="submit" :disabled="!form.name.trim() || !form.nameI18n.trim() || !form.body.trim()">保存</BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
</template>
