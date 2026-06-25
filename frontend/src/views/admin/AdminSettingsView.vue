<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { getSiteConfig, updateSettings } from '@/api/setup'
import { setRequireLoginCache, siteConfig } from '@/router'
import { useUiStore } from '@/stores/ui'
import BaseButton from '@/components/base/BaseButton.vue'

const ui = useUiStore()
const requireLogin = ref(false)
const allowWebRegister = ref(true)
const siteName = ref('')
const siteUrl = ref('')
const footerContent = ref('')
const loading = ref(false)
const saving = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const config = await getSiteConfig()
    requireLogin.value = config.requireLogin
    siteName.value = config.siteName
    siteUrl.value = config.siteUrl ?? ''
    allowWebRegister.value = config.allowWebRegister ?? true
    footerContent.value = config.footerContent ?? ''
  } finally {
    loading.value = false
  }
})

async function save() {
  saving.value = true
  try {
    const result = await updateSettings({
      requireLogin: requireLogin.value,
      allowWebRegister: allowWebRegister.value,
      siteName: siteName.value,
      siteUrl: siteUrl.value || null,
      footerContent: footerContent.value || null,
    })
    setRequireLoginCache(result.requireLogin)
    siteConfig.siteName = result.siteName
    siteConfig.siteUrl = result.siteUrl
    siteConfig.footerContent = result.footerContent
    siteConfig.allowWebRegister = result.allowWebRegister
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
    <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">平台设置</h2>

    <div v-if="loading" class="py-4 text-center text-slate-400">加载中...</div>

    <div v-else class="space-y-4 max-w-lg">
      <!-- Site Name -->
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-slate-900 dark:text-white">站点名称</label>
        <input
          v-model="siteName"
          type="text"
          maxlength="100"
          class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
          placeholder="LightTickets"
        />
      </div>

      <!-- Site URL -->
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-slate-900 dark:text-white">站点地址</label>
        <input
          v-model="siteUrl"
          type="url"
          class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
          placeholder="https://ticket.example.com"
        />
      </div>

      <!-- Footer Content -->
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-slate-900 dark:text-white">页脚自定义内容</label>
        <p class="text-xs text-slate-500 dark:text-slate-400">支持 Markdown，可用于添加备案信息、版权声明等</p>
        <textarea
          v-model="footerContent"
          rows="3"
          maxlength="2000"
          class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
          placeholder="[京ICP备xxxxxxx号](https://beian.miit.gov.cn)"
        />
      </div>

      <!-- Allow Web Register Toggle -->
      <div class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">允许网页注册</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">关闭后登录页不显示注册入口，且网页注册接口将被禁用</p>
        </div>
        <button
          @click="allowWebRegister = !allowWebRegister"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition"
          :class="allowWebRegister ? 'bg-slate-900 dark:bg-slate-200' : 'bg-slate-200 dark:bg-slate-700'"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform dark:bg-slate-800"
            :class="allowWebRegister ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <!-- Require Login Toggle -->
      <div class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">要求登录查看议题</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">开启后，未登录用户将无法查看议题列表和详情</p>
        </div>
        <button
          @click="requireLogin = !requireLogin"
          class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition"
          :class="requireLogin ? 'bg-slate-900 dark:bg-slate-200' : 'bg-slate-200 dark:bg-slate-700'"
        >
          <span
            class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform dark:bg-slate-800"
            :class="requireLogin ? 'translate-x-5' : 'translate-x-0'"
          />
        </button>
      </div>

      <BaseButton filled :loading="saving" @click="save">{{ saving ? '保存中...' : '保存' }}</BaseButton>
    </div>
  </div>
</template>
