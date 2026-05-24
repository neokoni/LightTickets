<script setup lang="ts">
import { onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import { Icon } from '@iconify/vue'
import { useTicketsStore } from '@/stores/tickets'
import { useAuthStore } from '@/stores/auth'
import { useLabelsStore } from '@/stores/labels'
import { usePolling } from '@/composables/usePolling'
import { usePagination } from '@/composables/usePagination'
import { timeAgo } from '@/utils/date'
import BasePagination from '@/components/base/BasePagination.vue'
import BaseBadge from '@/components/base/BaseBadge.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import type { TicketStatus } from '@/types/ticket'

const router = useRouter()
const route = useRoute()
const store = useTicketsStore()
const labels = useLabelsStore()
const auth = useAuthStore()

const statusTabs: { key: TicketStatus | 'all'; label: string; icon: string }[] = [
  { key: 'open', label: '开放', icon: 'lucide:circle-dot' },
  { key: 'in_progress', label: '处理中', icon: 'lucide:loader' },
  { key: 'resolved', label: '已解决', icon: 'lucide:check-circle-2' },
  { key: 'closed', label: '无效', icon: 'lucide:ban' },
  { key: 'all', label: '全部', icon: 'lucide:list' },
]

const { totalPages } = usePagination(
  () => store.total,
  () => store.filters.page || 1,
  () => store.filters.pageSize || 20,
)

function syncFromQuery() {
  const q = route.query
  if (q.status) store.filters.status = q.status as TicketStatus
  if (q.page) store.filters.page = Number(q.page)
  if (q.search) store.filters.search = q.search as string
}

function syncToQuery() {
  const query: Record<string, string> = {}
  if (store.filters.status) query.status = store.filters.status
  if (store.filters.page && store.filters.page > 1) query.page = String(store.filters.page)
  if (store.filters.search) query.search = store.filters.search
  router.replace({ query })
}

function setStatus(status: TicketStatus | 'all') {
  store.filters.status = status === 'all' ? undefined : status
  store.filters.page = 1
  syncToQuery()
  store.fetchList()
}

function setPage(page: number) {
  store.filters.page = page
  syncToQuery()
  store.fetchList()
}

onMounted(async () => {
  syncFromQuery()
  if (!labels.loaded) labels.fetch()
  await store.fetchList()
})

usePolling(() => store.fetchList(), 30000)

watch(() => store.filters.search, () => {
  store.filters.page = 1
  syncToQuery()
  store.fetchList()
})
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-xl font-bold text-slate-900 dark:text-white">议题</h1>
      <BaseButton v-if="auth.isAuthenticated" as="router-link" to="/tickets/new" size="sm" icon="lucide:plus">新建</BaseButton>
      <RouterLink v-else to="/login" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">登录以创建议题</RouterLink>
    </div>

    <!-- Status tabs -->
    <div class="flex items-center gap-1 border-b border-slate-200 dark:border-slate-700">
      <button
        v-for="tab in statusTabs"
        :key="tab.key"
        @click="setStatus(tab.key)"
        class="flex items-center gap-1.5 px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors"
        :class="(!store.filters.status && tab.key === 'all') || store.filters.status === tab.key
          ? 'border-slate-900 text-slate-800 dark:border-slate-100 dark:text-slate-200'
          : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'"
      >
        <Icon :icon="tab.icon" class="w-4 h-4" />
        {{ tab.label }}
      </button>
    </div>

    <!-- Search -->
    <div class="relative">
      <Icon icon="lucide:search" class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
      <input
        v-model="store.filters.search"
        type="text"
        placeholder="搜索议题..."
        class="w-full pl-9 pr-3 py-2 text-sm rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/40 focus:border-slate-900 dark:focus:ring-slate-100/40 dark:focus:border-slate-100 transition-colors"
      />
    </div>

    <!-- Ticket list -->
    <div v-if="store.loading && !store.tickets.length" class="py-12 text-center text-slate-400">
      <Icon icon="lucide:loader-2" class="w-6 h-6 mx-auto animate-spin" />
    </div>

    <div v-else-if="!store.tickets.length" class="py-12 text-center text-slate-400">
      暂无议题
    </div>

    <div v-else class="divide-y divide-slate-100 dark:divide-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg overflow-hidden">
      <RouterLink
        v-for="ticket in store.tickets"
        :key="ticket.id"
        :to="`/tickets/${ticket.id}`"
        class="flex items-start gap-3 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors"
      >
        <Icon
          :icon="ticket.status === 'open' ? 'lucide:circle-dot' : ticket.status === 'resolved' ? 'lucide:check-circle-2' : ticket.status === 'closed' ? 'lucide:ban' : ticket.status === 'in_progress' ? 'lucide:loader' : 'lucide:circle'"
          class="w-5 h-5 mt-0.5 shrink-0"
          :class="{
            'text-green-500': ticket.status === 'open',
            'text-purple-500': ticket.status === 'resolved',
            'text-slate-400': ticket.status === 'closed',
            'text-yellow-500': ticket.status === 'in_progress',
          }"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-slate-900 dark:text-white truncate">{{ ticket.title }}</span>
            <BaseBadge v-for="tl in ticket.labels" :key="tl.labelId" :color="tl.label.color">
              {{ tl.label.name }}
            </BaseBadge>
          </div>
          <div class="mt-1 text-xs text-slate-500 dark:text-slate-400 flex items-center gap-3">
            <span>{{ ticket.author.username }}</span>
            <span>{{ timeAgo(ticket.createdAt) }}</span>
            <span v-if="ticket._count?.comments" class="flex items-center gap-0.5">
              <Icon icon="lucide:message-square" class="w-3 h-3" />
              {{ ticket._count.comments }}
            </span>
          </div>
        </div>
      </RouterLink>
    </div>

    <BasePagination :page="store.filters.page || 1" :total-pages="totalPages" @update:page="setPage" />
  </div>
</template>
