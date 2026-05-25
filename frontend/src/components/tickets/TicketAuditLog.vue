<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { apiFetch } from '@/api/client'
import { timeAgo } from '@/utils/date'
import type { AuditLog } from '@/types/ticket'

const props = defineProps<{
  ticketId: string
}>()

const logs = ref<AuditLog[]>([])
const loading = ref(false)

async function fetchLogs() {
  loading.value = true
  try {
    logs.value = await apiFetch<AuditLog[]>(`/tickets/${props.ticketId}/audit`)
  } finally {
    loading.value = false
  }
}

function actionLabel(action: string): string {
  const map: Record<string, string> = {
    status_change: '状态变更',
    assign: '分配',
    priority_change: '优先级变更',
    permission_approved: '权限审批通过',
    permission_rejected: '权限审批拒绝',
    label_add: '添加标签',
    label_remove: '移除标签',
  }
  return map[action] || action
}

onMounted(fetchLogs)
</script>

<template>
  <div class="space-y-3">
    <h3 class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">操作历史</h3>
    <div v-if="loading" class="text-sm text-slate-400 animate-pulse">加载中...</div>

    <div v-else-if="logs.length === 0" class="text-sm text-slate-400">暂无历史记录</div>

    <div v-else class="space-y-3">
      <div
        v-for="log in logs"
        :key="log.id"
        class="flex gap-3 text-sm"
      >
        <div class="w-6 flex justify-center pt-1 shrink-0">
          <div class="w-1.5 h-1.5 rounded-full bg-slate-300 dark:bg-slate-600" />
        </div>
        <div class="flex-1 min-w-0 pb-3 border-l border-slate-200 dark:border-slate-800 pl-3 -ml-px">
          <div class="text-slate-700 dark:text-slate-300">
            <span class="font-medium">{{ log.actor.username }}</span>
            {{ actionLabel(log.action) }}
          </div>
          <div v-if="log.oldValue || log.newValue" class="mt-1 flex items-center gap-1.5 text-xs text-slate-500 dark:text-slate-400">
            <span v-if="log.oldValue" class="line-through opacity-60">{{ log.oldValue }}</span>
            <Icon v-if="log.oldValue && log.newValue" icon="lucide:arrow-right" class="w-3 h-3" />
            <span v-if="log.newValue">{{ log.newValue }}</span>
          </div>
          <span class="text-xs text-slate-400 mt-0.5">{{ timeAgo(log.createdAt) }}</span>
        </div>
      </div>
    </div>
  </div>
</template>

