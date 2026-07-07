<script setup lang="ts">
const model = defineModel<boolean>({ required: true });
</script>

<template>
  <button
    class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition"
    :class="model ? 'bg-slate-900 dark:bg-slate-200' : 'bg-slate-200 dark:bg-slate-700'"
    @click="model = !model"
  >
    <span
      class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform dark:bg-slate-800"
      :class="model ? 'translate-x-5' : 'translate-x-0'"
    />
  </button>
</template>
