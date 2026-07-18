import { defineStore } from 'pinia';
import { ref } from 'vue';

export const Theme = {
  LIGHT: 'light',
  DARK: 'dark',
} as const;

export type Theme = (typeof Theme)[keyof typeof Theme];

export const ToastType = {
  SUCCESS: 'success',
  ERROR: 'error',
  INFO: 'info',
} as const;

export type ToastType = (typeof ToastType)[keyof typeof ToastType];

export interface Toast {
  id: number;
  message: string;
  type: ToastType;
}

let toastId = 0;

export const useUiStore = defineStore('ui', () => {
  const theme = ref<Theme>(
    (localStorage.getItem('lt-theme') as Theme | null) ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? Theme.DARK : Theme.LIGHT),
  );
  const toasts = ref<Toast[]>([]);
  const mobileMenuOpen = ref(false);
  const routeLoading = ref(false);
  let routeLoadingTimer: number | undefined;

  function setTheme(t: Theme) {
    theme.value = t;
    localStorage.setItem('lt-theme', t);
    document.documentElement.classList.toggle('dark', t === Theme.DARK);
  }

  function toggleTheme() {
    setTheme(theme.value === Theme.DARK ? Theme.LIGHT : Theme.DARK);
  }

  function initTheme() {
    document.documentElement.classList.toggle('dark', theme.value === Theme.DARK);
  }

  function toast(message: string, type: ToastType = ToastType.INFO) {
    const id = ++toastId;
    toasts.value.push({ id, message, type });
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 4000);
  }

  function startRouteLoading() {
    window.clearTimeout(routeLoadingTimer);
    routeLoadingTimer = window.setTimeout(() => {
      routeLoading.value = true;
    }, 120);
  }

  function stopRouteLoading() {
    window.clearTimeout(routeLoadingTimer);
    routeLoadingTimer = undefined;
    routeLoading.value = false;
  }

  return {
    theme,
    toasts,
    mobileMenuOpen,
    routeLoading,
    setTheme,
    toggleTheme,
    initTheme,
    toast,
    startRouteLoading,
    stopRouteLoading,
  };
});
