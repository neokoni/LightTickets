<script setup lang="ts">
import { computed, ref, onMounted, onBeforeUnmount } from 'vue';
import { Icon } from '@iconify/vue';
import { t } from '@/i18n';

const model = defineModel<string>();

type SelectOption = { value: string; label: string; icon?: string; color?: string };

const props = defineProps<{
  label?: string;
  options: SelectOption[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  variant?: 'default' | 'subtle';
  required?: boolean;
  emptyText?: string;
}>();

const open = ref(false);
const wrapperEl = ref<HTMLElement>();
const triggerEl = ref<HTMLElement>();
const dropdownEl = ref<HTMLElement>();
const placement = ref<'top' | 'bottom'>('bottom');
const dropdownStyle = ref<Record<string, string>>({});
const DROPDOWN_MAX_HEIGHT = 240;
const DROPDOWN_GAP = 4;
const VIEWPORT_PADDING = 12;

function updatePlacement() {
  if (!triggerEl.value) return;
  const rect = triggerEl.value.getBoundingClientRect();
  const spaceAbove = rect.top - VIEWPORT_PADDING - DROPDOWN_GAP;
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING - DROPDOWN_GAP;
  const desiredHeight = Math.min(DROPDOWN_MAX_HEIGHT, props.options.length * 40 + 8);
  placement.value = spaceBelow >= desiredHeight || spaceBelow >= spaceAbove ? 'bottom' : 'top';
  const availableSpace = placement.value === 'bottom' ? spaceBelow : spaceAbove;
  const width = Math.min(rect.width, window.innerWidth - VIEWPORT_PADDING * 2);
  const left = Math.min(
    Math.max(rect.left, VIEWPORT_PADDING),
    window.innerWidth - VIEWPORT_PADDING - width,
  );

  dropdownStyle.value = {
    left: `${left}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(48, Math.min(DROPDOWN_MAX_HEIGHT, availableSpace))}px`,
    ...(placement.value === 'bottom'
      ? { top: `${rect.bottom + DROPDOWN_GAP}px`, bottom: 'auto' }
      : { top: 'auto', bottom: `${window.innerHeight - rect.top + DROPDOWN_GAP}px` }),
  };
}

function toggleOpen() {
  open.value = !open.value;
  if (open.value) updatePlacement();
}

function select(value: string) {
  model.value = value;
  open.value = false;
}

function onClickOutside(e: MouseEvent) {
  const target = e.target as Node;
  if (wrapperEl.value && !wrapperEl.value.contains(target) && !dropdownEl.value?.contains(target)) {
    open.value = false;
  }
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Escape' && open.value) {
    e.stopPropagation();
    open.value = false;
  }
}

function onViewportChange() {
  if (open.value) updatePlacement();
}

onMounted(() => {
  document.addEventListener('mousedown', onClickOutside);
  window.addEventListener('resize', onViewportChange);
  window.addEventListener('scroll', onViewportChange, true);
});
onBeforeUnmount(() => {
  document.removeEventListener('mousedown', onClickOutside);
  window.removeEventListener('resize', onViewportChange);
  window.removeEventListener('scroll', onViewportChange, true);
});

const selectedOption = computed(() => props.options.find((o) => o.value === model.value));
const selectedLabel = () =>
  selectedOption.value?.label ?? props.placeholder ?? t('common.selectPlaceholder');

const buttonStateClass = computed(() => {
  if (props.error) {
    return 'border-red-400 dark:border-red-500 focus:ring-2 focus:ring-red-500/40 focus:border-red-500';
  }
  if (props.variant === 'subtle') {
    return open.value
      ? 'border-slate-300/80 bg-slate-100/45 ring-2 ring-slate-900/10 dark:border-slate-700/80 dark:bg-slate-900/55 dark:ring-slate-100/10'
      : 'border-slate-200/60 bg-transparent hover:border-slate-300/70 hover:bg-slate-100/45 dark:border-slate-800/70 dark:bg-transparent dark:hover:border-slate-700/80 dark:hover:bg-slate-900/45';
  }
  return open.value
    ? 'border-slate-400 dark:border-slate-600 ring-2 ring-slate-900/20 dark:ring-slate-100/20'
    : 'border-slate-300 dark:border-slate-700 hover:border-slate-400 dark:hover:border-slate-600';
});

const dropdownClass = computed(() =>
  props.variant === 'subtle'
    ? 'border-slate-200/70 bg-slate-50 dark:border-slate-800/80 dark:bg-slate-950'
    : 'border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900',
);
</script>

<template>
  <div ref="wrapperEl" class="min-w-0 space-y-1.5">
    <label v-if="label" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
      {{ label }}<span v-if="required" class="base-field-required" aria-hidden="true">*</span>
    </label>
    <div class="relative -m-0.5 p-0.5">
      <button
        ref="triggerEl"
        type="button"
        :disabled="disabled"
        :aria-required="required || undefined"
        class="flex min-h-10 w-full cursor-pointer items-center justify-between rounded-md border px-3 py-2 text-sm text-slate-900 transition disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-100"
        :class="buttonStateClass"
        @click="toggleOpen"
        @keydown="onKeydown"
      >
        <span
          class="flex min-w-0 items-center gap-2"
          :class="model ? '' : 'text-slate-400 dark:text-slate-500'"
        >
          <Icon
            v-if="selectedOption?.icon"
            :icon="selectedOption.icon"
            :color="selectedOption.color"
            class="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400"
          />
          <span
            v-else-if="selectedOption?.color"
            class="h-2.5 w-2.5 shrink-0 rounded-full"
            :style="{ backgroundColor: selectedOption.color }"
          />
          <span class="truncate">{{ selectedLabel() }}</span>
        </span>
        <Icon
          icon="lucide:chevron-down"
          class="h-4 w-4 shrink-0 text-slate-400 transition-transform duration-200 dark:text-slate-500"
          :class="{ 'rotate-180': open }"
        />
      </button>
    </div>
    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>

    <Teleport to="body">
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="opacity-0 scale-[0.98]"
        enter-to-class="opacity-100 scale-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="opacity-100 scale-100"
        leave-to-class="opacity-0 scale-[0.98]"
      >
        <div
          v-if="open"
          ref="dropdownEl"
          class="scrollbar-hidden fixed z-110 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border"
          :class="[dropdownClass, placement === 'bottom' ? 'origin-top' : 'origin-bottom']"
          :style="dropdownStyle"
        >
          <div class="base-dropdown-list">
            <template v-if="options.length">
              <button
                v-for="opt in options"
                :key="opt.value"
                type="button"
                class="base-dropdown-option base-select-option flex min-h-11 w-full cursor-pointer items-center p-3 text-left text-[15px] leading-5"
                :data-selected="opt.value === model"
                :class="opt.value === model ? 'font-medium' : 'text-slate-700 dark:text-slate-300'"
                @click="select(opt.value)"
              >
                <span class="flex min-w-0 items-center gap-2">
                  <Icon
                    v-if="opt.icon"
                    :icon="opt.icon"
                    :color="opt.color"
                    class="h-4 w-4 shrink-0 text-slate-500 dark:text-slate-400"
                  />
                  <span
                    v-else-if="opt.color"
                    class="h-2.5 w-2.5 shrink-0 rounded-full"
                    :style="{ backgroundColor: opt.color }"
                  />
                  <span class="truncate">{{ opt.label }}</span>
                </span>
              </button>
            </template>
            <div v-else-if="emptyText" class="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
              {{ emptyText }}
            </div>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
