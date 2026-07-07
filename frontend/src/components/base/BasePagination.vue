<script setup lang="ts">
import { ref, computed, onMounted, onBeforeUnmount } from 'vue';
import { Icon } from '@iconify/vue';

const props = defineProps<{
  page: number;
  totalPages: number;
  total?: number;
  pageSize?: number;
  pageSizeOptions?: number[];
}>();

const emit = defineEmits<{
  'update:page': [page: number];
  'update:pageSize': [size: number];
}>();

const sizes = computed(() => props.pageSizeOptions ?? [20, 50, 100]);

// Page size dropdown
const sizeOpen = ref(false);
const sizeEl = ref<HTMLElement>();

function pickSize(s: number) {
  emit('update:pageSize', s);
  sizeOpen.value = false;
}

function onClickOutside(e: MouseEvent) {
  if (sizeEl.value && !sizeEl.value.contains(e.target as Node)) sizeOpen.value = false;
}

onMounted(() => document.addEventListener('mousedown', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside));
</script>

<template>
  <div
    v-if="totalPages > 1 || (total != null && total > (sizes[0] ?? 20))"
    class="flex items-center gap-4"
    :class="total != null && pageSize != null ? 'justify-between' : 'justify-center'"
  >
    <!-- left: page size selector -->
    <div
      v-if="total != null && pageSize != null"
      class="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-400"
    >
      <span>共 {{ total }} 条</span>
      <div ref="sizeEl" class="relative">
        <button
          type="button"
          class="flex items-center gap-1 px-2 py-1 text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 transition cursor-pointer"
          @click="sizeOpen = !sizeOpen"
        >
          {{ pageSize }} 条/页
          <Icon
            icon="lucide:chevron-down"
            class="w-3 h-3 text-slate-400 transition-transform duration-200"
            :class="{ 'rotate-180': sizeOpen }"
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
            v-if="sizeOpen"
            class="absolute bottom-full mb-1 left-0 z-50 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden"
          >
            <div class="py-1">
              <button
                v-for="s in sizes"
                :key="s"
                type="button"
                class="w-full px-3 py-1.5 text-xs text-left whitespace-nowrap transition cursor-pointer"
                :class="
                  s === pageSize
                    ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                    : 'text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                "
                @click="pickSize(s)"
              >
                {{ s }} 条/页
              </button>
            </div>
          </div>
        </Transition>
      </div>
    </div>

    <!-- right: page navigation -->
    <div class="flex items-center gap-2">
      <button
        :disabled="page <= 1"
        class="p-2 rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
        @click="emit('update:page', page - 1)"
      >
        <Icon icon="lucide:chevron-left" class="w-4 h-4" />
      </button>
      <span class="text-sm text-slate-700 dark:text-slate-300 tabular-nums">
        {{ page }} / {{ totalPages }}
      </span>
      <button
        :disabled="page >= totalPages"
        class="p-2 rounded-md text-slate-500 hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200 disabled:opacity-30 disabled:cursor-not-allowed transition"
        @click="emit('update:page', page + 1)"
      >
        <Icon icon="lucide:chevron-right" class="w-4 h-4" />
      </button>
    </div>
  </div>
</template>
