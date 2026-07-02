<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue'
import { Icon } from '@iconify/vue'
import { apiAddTicketLabel, apiRemoveTicketLabel } from '@/api/labels'
import { useTicketsStore } from '@/stores/tickets'
import { useLabelsStore } from '@/stores/labels'
import { useUiStore } from '@/stores/ui'
import { useAuthStore } from '@/stores/auth'
import type { Ticket } from '@/types/ticket'

const props = defineProps<{
  ticket: Ticket
}>()

const tickets = useTicketsStore()
const labels = useLabelsStore()
const ui = useUiStore()
const auth = useAuthStore()

const ticketLabelIds = computed(() => new Set(props.ticket.labels.map(l => l.labelId)))

const unassignedLabels = computed(() =>
  labels.labels.filter(l => !ticketLabelIds.value.has(l.id))
)

const dropdownOpen = ref(false)
const dropdownEl = ref<HTMLElement>()

function onClickOutside(e: MouseEvent) {
  if (dropdownEl.value && !dropdownEl.value.contains(e.target as Node)) {
    dropdownOpen.value = false
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') dropdownOpen.value = false
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside)
  if (!labels.loaded) labels.fetch().catch(() => {})
})
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside))

async function addLabel(labelId: string) {
  try {
    await apiAddTicketLabel(props.ticket.id, labelId)
    await tickets.fetchDetail(props.ticket.id)
    ui.toast('标签已添加', 'success')
  } catch (e: any) {
    ui.toast(e.message || '添加失败', 'error')
  }
}

async function removeLabel(labelId: string) {
  try {
    await apiRemoveTicketLabel(props.ticket.id, labelId)
    await tickets.fetchDetail(props.ticket.id)
    ui.toast('标签已移除', 'success')
  } catch (e: any) {
    ui.toast(e.message || '移除失败', 'error')
  }
}
</script>

<template>
  <div class="space-y-2">
    <div class="flex items-center justify-between">
      <span class="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide">标签</span>
    </div>
    <div class="flex flex-wrap gap-1.5">
      <span
        v-for="tl in ticket.labels"
        :key="tl.labelId"
        class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full transition cursor-default"
        :class="auth.isStaff ? 'hover:ring-1 hover:ring-red-400/50 cursor-pointer' : ''"
        :style="{ backgroundColor: tl.label.color + '22', color: tl.label.color }"
        :title="auth.isStaff ? '点击移除' : undefined"
        @click="auth.isStaff && removeLabel(tl.labelId)"
      >
        {{ tl.label.name }}
      </span>
    </div>
    <!-- Label selector for staff -->
    <div v-if="auth.isStaff" class="pt-1 relative" ref="dropdownEl">
      <button
        type="button"
        @click="dropdownOpen = !dropdownOpen"
        @keydown="onKeydown"
        class="w-full flex items-center justify-between px-2.5 py-1.5 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 backdrop-blur-sm hover:border-slate-400 dark:hover:border-slate-600 transition"
        :class="dropdownOpen ? 'border-slate-400 dark:border-slate-600 ring-2 ring-slate-900/20 dark:ring-slate-100/20' : ''"
      >
        <span>添加标签...</span>
        <Icon
          icon="lucide:chevron-down"
          class="w-3.5 h-3.5 text-slate-400 dark:text-slate-500 transition-transform duration-200"
          :class="{ 'rotate-180': dropdownOpen }"
        />
      </button>
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 -translate-y-1"
        enter-to-class="opacity-100 translate-y-0"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 translate-y-0"
        leave-to-class="opacity-0 -translate-y-1"
      >
        <div
          v-if="dropdownOpen"
          class="absolute z-50 mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden"
        >
          <div class="py-1">
            <template v-if="unassignedLabels.length">
              <button
                v-for="label in unassignedLabels"
                :key="label.id"
                type="button"
                @mousedown.prevent
                @click="addLabel(label.id)"
                class="w-full flex items-center gap-2 px-3 py-2 text-sm text-left transition hover:bg-slate-50 dark:hover:bg-slate-800/60"
              >
                <span
                  class="w-2.5 h-2.5 rounded-full shrink-0"
                  :style="{ backgroundColor: label.color }"
                />
                <span class="text-slate-700 dark:text-slate-300">{{ label.name }}</span>
              </button>
            </template>
            <div v-else class="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
              所有标签已添加
            </div>
          </div>
        </div>
      </Transition>
    </div>
  </div>
</template>
