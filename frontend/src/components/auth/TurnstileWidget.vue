<script setup lang="ts">
import { nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { useUiStore, type ResolvedTheme } from '@/stores/ui';
import { t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';

type TurnstileWidgetId = string;

declare global {
  interface Window {
    turnstile?: {
      render: (
        element: HTMLElement,
        options: {
          sitekey: string;
          theme: ResolvedTheme;
          size: 'flexible';
          retry: 'never';
          'refresh-expired': 'auto';
          'refresh-timeout': 'auto';
          'response-field': false;
          'feedback-enabled': false;
          callback: (token: string) => void;
          'expired-callback': () => void;
          'timeout-callback': () => void;
          'unsupported-callback': () => void;
          'error-callback': (errorCode: string) => boolean;
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
const errorKey = ref('');
const errorCode = ref('');
let widgetId: TurnstileWidgetId | null = null;
let renderSequence = 0;

function removeWidget() {
  if (widgetId !== null && window.turnstile?.remove) {
    window.turnstile.remove(widgetId);
  }
  widgetId = null;
  if (container.value) container.value.innerHTML = '';
}

function showError(key: string, code = '') {
  token.value = '';
  errorKey.value = key;
  errorCode.value = code;
}

function loadTurnstileScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (window.__turnstileReady) return window.__turnstileReady;

  window.__turnstileReady = new Promise((resolve, reject) => {
    const script = document.createElement('script');
    script.src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';
    script.async = true;
    script.defer = true;
    script.onload = () => {
      if (window.turnstile) {
        resolve();
        return;
      }
      window.__turnstileReady = undefined;
      script.remove();
      reject(new Error('Turnstile API unavailable after script load'));
    };
    script.onerror = () => {
      window.__turnstileReady = undefined;
      script.remove();
      reject(new Error('Turnstile script failed to load'));
    };
    document.head.appendChild(script);
  });
  return window.__turnstileReady;
}

async function renderWidget() {
  const sequence = ++renderSequence;
  token.value = '';
  errorKey.value = '';
  errorCode.value = '';
  removeWidget();

  try {
    await loadTurnstileScript();
  } catch {
    if (sequence === renderSequence) showError('auth.turnstile.loadFailed');
    return;
  }
  await nextTick();
  if (sequence !== renderSequence || !container.value || !window.turnstile || !props.siteKey) {
    return;
  }

  try {
    widgetId = window.turnstile.render(container.value, {
      sitekey: props.siteKey,
      theme: ui.resolvedTheme,
      size: 'flexible',
      retry: 'never',
      'refresh-expired': 'auto',
      'refresh-timeout': 'auto',
      'response-field': false,
      'feedback-enabled': false,
      callback: (value) => {
        errorKey.value = '';
        errorCode.value = '';
        token.value = value;
      },
      'expired-callback': () => {
        showError('auth.turnstile.expired');
      },
      'timeout-callback': () => {
        showError('auth.turnstile.expired');
      },
      'unsupported-callback': () => {
        showError('auth.turnstile.unsupported');
        window.setTimeout(removeWidget, 0);
      },
      'error-callback': (code) => {
        showError('auth.turnstile.error', code);
        window.setTimeout(removeWidget, 0);
        return true;
      },
    });
  } catch {
    showError('auth.turnstile.loadFailed');
    removeWidget();
  }
}

function reset() {
  token.value = '';
  errorKey.value = '';
  errorCode.value = '';
  if (widgetId !== null && window.turnstile) {
    window.turnstile.reset(widgetId);
  } else {
    void renderWidget();
  }
}

onMounted(() => void renderWidget());
watch(
  () => [props.siteKey, ui.resolvedTheme] as const,
  () => void renderWidget(),
);

onBeforeUnmount(() => {
  renderSequence += 1;
  removeWidget();
});

defineExpose({ reset });
</script>

<template>
  <div class="min-h-[65px] w-full">
    <div v-show="!errorKey" ref="container" class="w-full overflow-hidden"></div>
    <div
      v-if="errorKey"
      class="flex min-h-[65px] items-center justify-between gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 dark:border-red-900/70 dark:bg-red-950/30"
      role="alert"
    >
      <p class="min-w-0 text-sm leading-5 text-red-700 dark:text-red-300">
        {{ t(errorKey, { code: errorCode }) }}
      </p>
      <BaseButton class="shrink-0" size="sm" type="button" @click="renderWidget">
        {{ t('auth.turnstile.retry') }}
      </BaseButton>
    </div>
  </div>
</template>
