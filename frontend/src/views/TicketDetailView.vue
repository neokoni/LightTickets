<script setup lang="ts">
import { ref, onMounted, computed } from 'vue'
import { useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useTicketsStore } from '@/stores/tickets'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { usePolling } from '@/composables/usePolling'
import { useMarkdownUpload } from '@/composables/useMarkdownUpload'
import { renderTicketRefs } from '@/composables/ticketRef'
import { apiGetComments, apiCreateComment, apiUpdateCommentBody } from '@/api/comments'
import { timeAgo, formatDate } from '@/utils/date'
import { apiFetch } from '@/api/client'
import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseTextarea from '@/components/base/BaseTextarea.vue'
import MarkdownRenderer from '@/components/markdown/MarkdownRenderer.vue'
import TicketLabels from '@/components/tickets/TicketLabels.vue'
import type { Comment, AuditLog, TicketStatus, Priority } from '@/types/ticket'
import { apiGetTemplates } from '@/api/tickets'

const templateMap = ref<Record<string, string>>({})

const priorityLabels: Record<Priority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  critical: '紧急',
}

async function fetchTemplateNames() {
  try {
    const list = await apiGetTemplates()
    for (const t of list) {
      templateMap.value[t.name] = t.name_i18n
    }
  } catch { /* ignore */ }
}

function templateName(template: string): string {
  return templateMap.value[template] || template
}

const route = useRoute()
const store = useTicketsStore()
const auth = useAuthStore()
const ui = useUiStore()

const id = Number(route.params.id)
const comments = ref<Comment[]>([])
const newComment = ref('')
const submitting = ref(false)
const commentTextareaRef = ref<InstanceType<typeof BaseTextarea> | null>(null)
const mdUpload = useMarkdownUpload()

const ticket = computed(() => store.currentTicket)

const ticketBody = computed(() => ticket.value ? renderTicketRefs(ticket.value.body) : '')

const auditLogs = ref<AuditLog[]>([])

function isComment(item: Comment | AuditLog): item is Comment {
  return 'body' in item
}

const timeline = computed<(Comment | AuditLog)[]>(() => {
  const items: (Comment | AuditLog)[] = [
    ...comments.value,
    ...auditLogs.value,
  ]
  items.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime())
  return items
})

function eventLabel(item: AuditLog): string {
  if (item.action === 'status_change') {
    const hasComment = comments.value.some(c =>
      c.authorId === item.actorId &&
      Math.abs(new Date(c.createdAt).getTime() - new Date(item.createdAt).getTime()) < 10000
    )
    const prefix = hasComment ? '评论并' : ''
    if (item.newValue === 'resolved') {
      return item.actor.id === ticket.value?.authorId
        ? prefix + '关闭了此议题'
        : prefix + '关闭了此议题并标记为已完成'
    }
    if (item.newValue === 'open') return prefix + '重新打开了此议题'
    if (item.newValue === 'in_progress') return '开始处理此议题'
    if (item.newValue === 'closed') return '标记为不做计划'
  }
  const map: Record<string, string> = {
    assign: '变更了负责人',
    priority_change: '变更了优先级',
    permission_approved: '审批通过了权限',
    permission_rejected: '审批拒绝了权限',
    label_add: '添加了标签',
    label_remove: '移除了标签',
  }
  return map[item.action] || item.action
}

function eventIcon(item: AuditLog): string {
  if (item.action === 'status_change' && item.newValue) {
    return statusOptions.find(s => s.key === item.newValue)?.icon || 'lucide:circle'
  }
  const map: Record<string, string> = {
    assign: 'lucide:user-plus',
    priority_change: 'lucide:signal',
    permission_approved: 'lucide:check-check',
    permission_rejected: 'lucide:x-circle',
    label_add: 'lucide:tag',
    label_remove: 'lucide:tag-off',
  }
  return map[item.action] || 'lucide:dot'
}

function statusColor(status: string): string {
  const map: Record<string, string> = {
    open: 'text-green-500',
    in_progress: 'text-yellow-500',
    resolved: 'text-purple-500',
    closed: 'text-slate-400',
    rejected: 'text-red-500',
  }
  return map[status] || 'text-slate-400'
}

const statusOptions: { key: TicketStatus; label: string; icon: string }[] = [
  { key: 'open', label: '开放', icon: 'lucide:circle-dot' },
  { key: 'in_progress', label: '处理中', icon: 'lucide:loader' },
  { key: 'resolved', label: '已解决', icon: 'lucide:check-circle-2' },
  { key: 'closed', label: '无效', icon: 'lucide:ban' },
]

async function fetchComments() {
  const raw = await apiGetComments(id)
  comments.value = raw.map(c => ({ ...c, body: renderTicketRefs(c.body) }))
}

async function fetchAuditLogs() {
  try {
    auditLogs.value = await apiFetch<AuditLog[]>(`/tickets/${id}/audit`)
  } catch { /* ignore */ }
}

async function submitComment() {
  if (!newComment.value.trim()) return
  submitting.value = true
  try {
    const comment = await apiCreateComment(id, newComment.value)

    if (mdUpload.pendingFiles.value.size > 0) {
      const updatedBody = await mdUpload.uploadForComment(comment.body, id, comment.id)
      await apiUpdateCommentBody(id, comment.id, updatedBody)
      comment.body = updatedBody
    }

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

async function closeTicket() {
  submitting.value = true
  try {
    if (newComment.value.trim()) {
      const comment = await apiCreateComment(id, newComment.value)
      if (mdUpload.pendingFiles.value.size > 0) {
        const updatedBody = await mdUpload.uploadForComment(comment.body, id, comment.id)
        await apiUpdateCommentBody(id, comment.id, updatedBody)
        comment.body = updatedBody
      }
      comments.value.push(comment)
      newComment.value = ''
    }
    await store.closeTicket(id)
    await fetchAuditLogs()
    ui.toast('议题已关闭', 'success')
  } catch (e: any) {
    ui.toast(e.message || '操作失败', 'error')
  } finally {
    submitting.value = false
  }
}

async function reopenTicket() {
  submitting.value = true
  try {
    if (newComment.value.trim()) {
      const comment = await apiCreateComment(id, newComment.value)
      if (mdUpload.pendingFiles.value.size > 0) {
        const updatedBody = await mdUpload.uploadForComment(comment.body, id, comment.id)
        await apiUpdateCommentBody(id, comment.id, updatedBody)
        comment.body = updatedBody
      }
      comments.value.push(comment)
      newComment.value = ''
    }
    await store.reopenTicket(id)
    await fetchAuditLogs()
    ui.toast('议题已重新打开', 'success')
  } catch (e: any) {
    ui.toast(e.message || '操作失败', 'error')
  } finally {
    submitting.value = false
  }
}

onMounted(async () => {
  fetchTemplateNames()
  await Promise.all([store.fetchDetail(id), fetchComments(), fetchAuditLogs()])
})

usePolling(async () => {
  await Promise.all([store.fetchDetail(id), fetchComments(), fetchAuditLogs()])
}, 10000)

function onCommentFileDrop(e: DragEvent) {
  const textarea = commentTextareaRef.value?.$el?.querySelector('textarea') as HTMLTextAreaElement
  if (!textarea) return
  mdUpload.handleDrop(e, textarea, newComment)
}

function onCommentFilePaste(e: ClipboardEvent) {
  const textarea = commentTextareaRef.value?.$el?.querySelector('textarea') as HTMLTextAreaElement
  if (!textarea) return
  mdUpload.handlePaste(e, textarea, newComment)
}
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

          <div v-for="item in timeline" :key="item.id + ('body' in item ? '-comment' : '-audit')">
            <!-- Comment -->
            <div v-if="isComment(item)" class="flex gap-3 mb-4">
              <div class="w-8 h-8 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-600 dark:text-slate-300 shrink-0">
                {{ item.author.username.charAt(0).toUpperCase() }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 text-sm">
                  <span class="font-medium text-slate-900 dark:text-white">{{ item.author.username }}</span>
                  <span class="text-slate-400 text-xs">{{ timeAgo(item.createdAt) }}</span>
                  <BaseBadge v-if="item.source === 'minecraft'" color="#4ade80">MC</BaseBadge>
                </div>
                <div class="mt-1 text-sm text-slate-700 dark:text-slate-300">
                  <MarkdownRenderer :content="item.body" />
                </div>
              </div>
            </div>

            <!-- Audit event -->
            <div v-else class="flex items-center gap-2 py-2 text-sm text-slate-500 dark:text-slate-400">
              <Icon
                :icon="eventIcon(item)"
                class="w-3.5 h-3.5 shrink-0"
                :class="item.action === 'status_change' && item.newValue ? statusColor(item.newValue) : ''"
              />
              <span class="font-medium text-slate-600 dark:text-slate-300">{{ item.actor.username }}</span>
              <span>{{ eventLabel(item) }}</span>
              <span v-if="item.action !== 'status_change' && (item.oldValue || item.newValue)" class="flex items-center gap-1">
                <span v-if="item.oldValue" class="line-through opacity-60">{{ item.oldValue }}</span>
                <Icon v-if="item.oldValue && item.newValue" icon="lucide:arrow-right" class="w-3 h-3" />
                <span v-if="item.newValue">{{ item.newValue }}</span>
              </span>
              <span class="text-xs text-slate-400">{{ timeAgo(item.createdAt) }}</span>
            </div>
          </div>

          <!-- Comment form -->
          <form v-if="auth.isAuthenticated" @submit.prevent="submitComment" class="space-y-3">
            <BaseTextarea
              ref="commentTextareaRef"
              v-model="newComment"
              placeholder="添加评论... (支持 Markdown)"
              :rows="3"
              uploadable
              @file-drop="onCommentFileDrop"
              @file-paste="onCommentFilePaste"
            />
            <div v-if="mdUpload.pendingFiles.value.size > 0" class="flex flex-wrap gap-2">
              <div
                v-for="[url, file] in mdUpload.pendingFiles.value"
                :key="url"
                class="flex items-center gap-1.5 px-2 py-1 text-xs rounded-md bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700"
              >
                <Icon icon="lucide:image" class="w-3 h-3 text-slate-400" />
                <span class="text-slate-600 dark:text-slate-300 truncate max-w-[120px]">{{ file.name }}</span>
                <button type="button" @click="mdUpload.removePending(url)" class="text-slate-400 hover:text-red-500">
                  <Icon icon="lucide:x" class="w-3 h-3" />
                </button>
              </div>
            </div>
            <div class="flex justify-end items-center gap-1.5">
              <BaseButton
                v-if="ticket.authorId === auth.user?.id && (ticket.status === 'open' || ticket.status === 'in_progress')"
                size="sm"
                icon="lucide:check-circle-2"
                @click="closeTicket"
              >
                {{ newComment.trim() ? '评论并关闭' : '关闭议题' }}
              </BaseButton>
              <BaseButton
                v-if="auth.isStaff && (ticket.status === 'open' || ticket.status === 'in_progress') && ticket.authorId !== auth.user?.id"
                size="sm"
                icon="lucide:check-circle-2"
                @click="closeTicket"
              >
                {{ newComment.trim() ? '评论并已完成关闭' : '已完成关闭' }}
              </BaseButton>
              <BaseButton
                v-if="(ticket.authorId === auth.user?.id && ticket.status === 'resolved') || (auth.isStaff && (ticket.status === 'resolved' || ticket.status === 'closed'))"
                size="sm"
                icon="lucide:rotate-ccw"
                @click="reopenTicket"
              >
                {{ newComment.trim() ? '评论并重新打开' : '重新打开' }}
              </BaseButton>
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

          <!-- Staff status change buttons -->
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
            <span class="text-slate-700 dark:text-slate-300">{{ templateName(ticket.template) }}</span>
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

        <!-- Permission request actions -->
        <div v-if="ticket.template === 'permission_request' && ticket.permissionRequest && auth.isStaff" class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-3">
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
