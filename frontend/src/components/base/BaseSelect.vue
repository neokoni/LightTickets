<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue';
import { Icon } from '@iconify/vue';
import { t } from '@/i18n';

const model = defineModel<string>();

const props = defineProps<{
  label?: string;
  options: { value: string; label: string }[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
}>();

const open = ref(false);
const wrapperEl = ref<HTMLElement>();

function select(value: string) {
  model.value = value;
  open.value = false;
}

function onClickOutside(e: MouseEvent) {
  if (wrapperEl.value && !wrapperEl.value.contains(e.target as Node)) {
    open.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape') open.value = false;
}

onMounted(() => document.addEventListener('mousedown', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside));

const selectedLabel = () =>
  props.options.find((o) => o.value === model.value)?.label ??
  props.placeholder ??
  t('common.selectPlaceholder');
</script>

<template>
  <div ref="wrapperEl" class="space-y-1.5">
    <label v-if="label" class="block text-sm font-medium text-slate-700 dark:text-slate-300">{{
      label
    }}</label>
    <div class="relative">
      <button
        type="button"
        :disabled="disabled"
        class="w-full flex items-center justify-between px-3 py-2 text-sm rounded-md border bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
        :class="[
          error
            ? 'border-red-400 dark:border-red-500 focus:ring-2 focus:ring-red-500/40 focus:border-red-500'
            : open
              ? 'border-slate-400 dark:border-slate-600 ring-2 ring-slate-900/20 dark:ring-slate-100/20'
              : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600',
        ]"
        @click="open = !open"
        @keydown="onKeydown"
      >
        <span :class="model ? '' : 'text-slate-400 dark:text-slate-500'">{{
          selectedLabel()
        }}</span>
        <Icon
          icon="lucide:chevron-down"
          class="w-4 h-4 text-slate-400 dark:text-slate-500 transition-transform duration-200"
          :class="{ 'rotate-180': open }"
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
          v-if="open"
          class="absolute z-50 mt-1 w-full rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 shadow-lg overflow-hidden"
        >
          <div class="py-1">
            <button
              v-for="opt in options"
              :key="opt.value"
              type="button"
              class="w-full px-3 py-2 text-sm text-left transition cursor-pointer"
              :class="
                opt.value === model
                  ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
                  : 'text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800/60'
              "
              @click="select(opt.value)"
            >
              {{ opt.label }}
            </button>
          </div>
        </div>
      </Transition>
    </div>
    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
  </div>
</template>
