<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { apiGetServers, apiCreateServer, apiRegenerateKey, apiDeleteServer } from '@/api/servers'
import { useUiStore } from '@/stores/ui'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseModal from '@/components/base/BaseModal.vue'
import type { Server } from '@/types/user'

const ui = useUiStore()
const servers = ref<Server[]>([])
const showModal = ref(false)
const form = ref({ name: '', address: '', description: '' })

async function fetchServers() {
  servers.value = await apiGetServers()
}

async function create() {
  try {
    const server = await apiCreateServer(form.value)
    servers.value.push(server)
    showModal.value = false
    form.value = { name: '', address: '', description: '' }
    ui.toast('服务器已创建', 'success')
  } catch (e: any) {
    ui.toast(e.message || '创建失败', 'error')
  }
}

async function regenerate(id: string) {
  try {
    const { apiKey } = await apiRegenerateKey(id)
    const idx = servers.value.findIndex(s => s.id === id)
    if (idx !== -1) servers.value[idx].apiKey = apiKey
    ui.toast('API Key 已重新生成', 'success')
  } catch (e: any) {
    ui.toast(e.message || '操作失败', 'error')
  }
}

async function remove(id: string) {
  if (!confirm('确定删除此服务器？')) return
  try {
    await apiDeleteServer(id)
    servers.value = servers.value.filter(s => s.id !== id)
    ui.toast('服务器已删除', 'success')
  } catch (e: any) {
    ui.toast(e.message || '删除失败', 'error')
  }
}

const copiedId = ref<string | null>(null)

async function copyToClipboard(server: Server) {
  try {
    await navigator.clipboard.writeText(server.apiKey)
    copiedId.value = server.id
    setTimeout(() => {
      if (copiedId.value === server.id) {
        copiedId.value = null
      }
    }, 2000)
    ui.toast('API Key 已复制到剪贴板', 'success')
  } catch (e: any) {
    ui.toast('复制失败', 'error')
  }
}

onMounted(fetchServers)
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">服务器管理</h2>
      <BaseButton size="sm" icon="lucide:plus" @click="showModal = true">添加服务器</BaseButton>
    </div>

    <div class="space-y-3">
      <div v-for="server in servers" :key="server.id" class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-2">
        <div class="flex items-center justify-between">
          <div>
            <h3 class="font-medium text-slate-900 dark:text-white">{{ server.name }}</h3>
            <p v-if="server.address" class="text-xs text-slate-500">{{ server.address }}</p>
          </div>
          <div class="flex gap-1">
            <button @click="regenerate(server.id)" class="p-1.5 rounded text-slate-400 hover:text-slate-700 dark:hover:text-slate-200" title="重新生成 Key">
              <Icon icon="lucide:refresh-cw" class="w-4 h-4" />
            </button>
            <button @click="remove(server.id)" class="p-1.5 rounded text-slate-400 hover:text-red-500" title="删除">
              <Icon icon="lucide:trash-2" class="w-4 h-4" />
            </button>
          </div>
        </div>
        <div class="relative flex items-center gap-2 group">
          <code class="flex-1 px-3 py-3 pr-12 text-xs bg-slate-100 dark:bg-slate-800 rounded-md font-mono truncate">{{ server.apiKey }}</code>
          <button @click="copyToClipboard(server)" :class="[
            'absolute right-3 top-1/2 -translate-y-1/2 w-8 h-8 p-1.5 rounded-lg bg-slate-200 dark:bg-slate-700 hover:bg-slate-300 dark:hover:bg-slate-600 opacity-0 group-hover:opacity-100 transition-opacity',
            copiedId === server.id ? 'text-green-500 dark:text-green-400' : 'text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'
          ]" title="复制 Key">
            <Icon :icon="copiedId === server.id ? 'lucide:check' : 'lucide:clipboard-copy'" class="w-[18px] h-[18px]" />
          </button>
        </div>
      </div>
      <div v-if="!servers.length" class="py-8 text-center text-sm text-slate-500 dark:text-slate-400">暂无服务器</div>
    </div>

    <BaseModal v-model="showModal" title="添加服务器">
      <form @submit.prevent="create" class="space-y-4">
        <BaseInput v-model="form.name" label="名称" placeholder="主服务器" />
        <BaseInput v-model="form.address" label="地址（可选）" placeholder="play.example.com" />
        <BaseInput v-model="form.description" label="描述（可选）" />
        <div class="flex justify-end gap-2">
          <BaseButton type="button" @click="showModal = false">取消</BaseButton>
          <BaseButton filled type="submit" :disabled="!form.name.trim()">创建</BaseButton>
        </div>
      </form>
    </BaseModal>
  </div>
</template>

