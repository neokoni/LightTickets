<script setup lang="ts">
import { ref, computed, onMounted, watch, nextTick } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { Icon } from '@iconify/vue';
import { useTicketsStore } from '@/stores/tickets';
import { useAuthStore } from '@/stores/auth';
import { useLabelsStore } from '@/stores/labels';
import { usePolling } from '@/composables/usePolling';
import { usePagination } from '@/composables/usePagination';
import { timeAgo } from '@/utils/date';
import { apiGetTemplates } from '@/api/tickets';
import { apiGetServers } from '@/api/servers';
import {
  tokenize,
  parseQuery,
  getSuggestions,
  applySuggestion,
  removeFilterToken,
  getFilterValuePreview,
  FILTER_COLORS,
  type SearchToken,
  type SuggestionResult,
} from '@/utils/useTicketSearch';
import type { TemplateSummary } from '@/types/ticket';
import type { Server } from '@/types/user';
import type { TicketStatus } from '@/types/ticket';
import { STATUS_META } from '@/types/ticket';
import BasePagination from '@/components/base/BasePagination.vue';
import BaseBadge from '@/components/base/BaseBadge.vue';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import UserAvatar from '@/components/base/UserAvatar.vue';

const router = useRouter();
const route = useRoute();
const store = useTicketsStore();
const labelsStore = useLabelsStore();
const auth = useAuthStore();

const templates = ref<TemplateSummary[]>([]);
const servers = ref<Server[]>([]);

const searchRaw = ref('');
const searchInput = ref<InstanceType<typeof BaseInput> | null>(null);
const cursorPos = ref(0);
const suggestions = ref<SuggestionResult | null>(null);
const selectedSuggestionIdx = ref(0);
// True once the user explicitly navigates the list (Arrow keys). Until then, a
// freshly-opened value list with no typed value should not auto-commit on Tab —
// otherwise completing a key (e.g. "status:") and pressing Tab again would
// immediately fill the first value ("status:open") instead of just the key.
const suggestionNavigated = ref(false);
const tabButtonClass =
  '!px-3 !py-2 !rounded-none border-none -mb-px text-sm font-medium transition whitespace-nowrap shrink-0';
const chipButtonClass = '!px-0 !py-0 border-none ml-0.5 hover:opacity-70';
const suggestionButtonClass =
  '!w-full !justify-start !px-3 !py-1.5 border-none text-sm text-left transition cursor-pointer';

const tabStatus = ref<TicketStatus | undefined>();

// Whether the highlighted suggestion is "armed" — i.e. Tab/Enter would commit
// it. A freshly-opened value list with no typed value and no navigation is not
// armed, so we avoid highlighting an item the user didn't ask for yet.
const suggestionArmed = computed(() => {
  const s = suggestions.value;
  if (!s) return false;
  if (s.type === 'key') return true;
  return !!s.partialValue || suggestionNavigated.value;
});

const tokens = computed(() => tokenize(searchRaw.value));
const filterTokens = computed(() => tokens.value.filter((t) => t.type === 'filter' && !t.error));
const hasActiveFilters = computed(() => filterTokens.value.length > 0);

const statusTabs: { key: TicketStatus | 'all'; label: string; icon: string }[] = [
  { key: 'all', label: '全部', icon: 'lucide:list' },
  ...Object.entries(STATUS_META).map(([key, { label, icon }]) => ({
    key: key as TicketStatus,
    label,
    icon,
  })),
];

const { totalPages } = usePagination(
  () => store.total,
  () => store.filters.page || 1,
  () => store.filters.pageSize || 20,
);

function syncFromQuery() {
  const q = route.query;
  if (q.statuses) {
    const raw = (Array.isArray(q.statuses) ? q.statuses[0] : q.statuses) as string;
    const arr = (raw || '').split(',').filter(Boolean) as TicketStatus[];
    if (arr.length === 1) tabStatus.value = arr[0];
  }
  if (q.type) store.filters.type = q.type as string;
  if (q.labelId) store.filters.labelId = q.labelId as string;
  if (q.serverId) store.filters.serverId = q.serverId as string;
  if (q.hasServer !== undefined) store.filters.hasServer = q.hasServer === 'true';
  if (q.authorName) store.filters.authorName = q.authorName as string;
  if (q.page) store.filters.page = Number(q.page);
  if (q.search) {
    searchRaw.value = q.search as string;
  } else if (q.type || q.labelId || q.serverId || q.hasServer !== undefined || q.authorName) {
    searchRaw.value = buildSearchFromQuery(q);
  }
}

function buildSearchFromQuery(q: Record<string, unknown>): string {
  const parts: string[] = [];
  if (q.type) parts.push(`type:${q.type}`);
  if (q.labelId) {
    const label = labelsStore.labels.find((l) => l.id === q.labelId);
    if (label) parts.push(`label:${label.name}`);
  }
  if (q.serverId) {
    const server = servers.value.find((s) => s.id === q.serverId);
    if (server) parts.push(`from:minecraft:${server.name}`);
  } else if (q.hasServer === 'true') {
    parts.push('from:minecraft');
  } else if (q.hasServer === 'false') {
    parts.push('from:web');
  }
  if (q.authorName) parts.push(`author:${q.authorName}`);
  return parts.join(' ');
}

function syncToQuery() {
  const query: Record<string, string> = {};
  if (store.filters.statuses && store.filters.statuses.length > 0)
    query.statuses = store.filters.statuses.join(',');
  if (store.filters.type) query.type = store.filters.type;
  if (store.filters.labelId) query.labelId = store.filters.labelId;
  if (store.filters.serverId) query.serverId = store.filters.serverId;
  if (store.filters.hasServer !== undefined) query.hasServer = String(store.filters.hasServer);
  if (store.filters.authorName) query.authorName = store.filters.authorName;
  if (store.filters.page && store.filters.page > 1) query.page = String(store.filters.page);
  if (searchRaw.value) query.search = searchRaw.value;
  router.replace({ query });
}

function setStatus(status: TicketStatus | 'all') {
  tabStatus.value = status === 'all' ? undefined : status;
  applyFilters();
}

function applyFilters() {
  const parsed = parseQuery(searchRaw.value, labelsStore.labels, templates.value, servers.value);

  const searchStatuses = parsed.statuses;
  if (tabStatus.value && searchStatuses) {
    store.filters.statuses = searchStatuses.filter((s) => s === tabStatus.value);
  } else {
    store.filters.statuses = tabStatus.value ? [tabStatus.value] : searchStatuses;
  }

  store.filters.type = parsed.type;
  store.filters.labelId = parsed.labelId;
  store.filters.serverId = parsed.serverId;
  store.filters.hasServer = parsed.hasServer;
  store.filters.authorName = parsed.authorName;
  store.filters.search = parsed.search;
  store.filters.page = 1;
  syncToQuery();
  store.fetchList();
}

function setPage(page: number) {
  store.filters.page = page;
  syncToQuery();
  store.fetchList();
}

function onSearchInput(e: Event) {
  const input = e.target as HTMLInputElement;
  cursorPos.value = input.selectionStart ?? 0;
  updateSuggestions();
}

function onSearchKeydown(e: KeyboardEvent) {
  if (e.key === 'Tab' && suggestions.value && suggestions.value.items.length > 0) {
    e.preventDefault();
    // A just-opened value list (key completed, no value typed yet, user hasn't
    // arrowed) should not auto-commit its first item — Tab here just completed
    // the key, so leave the value for the user to pick.
    if (
      suggestions.value.type === 'value' &&
      !suggestions.value.partialValue &&
      !suggestionNavigated.value
    ) {
      return;
    }
    const idx = selectedSuggestionIdx.value;
    const item = suggestions.value.items[idx];
    if (item) {
      const result = applySuggestion(
        searchRaw.value,
        cursorPos.value,
        item.value,
        suggestions.value.type,
      );
      searchRaw.value = result.text;
      cursorPos.value = result.cursorPos;
      suggestions.value = null;
      nextTick(() => {
        if (searchInput.value) {
          searchInput.value.setSelectionRange(result.cursorPos, result.cursorPos);
          searchInput.value.focus();
        }
        updateSuggestions();
      });
    }
  } else if (e.key === 'ArrowDown' && suggestions.value) {
    e.preventDefault();
    suggestionNavigated.value = true;
    selectedSuggestionIdx.value = Math.min(
      selectedSuggestionIdx.value + 1,
      suggestions.value.items.length - 1,
    );
  } else if (e.key === 'ArrowUp' && suggestions.value) {
    e.preventDefault();
    suggestionNavigated.value = true;
    selectedSuggestionIdx.value = Math.max(selectedSuggestionIdx.value - 1, 0);
  } else if (e.key === 'Escape') {
    suggestions.value = null;
  } else if (e.key === 'Enter') {
    suggestions.value = null;
  }
}

function updateSuggestions() {
  selectedSuggestionIdx.value = 0;
  suggestionNavigated.value = false;
  suggestions.value = getSuggestions(
    searchRaw.value,
    cursorPos.value,
    labelsStore.labels,
    templates.value,
    servers.value,
  );
}

function onSearchBlur() {
  setTimeout(() => {
    suggestions.value = null;
  }, 150);
}

function clickSuggestion(item: { value: string; label: string }) {
  if (!suggestions.value) return;
  const result = applySuggestion(
    searchRaw.value,
    cursorPos.value,
    item.value,
    suggestions.value.type,
  );
  searchRaw.value = result.text;
  cursorPos.value = result.cursorPos;
  suggestions.value = null;
  nextTick(() => {
    if (searchInput.value) {
      searchInput.value.setSelectionRange(result.cursorPos, result.cursorPos);
      searchInput.value.focus();
    }
  });
}

function removeFilter(token: SearchToken) {
  if (!token.key) return;
  searchRaw.value = removeFilterToken(searchRaw.value, token.key, token.value);
  applyFilters();
}

function getFilterLabel(token: SearchToken): string {
  if (!token.key || !token.value) return token.raw;
  const label = getFilterValuePreview(
    token.key,
    token.value,
    labelsStore.labels,
    templates.value,
    servers.value,
  );
  const keyLabel: Record<string, string> = {
    status: '状态',
    type: '类型',
    label: '标签',
    from: '来源',
    author: '作者',
  };
  return `${keyLabel[token.key] || token.key}: ${label}`;
}

onMounted(async () => {
  syncFromQuery();
  if (!labelsStore.loaded) labelsStore.fetchList().catch(() => {});
  try {
    templates.value = await apiGetTemplates();
  } catch {
    /* ignore */
  }
  try {
    servers.value = await apiGetServers();
  } catch {
    /* ignore */
  }
  if (searchRaw.value) {
    applyFilters();
  } else {
    await store.fetchList();
  }
});

usePolling(() => store.fetchList(), 30000);

watch(searchRaw, () => {
  applyFilters();
});

watch(
  () => labelsStore.labels,
  () => {
    updateSuggestions();
  },
  { deep: true },
);
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h1 class="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">
        议题
      </h1>
      <BaseButton
        v-if="auth.isAuthenticated"
        as="router-link"
        to="/tickets/new"
        size="sm"
        icon="lucide:plus"
        >新建</BaseButton
      >
      <RouterLink
        v-else
        to="/login"
        class="text-sm font-medium text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition"
        >登录以创建议题</RouterLink
      >
    </div>

    <!-- Status tabs -->
    <div
      class="status-tabs-scroll flex items-center gap-1 border-b border-slate-200 dark:border-slate-800 overflow-x-auto"
    >
      <BaseButton
        v-for="tab in statusTabs"
        :key="tab.key"
        :has-hover="false"
        :class="[
          tabButtonClass,
          'nav-link',
          (!tabStatus && tab.key === 'all') || tabStatus === tab.key
            ? 'nav-link-active'
            : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300',
        ]"
        @click="setStatus(tab.key)"
      >
        <span class="nav-link-text inline-flex items-center gap-1.5">
          <Icon :icon="tab.icon" class="w-4 h-4" />
          {{ tab.label }}
        </span>
      </BaseButton>
    </div>

    <!-- Search with filter chips -->
    <div class="space-y-2">
      <!-- Filter chips -->
      <div v-if="filterTokens.length" class="flex items-center gap-1.5 flex-wrap">
        <span
          v-for="token in filterTokens"
          :key="token.raw"
          :class="[
            'inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-md border',
            (FILTER_COLORS[token.filterType || 'status'] || FILTER_COLORS.status).bg,
            (FILTER_COLORS[token.filterType || 'status'] || FILTER_COLORS.status).text,
            (FILTER_COLORS[token.filterType || 'status'] || FILTER_COLORS.status).border,
          ]"
        >
          {{ getFilterLabel(token) }}
          <BaseButton :class="chipButtonClass" @click="removeFilter(token)">
            <Icon icon="lucide:x" class="w-3 h-3" />
          </BaseButton>
        </span>
      </div>

      <!-- Search input -->
      <div class="relative">
        <Icon
          icon="lucide:search"
          class="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 pointer-events-none"
          :class="hasActiveFilters ? 'text-blue-500 dark:text-blue-400' : 'text-slate-400'"
        />
        <BaseInput
          ref="searchInput"
          v-model="searchRaw"
          placeholder="搜索议题..."
          class="[&_input]:pl-9"
          :class="
            hasActiveFilters
              ? '[&_input]:ring-1 [&_input]:ring-blue-500/30 [&_input]:border-blue-300 dark:[&_input]:border-blue-700'
              : ''
          "
          @input="onSearchInput"
          @keydown="onSearchKeydown"
          @blur="onSearchBlur"
          @click="onSearchInput"
        />

        <!-- Suggestions dropdown -->
        <Transition
          enter-active-class="transition duration-100 ease-out"
          enter-from-class="opacity-0 -translate-y-1"
          enter-to-class="opacity-100 translate-y-0"
          leave-active-class="transition duration-75 ease-in"
          leave-from-class="opacity-100 translate-y-0"
          leave-to-class="opacity-0 -translate-y-1"
        >
          <div
            v-if="suggestions && suggestions.items.length"
            class="absolute z-50 top-full mt-1 left-0 right-0 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden"
          >
            <div
              class="text-[11px] px-3 py-1.5 text-slate-400 dark:text-slate-500 border-b border-slate-100 dark:border-slate-800"
            >
              {{
                suggestions.type === 'key'
                  ? '筛选条件'
                  : suggestions.key
                    ? `筛选: ${suggestions.key}`
                    : ''
              }}
            </div>
            <div class="py-1 max-h-48 overflow-y-auto">
              <BaseButton
                v-for="(item, idx) in suggestions.items"
                :key="item.value"
                :class="[
                  suggestionButtonClass,
                  suggestionArmed && idx === selectedSuggestionIdx
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60',
                ]"
                @mousedown.prevent="clickSuggestion(item)"
              >
                <span class="text-slate-400 dark:text-slate-500 text-xs w-10 shrink-0 text-right">{{
                  suggestions.type === 'key' ? 'key' : 'value'
                }}</span>
                <span>{{ item.label }}</span>
              </BaseButton>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- Ticket list -->
    <div v-if="store.loading && !store.tickets.length" class="py-12 text-center text-slate-400">
      <Icon icon="lucide:loader-2" class="w-6 h-6 mx-auto animate-spin" />
    </div>

    <div v-else-if="!store.tickets.length" class="py-12 text-center text-slate-400">暂无议题</div>

    <div
      v-else
      class="divide-y divide-slate-200 dark:divide-slate-800 border border-slate-200/80 dark:border-slate-800/80 rounded-xl overflow-hidden"
    >
      <RouterLink
        v-for="ticket in store.tickets"
        :key="ticket.id"
        :to="`/tickets/${ticket.id}`"
        class="flex items-center gap-4 px-5 py-4 sm:px-6 hover:bg-slate-50/80 dark:hover:bg-slate-800/20 transition"
      >
        <Icon
          :icon="STATUS_META[ticket.status]?.icon || 'lucide:circle'"
          class="w-5 h-5 shrink-0"
          :class="STATUS_META[ticket.status].color"
        />
        <div class="flex-1 min-w-0">
          <div class="flex items-center gap-2">
            <span class="font-medium text-slate-900 dark:text-white truncate">{{
              ticket.title
            }}</span>
            <BaseBadge v-for="tl in ticket.labels" :key="tl.labelId" :color="tl.label.color">
              {{ tl.label.name }}
            </BaseBadge>
          </div>
          <div class="mt-1 text-sm text-slate-500 dark:text-slate-400 flex items-center gap-3">
            <span>#{{ ticket.id }}</span>
            <span>{{ ticket.author.username }}</span>
            <span>{{ timeAgo(ticket.createdAt) }}</span>
            <span v-if="ticket._count?.comments" class="flex items-center gap-0.5">
              <Icon icon="lucide:message-square" class="w-3.5 h-3.5" />
              {{ ticket._count.comments }}
            </span>
          </div>
        </div>

        <!-- Assignees stack -->
        <div v-if="ticket.assignees?.length" class="flex items-center shrink-0 ml-6 -space-x-2">
          <div
            v-for="a in ticket.assignees"
            :key="a.userId"
            class="w-6 h-6 shrink-0 -ml-2 first:ml-0"
          >
            <UserAvatar :username="a.user.username" :avatar-url="a.user.avatarUrl" />
          </div>
        </div>
      </RouterLink>
    </div>

    <BasePagination
      :page="store.filters.page || 1"
      :total-pages="totalPages"
      @update:page="setPage"
    />
  </div>
</template>
