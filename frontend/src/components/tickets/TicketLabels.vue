<script setup lang="ts">
import { ref, computed, onMounted } from 'vue';
import BaseSelect from '@/components/base/BaseSelect.vue';
import { apiAddTicketLabel, apiRemoveTicketLabel } from '@/api/labels';
import { useTicketsStore } from '@/stores/tickets';
import { useLabelsStore } from '@/stores/labels';
import { ToastType, useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/i18n';
import type { Ticket } from '@/types/ticket';

const props = defineProps<{
  ticket: Ticket;
}>();

const tickets = useTicketsStore();
const labels = useLabelsStore();
const ui = useUiStore();
const auth = useAuthStore();

const ticketLabelIds = computed(() => new Set(props.ticket.labels.map((l) => l.labelId)));

const unassignedLabels = computed(() =>
  labels.labels.filter((l) => !ticketLabelIds.value.has(l.id)),
);

const pendingLabel = ref('');

const unassignedLabelOptions = computed(() =>
  unassignedLabels.value.map((label) => ({
    value: label.id,
    label: label.name,
    color: label.color,
  })),
);

function onAddLabel(labelId?: string) {
  pendingLabel.value = '';
  if (labelId) void addLabel(labelId);
}

onMounted(() => {
  if (!labels.loaded) labels.fetchList().catch(() => {});
});

async function addLabel(labelId: string) {
  try {
    await apiAddTicketLabel(props.ticket.id, labelId);
    await tickets.fetchDetail(props.ticket.id);
    ui.toast(t('ticket.labels.added'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.addFailed'));
  }
}

async function removeLabel(labelId: string) {
  try {
    await apiRemoveTicketLabel(props.ticket.id, labelId);
    await tickets.fetchDetail(props.ticket.id);
    ui.toast(t('ticket.labels.removed'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.removeFailed'));
  }
}
</script>

<template>
  <div
    v-if="ticket.labels.length > 0 || auth.isStaff"
    class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-3"
  >
    <h3
      class="text-xs font-semibold tracking-[0.18em] uppercase text-slate-500 dark:text-slate-400"
    >
      {{ t('ticket.labels.title') }}
    </h3>

    <div v-if="ticket.labels.length" class="flex flex-wrap gap-1.5">
      <span
        v-for="tl in ticket.labels"
        :key="tl.labelId"
        class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full transition cursor-default"
        :class="auth.isStaff ? 'hover:ring-1 hover:ring-red-400/50 cursor-pointer' : ''"
        :style="{ backgroundColor: tl.label.color + '22', color: tl.label.color }"
        :title="auth.isStaff ? t('ticket.labels.clickRemove') : undefined"
        @click="auth.isStaff && removeLabel(tl.labelId)"
      >
        {{ tl.label.name }}
      </span>
    </div>
    <div v-else-if="auth.isStaff" class="text-sm text-slate-400 dark:text-slate-500">
      {{ t('ticket.labels.empty') }}
    </div>

    <BaseSelect
      v-if="auth.isStaff"
      v-model="pendingLabel"
      :options="unassignedLabelOptions"
      :placeholder="t('ticket.labels.add')"
      :empty-text="t('ticket.labels.allAdded')"
      @update:model-value="onAddLabel"
    />
  </div>
</template>
