<script setup lang="ts">
import { useUiStore } from '@/stores/ui'

const ui = useUiStore()
</script>

<template>
  <Transition name="toast-list" tag="div">
    <div v-if="ui.toasts.length" class="fixed bottom-4 right-4 z-[100] flex flex-col gap-2">
      <TransitionGroup name="toast">
        <div
          v-for="toast in ui.toasts"
          :key="toast.id"
          class="px-4 py-3 rounded-md shadow-lg text-sm font-medium backdrop-blur-sm border"
          :class="{
            'bg-green-50/90 dark:bg-green-950/90 text-green-800 dark:text-green-200 border-green-200 dark:border-green-800': toast.type === 'success',
            'bg-red-50/90 dark:bg-red-950/90 text-red-800 dark:text-red-200 border-red-200 dark:border-red-800': toast.type === 'error',
            'bg-slate-50/90 dark:bg-slate-800/90 text-slate-800 dark:text-slate-200 border-slate-200 dark:border-slate-700': toast.type === 'info',
          }"
        >
          {{ toast.message }}
        </div>
      </TransitionGroup>
    </div>
  </Transition>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateX(20px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateX(20px);
}
</style>
