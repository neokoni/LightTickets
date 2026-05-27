<script setup lang="ts">
import { computed } from 'vue'
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
        class="group inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full"
        :style="{ backgroundColor: tl.label.color + '22', color: tl.label.color }"
      >
        {{ tl.label.name }}
        <button
          v-if="auth.isStaff"
          @click="removeLabel(tl.labelId)"
          class="opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <Icon icon="lucide:x" class="w-3 h-3" />
        </button>
      </span>
    </div>
    <!-- Label selector for staff -->
    <div v-if="auth.isStaff && unassignedLabels.length > 0" class="pt-1">
      <select
        @change="($event) => { const id = ($event.target as HTMLSelectElement).value; if (id) { addLabel(id); ($event.target as HTMLSelectElement).value = '' } }"
        class="w-full px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white/80 dark:bg-slate-900/80 text-slate-700 dark:text-slate-300 backdrop-blur-sm"
      >
        <option value="">添加标签...</option>
        <option v-for="label in unassignedLabels" :key="label.id" :value="label.id">● {{ label.name }}</option>
      </select>
    </div>
  </div>
</template>
