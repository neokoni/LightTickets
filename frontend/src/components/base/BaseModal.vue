<script setup lang="ts">
import { Icon } from '@iconify/vue';

const props = defineProps<{
  title?: string;
  size?: 'default' | 'wide';
}>();

const modelValue = defineModel<boolean>({ required: true });
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
        @click.self="modelValue = false"
      >
        <div
          class="modal-panel relative flex max-h-[calc(100dvh-2rem)] w-full flex-col rounded-xl border border-slate-200/80 bg-white/95 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/95"
          :class="props.size === 'wide' ? 'max-w-6xl' : 'max-w-lg'"
        >
          <div
            v-if="title"
            class="flex shrink-0 items-center justify-between px-6 py-5 border-b border-slate-200/80 dark:border-slate-800/80"
          >
            <h3 class="text-base font-semibold text-slate-900 dark:text-white">{{ title }}</h3>
            <button
              class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 dark:border-slate-800 text-slate-500 transition hover:text-slate-700 dark:text-slate-400 dark:hover:text-slate-200"
              @click="modelValue = false"
            >
              <Icon icon="lucide:x" class="w-5 h-5" />
            </button>
          </div>
          <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain p-6">
            <slot />
          </div>
          <div
            v-if="$slots.footer"
            class="flex shrink-0 justify-end gap-2 px-6 py-5 border-t border-slate-200/80 dark:border-slate-800/80"
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
  transition: opacity 0.2s ease;
}

.modal-enter-active .modal-panel,
.modal-leave-active .modal-panel {
  transition: transform 0.2s ease;
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  transform: scale(0.95);
}
</style>
