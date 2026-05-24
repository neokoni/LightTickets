<script setup lang="ts">
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { Icon } from '@iconify/vue'
import { apiCreateTicket } from '@/api/tickets'
import { apiUploadAttachment } from '@/api/attachments'
import { useUiStore } from '@/stores/ui'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import type { TicketType } from '@/types/ticket'

const router = useRouter()
const ui = useUiStore()

const types: { key: TicketType; label: string; icon: string; desc: string }[] = [
  { key: 'bug_report', label: 'Bug 报告', icon: 'lucide:bug', desc: '报告游戏中的问题' },
  { key: 'permission_request', label: '权限申请', icon: 'lucide:shield', desc: '申请权限组或节点' },
  { key: 'suggestion', label: '建议', icon: 'lucide:lightbulb', desc: '提出改进建议' },
  { key: 'report', label: '举报', icon: 'lucide:flag', desc: '举报违规玩家' },
]

const selectedType = ref<TicketType | null>(null)
const title = ref('')
const body = ref('')
const files = ref<File[]>([])
const loading = ref(false)
const error = ref('')

function onFileChange(e: Event) {
  const input = e.target as HTMLInputElement
  if (input.files && input.files.length > 0) {
    files.value.push(...Array.from(input.files))
  }
  input.value = ''
}

function removeFile(index: number) {
  files.value.splice(index, 1)
}

async function submit() {
  if (!selectedType.value || !title.value.trim()) return
  error.value = ''
  loading.value = true
  try {
    const ticket = await apiCreateTicket({
      title: title.value.trim(),
      body: body.value,
      type: selectedType.value,
    })

    // Upload attachments after ticket creation
    if (files.value.length > 0) {
      await Promise.all(files.value.map(file => apiUploadAttachment(ticket.id, file)))
    }

    ui.toast('议题已创建', 'success')
    router.push(`/tickets/${ticket.id}`)
  } catch (e: any) {
    error.value = e.message || '创建失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-6">
    <h1 class="text-xl font-bold text-slate-900 dark:text-white">新建议题</h1>

    <!-- Type selection -->
    <div v-if="!selectedType" class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <button
        v-for="t in types"
        :key="t.key"
        @click="selectedType = t.key"
        class="flex items-start gap-3 p-4 rounded-lg border border-slate-200 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors text-left"
      >
        <Icon :icon="t.icon" class="w-5 h-5 text-slate-600 dark:text-slate-400 mt-0.5" />
        <div>
          <div class="font-medium text-slate-900 dark:text-white text-sm">{{ t.label }}</div>
          <div class="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{{ t.desc }}</div>
        </div>
      </button>
    </div>

    <!-- Form -->
    <form v-else @submit.prevent="submit" class="space-y-4">
      <div class="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
        <button type="button" @click="selectedType = null" class="hover:text-slate-700 dark:hover:text-slate-300">
          <Icon icon="lucide:arrow-left" class="w-4 h-4" />
        </button>
        <span>{{ types.find(t => t.key === selectedType)?.label }}</span>
      </div>

      <BaseInput v-model="title" label="标题" placeholder="简要描述问题" />
      <BaseTextarea v-model="body" label="详细描述" placeholder="支持 Markdown 格式" :rows="8" />

      <!-- Attachment upload -->
      <div class="space-y-2">
        <label class="block text-sm font-medium text-slate-700 dark:text-slate-300">附件</label>
        <div class="flex items-center gap-2">
          <input
            id="file-upload"
            type="file"
            multiple
            accept="image/*,.pdf,.txt,.zip,.log"
            @change="onFileChange"
            class="hidden"
          />
          <label
            for="file-upload"
            class="inline-flex items-center gap-1.5 px-3 py-2 text-sm rounded-lg border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 cursor-pointer transition-colors"
          >
            <Icon icon="lucide:paperclip" class="w-4 h-4" />
            上传文件
          </label>
        </div>
        <div v-if="files.length > 0" class="space-y-1">
          <div
            v-for="(file, idx) in files"
            :key="idx"
            class="flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700 text-sm"
          >
            <div class="flex items-center gap-2 min-w-0">
              <Icon icon="lucide:file" class="w-4 h-4 text-slate-400 shrink-0" />
              <span class="text-slate-700 dark:text-slate-300 truncate">{{ file.name }}</span>
              <span class="text-xs text-slate-400 shrink-0">{{ (file.size / 1024).toFixed(1) }} KB</span>
            </div>
            <button
              type="button"
              @click="removeFile(idx)"
              class="text-slate-400 hover:text-red-500 shrink-0"
            >
              <Icon icon="lucide:x" class="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>

      <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

      <div class="flex justify-end gap-2">
        <BaseButton variant="secondary" type="button" @click="router.back()">取消</BaseButton>
        <BaseButton type="submit" :loading="loading" :disabled="!title.trim()">提交议题</BaseButton>
      </div>
    </form>
  </div>
</template>
