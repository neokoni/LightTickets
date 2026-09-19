<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { t } from '@/i18n';
import BaseInput from './BaseInput.vue';
import BaseButton from './BaseButton.vue';
import { apiSearchPlayerGroupValues } from '@/api/player-groups';

const model = defineModel<string[]>({ default: () => [] });
const root = ref<HTMLElement | null>(null);
const props = defineProps<{
  label?: string;
  groups: string[];
  placeholder?: string;
  required?: boolean;
  inputAny?: boolean;
  error?: string;
}>();
const query = ref('');
const options = ref<string[]>([]);
const open = ref(false);
const loading = ref(false);
const PLAYER_NAME_PATTERN = /^[A-Za-z0-9_]{3,16}$/;
let timer: ReturnType<typeof setTimeout> | undefined;
let sequence = 0;

function closeList() {
  if (timer) clearTimeout(timer);
  timer = undefined;
  sequence++;
  loading.value = false;
  open.value = false;
}

function search() {
  closeList();
  options.value = [];
  const current = ++sequence;
  const q = query.value.trim();
  if (!q || !isInsideRoot(document.activeElement)) return;
  const groups = [...props.groups];
  open.value = true;
  loading.value = true;
  timer = setTimeout(async () => {
    timer = undefined;
    try {
      const result = await apiSearchPlayerGroupValues(groups, q);
      if (current === sequence) {
        options.value = result.filter((item) => !model.value.includes(item));
        open.value = true;
      }
    } catch {
      if (current === sequence) {
        options.value = [];
        open.value = false;
      }
    } finally {
      if (current === sequence) loading.value = false;
    }
  }, 250);
}

watch(() => [query.value, ...props.groups], search, { flush: 'sync' });

function add(value: string) {
  if (!model.value.includes(value)) model.value = [...model.value, value];
  query.value = '';
  closeList();
}
// Free-text entry (input_any) must still be a valid Minecraft name; otherwise the backend
// rejects the whole submission. Keep an invalid draft in the field instead of adding it.
function addFromInput() {
  const value = query.value.trim();
  if (PLAYER_NAME_PATTERN.test(value)) add(value);
}
function remove(value: string) {
  model.value = model.value.filter((item) => item !== value);
}
function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    event.stopPropagation();
    closeList();
  }
  if (event.key === 'Enter' && props.inputAny && query.value.trim()) {
    event.preventDefault();
    addFromInput();
  }
}
function isInsideRoot(target: unknown): boolean {
  return target instanceof Node && root.value?.contains(target) === true;
}
function onBlur(event: { relatedTarget: unknown }) {
  if (isInsideRoot(event.relatedTarget)) return;
  if (props.inputAny && query.value.trim()) {
    addFromInput();
  }
  closeList();
}
function onClickOutside(event: MouseEvent) {
  if (!isInsideRoot(event.target)) closeList();
}
onMounted(() => document.addEventListener('mousedown', onClickOutside));
onBeforeUnmount(() => {
  if (timer) clearTimeout(timer);
  sequence++;
  document.removeEventListener('mousedown', onClickOutside);
});
</script>

<template>
  <div ref="root" data-player-select class="min-w-0 space-y-1.5" @focusout="onBlur">
    <label v-if="label" class="block text-sm font-medium text-slate-700 dark:text-slate-300"
      >{{ label
      }}<span v-if="required" class="base-field-required" aria-hidden="true">*</span></label
    >
    <div class="relative">
      <BaseInput
        v-model="query"
        :placeholder="placeholder"
        autocomplete="off"
        @focus="search"
        @keydown="onKeydown"
      />
      <div
        v-if="open"
        class="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white shadow-lg dark:border-slate-700 dark:bg-slate-900"
      >
        <BaseButton
          v-for="option in options"
          :key="option"
          type="button"
          :has-hover="false"
          class="!flex !w-full !justify-start !rounded-none !border-0 !px-3 !py-2 !text-left !text-sm !font-normal"
          @click="add(option)"
          >{{ option }}</BaseButton
        >
        <p v-if="loading" class="px-3 py-2 text-xs text-slate-400">{{ t('common.loading') }}</p>
        <p v-else-if="!options.length" class="px-3 py-2 text-xs text-slate-400">
          {{ t('common.noResults') }}
        </p>
      </div>
    </div>
    <p v-if="error" class="text-xs text-red-500">{{ error }}</p>
    <div v-if="model.length" class="flex flex-wrap gap-2">
      <BaseButton v-for="value in model" :key="value" type="button" size="sm" @click="remove(value)"
        >{{ value }} ×</BaseButton
      >
    </div>
  </div>
</template>
