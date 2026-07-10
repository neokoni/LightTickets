<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useUiStore, type Theme } from '@/stores/ui';

type TurnstileWidgetId = string;

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          theme: Theme;
          size: 'flexible';
          callback: (token: string) => void;
          'expired-callback': () => void;
          'error-callback': () => void;
        },
      ) => TurnstileWidgetId;
      reset: (widgetId: TurnstileWidgetId) => void;
      remove?: (widgetId: TurnstileWidgetId) => void;
    };
    __turnstileReady?: Promise<void>;
  }
}

const props = defineProps<{
  siteKey: string;
}>();

const token = defineModel<string>({ default: '' });
const ui = useUiStore();
const container = ref<HTMLElement | null>(null);
let widgetId: TurnstileWidgetId | null = null;

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileReady) return window.__turnstileReady;

  window.__turnstileReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Turnstile script failed to load'));
    document.head.appendChild(script);
  });
  return window.__turnstileReady;
}

async function renderWidget() {
  token.value = '';
  await loadTurnstileScript();
  await nextTick();
  if (!container.value || !window.turnstile || !props.siteKey) return;

  if (widgetId && window.turnstile.remove) {
    window.turnstile.remove(widgetId);
  }
  container.value.innerHTML = '';
  widgetId = window.turnstile.render(container.value, {
    sitekey: props.siteKey,
    theme: ui.theme,
    size: 'flexible',
    callback: (value) => {
      token.value = value;
    },
    'expired-callback': () => {
      token.value = '';
    },
    'error-callback': () => {
      token.value = '';
    },
  });
}

function reset() {
  token.value = '';
  if (widgetId && window.turnstile) {
    window.turnstile.reset(widgetId);
  }
}

onMounted(renderWidget);
watch(() => [props.siteKey, ui.theme] as const, renderWidget);

onBeforeUnmount(() => {
  if (widgetId && window.turnstile?.remove) {
    window.turnstile.remove(widgetId);
  }
});

defineExpose({ reset });
</script>

<template>
  <div class="min-h-[65px] w-full overflow-hidden">
    <div ref="container" class="w-full"></div>
  </div>
</template>
