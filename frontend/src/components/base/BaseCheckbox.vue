<script setup lang="ts">
defineProps<{
  checked?: boolean;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  'update:checked': [value: boolean];
}>();
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    class="inline-flex h-4 w-4 items-center justify-center rounded border border-slate-300 text-slate-900 transition hover:border-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-900/20 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-600 dark:text-slate-100 dark:focus:ring-slate-100/20"
    :class="checked ? 'bg-slate-900 dark:bg-slate-100' : 'bg-white dark:bg-slate-900'"
    @click="emit('update:checked', !checked)"
  >
    <svg
      v-if="checked"
      class="h-3 w-3 text-white dark:text-slate-900"
      viewBox="0 0 12 12"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M2.5 6.2 5 8.7l4.5-5.4"
        stroke="currentColor"
        stroke-width="2"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  </button>
</template>
