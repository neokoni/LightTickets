<script setup lang="ts">
import { Icon } from '@iconify/vue';

defineProps<{
  title?: string;
}>();

const modelValue = defineModel<boolean>({ required: true });
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div v-if="modelValue" class="fixed inset-0 z-[90] flex items-center justify-center p-4">
        <div class="absolute inset-0 bg-black/50 backdrop-blur-sm" @click="modelValue = false" />
        <div
          class="relative w-full max-w-lg rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/95 dark:bg-slate-900/95 shadow-sm backdrop-blur"
        >
          <div
            v-if="title"
            class="flex items-center justify-between px-6 py-5 border-b border-slate-200/80 dark:border-slate-800/80"
          >
            <h3 class="text-base font-semibold text-slate-900 dark:text-white">{{ title }}</h3>
            <button
              class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-slate-800 text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              @click="modelValue = false"
            >
              <Icon icon="lucide:x" class="w-5 h-5" />
            </button>
          </div>
          <div class="p-6">
            <slot />
          </div>
          <div
            v-if="$slots.footer"
            class="px-6 py-5 border-t border-slate-200/80 dark:border-slate-800/80 flex justify-end gap-2"
          >
            <slot name="footer" />
          </div>
        </div>
      </div>
    </Transition>
  </Teleport>
</template>

<style scoped>
.modal-enter-active,
.modal-leave-active {
  transition:
    opacity 0.2s ease,
    transform 0.2s ease;
}
.modal-enter-from,
.modal-leave-to {
  opacity: 0;
  transform: scale(0.95);
}
</style>
