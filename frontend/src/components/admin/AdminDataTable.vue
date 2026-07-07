<script setup lang="ts" generic="T extends Record<string, unknown>">
import { Icon } from '@iconify/vue';

interface TableColumn {
  key: string;
  label: string;
  class?: string;
}

interface TableAction {
  icon: string;
  label: string;
  variant?: 'primary' | 'danger' | 'ghost';
  onClick: (row: T) => void;
}

const props = defineProps<{
  columns: TableColumn[];
  data: T[];
  actions?: TableAction[];
  rowKey: string;
  loading?: boolean;
  emptyText?: string;
}>();

const emit = defineEmits<{
  (e: 'row-click', row: T): void;
}>();

function getRowKey(row: T): string | number {
  const value = row[props.rowKey as keyof T];
  return typeof value === 'number' || typeof value === 'string' ? value : JSON.stringify(value);
}
</script>

<template>
  <div class="overflow-x-auto border border-slate-200/80 dark:border-slate-800/80 rounded-xl">
    <table class="w-full text-sm">
      <thead class="bg-slate-50/80 dark:bg-slate-800/50 backdrop-blur-sm">
        <tr>
          <th
            v-for="col in columns"
            :key="col.key"
            class="px-6 py-4 text-left text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
            :class="col.class"
          >
            {{ col.label }}
          </th>
          <th
            v-if="actions?.length"
            class="px-6 py-4 text-right text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400"
          >
            操作
          </th>
        </tr>
      </thead>
      <tbody class="divide-y divide-slate-200 dark:divide-slate-800">
        <tr
          v-for="row in data"
          :key="getRowKey(row)"
          class="hover:bg-slate-50/80 dark:hover:bg-slate-800/20 transition"
          @click="emit('row-click', row)"
        >
          <td v-for="col in columns" :key="col.key" class="px-6 py-4" :class="col.class">
            <slot :name="col.key" :row="row">
              <span class="text-slate-700 dark:text-slate-300">
                {{ String(row[col.key as keyof T] ?? '') }}
              </span>
            </slot>
          </td>
          <td v-if="actions?.length" class="px-6 py-4 text-right">
            <div class="flex items-center justify-end gap-1">
              <button
                v-for="(action, idx) in actions"
                :key="idx"
                class="p-1.5 rounded-md text-slate-400 transition"
                :class="
                  action.variant === 'danger'
                    ? 'hover:text-red-500'
                    : 'hover:text-slate-700 dark:hover:text-slate-200'
                "
                :title="action.label"
                @click.stop="action.onClick(row)"
              >
                <slot :name="`action-${idx}`" :row="row">
                  <Icon :icon="action.icon" class="w-4 h-4" />
                </slot>
              </button>
            </div>
          </td>
        </tr>
      </tbody>
    </table>
    <div
      v-if="!loading && data.length === 0"
      class="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400"
    >
      {{ emptyText || '暂无数据' }}
    </div>
    <div
      v-if="loading"
      class="px-6 py-8 text-center text-sm text-slate-500 dark:text-slate-400 animate-pulse"
    >
      加载中...
    </div>
  </div>
</template>
