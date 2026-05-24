<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getSiteConfig, updateSettings } from '@/api/setup'
import { setRequireLoginCache } from '@/router'
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
const requireLogin = ref(false)
const loading = ref(false)
const saving = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const config = await getSiteConfig()
    requireLogin.value = config.requireLogin
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  try {
    const result = await updateSettings({ requireLogin: requireLogin.value })
    setRequireLoginCache(result.requireLogin)
    ui.toast('设置已保存', 'success')
  } catch (e: any) {
    ui.toast(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-lg font-semibold text-slate-900 dark:text-white">平台设置</h2>

    <div v-if="loading" class="py-4 text-center text-slate-400">加载中...</div>

    <div v-else class="space-y-4 max-w-lg">
      <div class="flex items-center justify-between p-4 rounded-lg border border-slate-200 dark:border-slate-700">
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">要求登录查看议题</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">开启后，未登录用户将无法查看议题列表和详情</p>
        </div>
        <button
          @click="requireLogin = !requireLogin"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors"
          :class="requireLogin ? 'bg-slate-900 dark:bg-slate-100' : 'bg-slate-200 dark:bg-slate-700'"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform"
            :class="requireLogin ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <button
        @click="save"
        :disabled="saving"
        class="px-4 py-2 text-sm font-medium rounded-lg bg-slate-900 text-white hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200 transition-colors disabled:opacity-50"
      >
        {{ saving ? '保存中...' : '保存' }}
      </button>
    </div>
  </div>
</template>
