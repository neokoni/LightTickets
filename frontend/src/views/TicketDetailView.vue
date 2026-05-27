<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useTicketsStore } from '@/stores/tickets'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { usePolling } from '@/composables/usePolling'
import { renderTicketRefs } from '@/composables/useTicketRef'
import { apiGetComments, apiCreateComment } from '@/api/comments'
import { timeAgo, formatDate } from '@/utils/date'
import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer.vue'
import TicketLabels from '@/components/tickets/TicketLabels.vue'
import TicketAuditLog from '@/components/tickets/TicketAuditLog.vue'
import type { Comment, TicketStatus, TicketType, Priority } from '@/types/ticket'

const typeLabels: Record<TicketType, string> = {
  bug_report: 'Bug 报告',
  permission_request: '权限申请',
  suggestion: '建议',
  report: '举报',
}

const priorityLabels: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '紧急',
}

const route = useRoute()
const store = useTicketsStore()
const auth = useAuthStore()
const ui = useUiStore()

const id = Number(route.params.id)
const comments = ref<Comment[]>([])
const newComment = ref('')
const submitting = ref(false)

const ticket = computed(() => store.currentTicket)

const ticketBody = computed(() => ticket.value ? renderTicketRefs(ticket.value.body) : '')

function commentBody(comment: Comment): string {
  return renderTicketRefs(comment.body)
}

const statusOptions: { key: TicketStatus; label: string; icon: string }[] = [
  { key: 'open', label: '开放', icon: 'lucide:circle-dot' },
  { key: 'in_progress', label: '处理中', icon: 'lucide:loader' },
  { key: 'resolved', label: '已解决', icon: 'lucide:check-circle-2' },
  { key: 'closed', label: '无效', icon: 'lucide:ban' },
]

async function fetchComments() {
  comments.value = await apiGetComments(id)
}

async function submitComment() {
  if (!newComment.value.trim()) return
  submitting.value = true
  try {
    const comment = await apiCreateComment(id, newComment.value)
    comments.value.push(comment)
    newComment.value = ''
  } catch (e: any) {
    ui.toast(e.message || '评论失败', 'error')
  } finally {
    submitting.value = false
  }
}

async function changeStatus(status: TicketStatus) {
  try {
    await store.updateStatus(id, status)
    ui.toast('状态已更新', 'success')
  } catch (e: any) {
    ui.toast(e.message || '操作失败', 'error')
  }
}

async function approveTicket() {
  try {
    await store.approve(id)
    ui.toast('已批准', 'success')
  } catch (e: any) {
    ui.toast(e.message || '操作失败', 'error')
  }
}

async function rejectTicket() {
  try {
    await store.reject(id)
    ui.toast('已拒绝', 'success')
  } catch (e: any) {
    ui.toast(e.message || '操作失败', 'error')
  }
}

onMounted(async () => {
  await Promise.all([store.fetchDetail(id), fetchComments()])
})

usePolling(async () => {
  await Promise.all([store.fetchDetail(id), fetchComments()])
}, 10000)
</script>

<template>
  <div v-if="!ticket" class="py-12 text-center text-slate-400">
    <Icon icon="lucide:loader-2" class="w-6 h-6 mx-auto animate-spin" />
  </div>

  <div v-else class="space-y-6">
    <!-- Header (full width, like GitHub issue title) -->
    <div>
      <h1 class="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">{{ ticket.title }}</h1>
      <div class="mt-2 flex items-center gap-3 text-sm text-slate-500 dark:text-slate-400">
        <span>{{ ticket.author.username }}</span>
        <span :title="formatDate(ticket.createdAt)">{{ timeAgo(ticket.createdAt) }}</span>
        <BaseBadge v-for="tl in ticket.labels" :key="tl.labelId" :color="tl.label.color">{{ tl.label.name }}</BaseBadge>
      </div>
    </div>

    <!-- Content + Sidebar (two columns below title) -->
    <div class="flex flex-col lg:flex-row lg:items-start gap-6">
      <!-- Main content -->
      <div class="flex-1 min-w-0 space-y-6">
        <!-- Body -->
        <div class="p-6 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur">
          <MarkdownRenderer :content="ticketBody" />
        </div>

        <!-- Comments -->
        <div class="space-y-4">
          <h2 class="text-sm font-semibold text-slate-900 dark:text-slate-100">评论 ({{ comments.length }})</h2>

          <div v-for="comment in comments" :key="comment.id" class="flex gap-3">
            <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">
              {{ comment.author.username.charAt(0).toUpperCase() }}
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2 text-sm">
                <span class="font-medium text-slate-900 dark:text-white">{{ comment.author.username }}</span>
                <span class="text-slate-400 text-xs">{{ timeAgo(comment.createdAt) }}</span>
                <BaseBadge v-if="comment.source === 'minecraft'" color="#4ade80">MC</BaseBadge>
              </div>
              <div class="mt-1 text-sm text-slate-700 dark:text-slate-300">
                <MarkdownRenderer :content="commentBody(comment)" />
              </div>
            </div>
          </div>

          <!-- Comment form -->
          <form v-if="auth.isAuthenticated" @submit.prevent="submitComment" class="space-y-3">
            <BaseTextarea v-model="newComment" placeholder="添加评论... (支持 Markdown)" :rows="3" />
            <div class="flex justify-end">
              <BaseButton type="submit" size="sm" :loading="submitting" :disabled="!newComment.trim()">发送</BaseButton>
            </div>
          </form>
        </div>
      </div>

      <!-- Sidebar -->
      <aside class="space-y-4 lg:w-[280px] lg:shrink-0">
        <!-- Status -->
        <div class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-3">
          <h3 class="text-xs font-semibold tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400">状态</h3>
          <div class="flex items-center gap-2">
            <Icon
              :icon="statusOptions.find(s => s.key === ticket!.status)?.icon || 'lucide:ban'"
              class="w-4 h-4"
              :class="{
                'text-green-500': ticket.status === 'open',
                'text-yellow-500': ticket.status === 'in_progress',
                'text-purple-500': ticket.status === 'resolved',
                'text-slate-400': ticket.status === 'closed',
              }"
            />
            <span class="text-sm font-medium text-slate-700 dark:text-slate-300">
              {{ statusOptions.find(s => s.key === ticket!.status)?.label }}
            </span>
          </div>

          <!-- Staff actions -->
          <div v-if="auth.isStaff" class="flex flex-wrap gap-1.5 pt-2 border-t border-slate-200 dark:border-slate-800">
            <BaseButton
              v-for="opt in statusOptions.filter(s => s.key !== ticket!.status)"
              :key="opt.key"
              size="sm"
              @click="changeStatus(opt.key)"
            >
              {{ opt.label }}
            </BaseButton>
          </div>
        </div>

        <!-- Info -->
        <div class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-3 text-sm">
          <div class="flex justify-between">
            <span class="text-slate-500 dark:text-slate-400">类型</span>
            <span class="text-slate-700 dark:text-slate-300">{{ typeLabels[ticket.type] }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-slate-500 dark:text-slate-400">优先级</span>
            <span class="text-slate-700 dark:text-slate-300">{{ priorityLabels[ticket.priority] }}</span>
          </div>
          <div v-if="ticket.assignee" class="flex justify-between">
            <span class="text-slate-500 dark:text-slate-400">负责人</span>
            <span class="text-slate-700 dark:text-slate-300">{{ ticket.assignee.username }}</span>
          </div>
          <div v-if="ticket.server" class="flex justify-between">
            <span class="text-slate-500 dark:text-slate-400">服务器</span>
            <span class="text-slate-700 dark:text-slate-300">{{ ticket.server.name }}</span>
          </div>
        </div>

        <!-- Labels -->
        <TicketLabels v-if="ticket" :ticket="ticket" />

        <!-- Audit Log -->
        <div class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-2">
          <TicketAuditLog :ticket-id="ticket.id" />
        </div>

        <!-- Permission request actions -->
        <div v-if="ticket.type === 'permission_request' && ticket.permissionRequest && auth.isStaff" class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-3">
          <h3 class="text-xs font-semibold tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400">权限操作</h3>
          <div class="text-sm text-slate-600 dark:text-slate-400">
            <span v-if="ticket.permissionRequest.groupName">组: {{ ticket.permissionRequest.groupName }}</span>
            <span v-if="ticket.permissionRequest.permissionNode">节点: {{ ticket.permissionRequest.permissionNode }}</span>
          </div>
          <div v-if="ticket.status === 'open' || ticket.status === 'in_progress'" class="flex gap-2">
            <BaseButton filled size="sm" @click="approveTicket">批准</BaseButton>
            <BaseButton size="sm" variant="danger" @click="rejectTicket">拒绝</BaseButton>
          </div>
          <div v-else-if="ticket.permissionRequest.executionStatus" class="text-xs text-slate-500">
            执行状态: {{ ticket.permissionRequest.executionStatus }}
          </div>
        </div>
      </aside>
    </div>
  </div>
</template>
