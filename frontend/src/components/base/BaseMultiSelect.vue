<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { Icon } from '@iconify/vue';
import BaseButton from './BaseButton.vue';
import BaseInput from './BaseInput.vue';

type MultiSelectOption = {
  value: string;
  label: string;
  color?: string;
};

const model = defineModel<string[]>({ default: () => [] });

const props = defineProps<{
  label?: string;
  options: MultiSelectOption[];
  placeholder?: string;
  emptyText: string;
  noResultsText: string;
  allSelectedText: string;
  removeTitle?: string;
}>();

const query = ref('');
const open = ref(false);
const wrapperEl = ref<HTMLElement>();

const selectedOptions = computed(() =>
  model.value.flatMap((value) => {
    const option = props.options.find((candidate) => candidate.value === value);
    return option ? [option] : [];
  }),
);

const unselectedOptions = computed(() =>
  props.options.filter((option) => !model.value.includes(option.value)),
);

const candidateOptions = computed(() => {
  const normalizedQuery = query.value.trim().toLocaleLowerCase();
  if (!normalizedQuery) return unselectedOptions.value;
  return unselectedOptions.value.filter((option) =>
    option.label.toLocaleLowerCase().includes(normalizedQuery),
  );
});

const candidateEmptyText = computed(() => {
  if (!props.options.length) return props.emptyText;
  if (!unselectedOptions.value.length) return props.allSelectedText;
  return props.noResultsText;
});

function add(value: string) {
  if (!model.value.includes(value)) model.value = [...model.value, value];
  query.value = '';
  open.value = true;
}

function remove(value: string) {
  model.value = model.value.filter((selectedValue) => selectedValue !== value);
}

function onKeydown(event: KeyboardEvent) {
  if (event.key === 'Escape') {
    open.value = false;
    return;
  }
  if (event.key === 'Enter' && candidateOptions.value[0]) {
    event.preventDefault();
    add(candidateOptions.value[0].value);
  }
}

function onClickOutside(event: MouseEvent) {
  if (!wrapperEl.value?.contains(event.target as Node)) open.value = false;
}

onMounted(() => document.addEventListener('mousedown', onClickOutside));
onBeforeUnmount(() => document.removeEventListener('mousedown', onClickOutside));
</script>

<template>
  <div ref="wrapperEl" class="space-y-2">
    <div class="relative">
      <BaseInput
        v-model="query"
        :label="label"
        :placeholder="placeholder"
        autocomplete="off"
        @focus="open = true"
        @keydown.stop="onKeydown"
      />
      <Transition
        enter-active-class="transition duration-150 ease-out"
        enter-from-class="-translate-y-1 opacity-0"
        enter-to-class="translate-y-0 opacity-100"
        leave-active-class="transition duration-100 ease-in"
        leave-from-class="translate-y-0 opacity-100"
        leave-to-class="-translate-y-1 opacity-0"
      >
        <div
          v-if="open"
          class="absolute z-50 mt-1 max-h-60 w-full overflow-y-auto rounded-md border border-slate-200 bg-white py-1 shadow-lg dark:border-slate-700 dark:bg-slate-900"
          role="listbox"
        >
          <template v-if="candidateOptions.length">
            <BaseButton
              v-for="option in candidateOptions"
              :key="option.value"
              type="button"
              role="option"
              class="!flex !w-full !justify-start !rounded-none !border-0 !px-3 !py-2 !text-left !text-sm !font-normal"
              @mousedown.prevent
              @click="add(option.value)"
            >
              <span
                v-if="option.color"
                class="h-2.5 w-2.5 shrink-0 rounded-full"
                :style="{ backgroundColor: option.color }"
              />
              <span class="truncate">{{ option.label }}</span>
            </BaseButton>
          </template>
          <p v-else class="px-3 py-2 text-xs text-slate-400 dark:text-slate-500">
            {{ candidateEmptyText }}
          </p>
        </div>
      </Transition>
    </div>

    <div v-if="selectedOptions.length" class="flex flex-wrap gap-1.5">
      <BaseButton
        v-for="option in selectedOptions"
        :key="option.value"
        type="button"
        class="!gap-1 !rounded-full !border-0 !px-2 !py-1 !text-xs !font-medium"
        :style="option.color ? { backgroundColor: option.color + '20', color: option.color } : {}"
        :title="removeTitle"
        @click="remove(option.value)"
      >
        {{ option.label }}
        <Icon icon="lucide:x" class="h-3 w-3" />
      </BaseButton>
    </div>
  </div>
</template>
