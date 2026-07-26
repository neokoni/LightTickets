<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { onBeforeUnmount, onMounted, ref, watch } from 'vue';

const POPUP_TRIGGER_SELECTOR =
  'button, [role="button"], a[href], input[type="button"], input[type="submit"]';
const POINTER_ORIGIN_MAX_AGE = 10_000;

interface PopupOrigin {
  x: number;
  y: number;
  capturedAt: number;
}

let originTrackerConsumers = 0;
let lastPointerOrigin: PopupOrigin | null = null;
const openModalStack: object[] = [];

function registerOpenModal(token: object) {
  const existingIndex = openModalStack.indexOf(token);
  if (existingIndex !== -1) openModalStack.splice(existingIndex, 1);
  openModalStack.push(token);
}

function unregisterOpenModal(token: object) {
  const index = openModalStack.indexOf(token);
  if (index !== -1) openModalStack.splice(index, 1);
}

function getTriggerElement(target: Node | null): HTMLElement | null {
  const element = target as HTMLElement | null;
  if (typeof element?.closest !== 'function') return null;
  return element.closest<HTMLElement>(POPUP_TRIGGER_SELECTOR);
}

function getElementCenter(element: HTMLElement | null): PopupOrigin | null {
  if (!element?.isConnected) return null;
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  return {
    x: rect.left + rect.width / 2,
    y: rect.top + rect.height / 2,
    capturedAt: Date.now(),
  };
}

function trackPointerOrigin(event: Event) {
  if (event instanceof MouseEvent && event.button !== 0) return;
  lastPointerOrigin = getElementCenter(getTriggerElement(event.target as Node | null));
}

function startOriginTracker() {
  if (originTrackerConsumers === 0) {
    document.addEventListener('pointerdown', trackPointerOrigin, true);
  }
  originTrackerConsumers += 1;
}

function stopOriginTracker() {
  originTrackerConsumers -= 1;
  if (originTrackerConsumers === 0) {
    document.removeEventListener('pointerdown', trackPointerOrigin, true);
  }
}

const props = defineProps<{
  title?: string;
  size?: 'default' | 'wide';
}>();

const modelValue = defineModel<boolean>({ required: true });
const modalToken = {};
const modalOffsetX = ref('0px');
const modalOffsetY = ref('0px');

function captureModalOrigin() {
  const focusedOrigin = getElementCenter(getTriggerElement(document.activeElement as Node | null));
  const recentPointerOrigin =
    lastPointerOrigin && Date.now() - lastPointerOrigin.capturedAt <= POINTER_ORIGIN_MAX_AGE
      ? lastPointerOrigin
      : null;
  const origin = focusedOrigin ?? recentPointerOrigin;
  const viewportWidth = document.documentElement.clientWidth;
  const viewportHeight = document.documentElement.clientHeight;

  modalOffsetX.value = origin ? `${origin.x - viewportWidth / 2}px` : '0px';
  modalOffsetY.value = origin ? `${origin.y - viewportHeight / 2}px` : '0px';
}

function closeOnEscape(event: KeyboardEvent) {
  if (
    event.key !== 'Escape' ||
    !modelValue.value ||
    openModalStack[openModalStack.length - 1] !== modalToken
  )
    return;

  event.preventDefault();
  modelValue.value = false;
}

watch(
  modelValue,
  (open, wasOpen) => {
    if (open) {
      if (!wasOpen) captureModalOrigin();
      registerOpenModal(modalToken);
    } else {
      unregisterOpenModal(modalToken);
    }
  },
  { flush: 'sync', immediate: true },
);

onMounted(() => {
  startOriginTracker();
  document.addEventListener('keydown', closeOnEscape);
});

onBeforeUnmount(() => {
  stopOriginTracker();
  unregisterOpenModal(modalToken);
  document.removeEventListener('keydown', closeOnEscape);
});
</script>

<template>
  <Teleport to="body">
    <Transition name="modal">
      <div
        v-if="modelValue"
        class="fixed inset-0 z-[90] flex items-center justify-center overflow-y-auto bg-black/50 p-4 backdrop-blur-sm"
        :style="{
          '--modal-offset-x': modalOffsetX,
          '--modal-offset-y': modalOffsetY,
        }"
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
  transition: opacity 0.24s ease;
}

.modal-enter-active .modal-panel,
.modal-leave-active .modal-panel {
  transition: transform 0.24s cubic-bezier(0.2, 0.8, 0.2, 1);
}

.modal-enter-from,
.modal-leave-to {
  opacity: 0;
}

.modal-enter-from .modal-panel,
.modal-leave-to .modal-panel {
  transform: translate3d(var(--modal-offset-x), var(--modal-offset-y), 0) scale(0.08);
}
</style>
