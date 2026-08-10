<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, useId } from 'vue';
import { Icon } from '@iconify/vue';
import { t } from '@/i18n';

const model = defineModel<string>();

type ComboboxOption = { value: string; label: string };

const props = defineProps<{
  label?: string;
  options: ComboboxOption[];
  placeholder?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
}>();

const open = ref(false);
const showAll = ref(true);
const activeIndex = ref(-1);
const wrapperEl = ref<HTMLElement>();
const inputEl = ref<HTMLInputElement>();
const dropdownEl = ref<HTMLElement>();
const placement = ref<'top' | 'bottom'>('bottom');
const dropdownStyle = ref<Record<string, string>>({});
const listboxId = useId();
const DROPDOWN_MAX_HEIGHT = 240;
const DROPDOWN_GAP = 4;
const VIEWPORT_PADDING = 12;

const filteredOptions = computed(() => {
  const query = model.value?.trim().toLocaleLowerCase() ?? '';
  if (showAll.value || !query) return props.options;
  return props.options.filter((option) => option.label.toLocaleLowerCase().includes(query));
});

function updatePlacement() {
  if (!inputEl.value) return;
  const rect = inputEl.value.getBoundingClientRect();
  const spaceAbove = rect.top - VIEWPORT_PADDING - DROPDOWN_GAP;
  const spaceBelow = window.innerHeight - rect.bottom - VIEWPORT_PADDING - DROPDOWN_GAP;
  const desiredHeight = Math.min(DROPDOWN_MAX_HEIGHT, filteredOptions.value.length * 44 + 8);
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

function openList(showAllOptions: boolean) {
  if (props.disabled || props.options.length === 0) return;
  showAll.value = showAllOptions;
  open.value = filteredOptions.value.length > 0;
  activeIndex.value = filteredOptions.value.findIndex((option) => option.value === model.value);
  void nextTick(updatePlacement);
}

function closeList() {
  open.value = false;
  activeIndex.value = -1;
}

function onInput(event: Event) {
  model.value = (event.target as HTMLInputElement).value;
  showAll.value = false;
  activeIndex.value = -1;
  open.value = filteredOptions.value.length > 0;
  if (open.value) void nextTick(updatePlacement);
}

function select(option: ComboboxOption) {
  model.value = option.value;
  closeList();
  void nextTick(() => inputEl.value?.focus());
}

function toggleList() {
  if (open.value) closeList();
  else openList(true);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (!open.value) openList(true);
    activeIndex.value = Math.min(activeIndex.value + 1, filteredOptions.value.length - 1);
    return;
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (!open.value) openList(true);
    activeIndex.value = Math.max(activeIndex.value - 1, 0);
    return;
  }
  if (event.key === 'Enter' && open.value && activeIndex.value >= 0) {
    event.preventDefault();
    const option = filteredOptions.value[activeIndex.value];
    if (option) select(option);
    return;
  }
  if (event.key === 'Escape' && open.value) {
    event.stopPropagation();
    closeList();
    return;
  }
  if (event.key === 'Tab') closeList();
}

function onClickOutside(event: MouseEvent) {
  const target = event.target as Node;
  if (wrapperEl.value?.contains(target) || dropdownEl.value?.contains(target)) return;
  closeList();
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
</script>

<template>
  <div ref="wrapperEl" class="min-w-0 space-y-1.5">
    <label v-if="label" class="block text-sm font-medium text-slate-700 dark:text-slate-300">
      {{ label }}<span v-if="required" class="base-field-required" aria-hidden="true">*</span>
    </label>
    <div class="relative -m-0.5 p-0.5">
      <input
        ref="inputEl"
        :value="model || ''"
        type="text"
        role="combobox"
        autocomplete="off"
        :placeholder="placeholder"
        :disabled="disabled"
        :required="required"
        :aria-expanded="open"
        :aria-controls="open ? listboxId : undefined"
        :aria-activedescendant="
          open && activeIndex >= 0 ? `${listboxId}-option-${activeIndex}` : undefined
        "
        aria-autocomplete="list"
        class="w-full rounded-md border border-slate-300 bg-white px-3 py-2 pr-10 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-slate-500 focus:ring-2 focus:ring-slate-900/25 disabled:opacity-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-100/25"
        :class="{
          'border-red-400 focus:border-red-500 focus:ring-red-500/40 dark:border-red-500': error,
        }"
        @focus="openList(true)"
        @click="!open && openList(true)"
        @input="onInput"
        @keydown="onKeydown"
      />
      <button
        type="button"
        :disabled="disabled"
        :aria-label="t('common.selectPlaceholder')"
        class="absolute inset-y-0 right-0 flex w-10 items-center justify-center text-slate-400 transition hover:text-slate-600 disabled:cursor-not-allowed disabled:opacity-50 dark:text-slate-500 dark:hover:text-slate-300"
        @mousedown.prevent
        @click="toggleList"
      >
        <Icon
          icon="lucide:chevron-down"
          class="h-4 w-4 transition-transform duration-200"
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
          :id="listboxId"
          ref="dropdownEl"
          role="listbox"
          class="scrollbar-hidden fixed z-110 overflow-x-hidden overflow-y-auto overscroll-contain rounded-lg border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
          :class="placement === 'bottom' ? 'origin-top' : 'origin-bottom'"
          :style="dropdownStyle"
        >
          <div class="base-dropdown-list">
            <button
              v-for="(option, index) in filteredOptions"
              :id="`${listboxId}-option-${index}`"
              :key="option.value"
              type="button"
              role="option"
              :aria-selected="option.value === model"
              :data-selected="option.value === model"
              class="base-dropdown-option base-select-option flex min-h-11 w-full cursor-pointer items-center p-3 text-left text-[15px] leading-5"
              :class="[
                option.value === model ? 'font-medium' : 'text-slate-700 dark:text-slate-300',
                activeIndex === index ? 'bg-slate-100 dark:bg-slate-800' : '',
              ]"
              @mouseenter="activeIndex = index"
              @mousedown.prevent
              @click="select(option)"
            >
              <span class="truncate">{{ option.label }}</span>
            </button>
          </div>
        </div>
      </Transition>
    </Teleport>
  </div>
</template>
