import { defineStore } from 'pinia';
import { ref } from 'vue';

export const Theme = {
  SYSTEM: 'system',
  LIGHT: 'light',
  DARK: 'dark',
} as const;

export type Theme = (typeof Theme)[keyof typeof Theme];
export type ResolvedTheme = Exclude<Theme, typeof Theme.SYSTEM>;

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

const THEME_STORAGE_KEY = 'lt-theme';

let toastId = 0;

export const useUiStore = defineStore('ui', () => {
  const systemThemeQuery = window.matchMedia('(prefers-color-scheme: dark)');
  const storedTheme = localStorage.getItem(THEME_STORAGE_KEY);
  const theme = ref<Theme>(
    Object.values(Theme).includes(storedTheme as Theme) ? (storedTheme as Theme) : Theme.SYSTEM,
  );
  const resolvedTheme = ref<ResolvedTheme>(resolveTheme(theme.value));
  const toasts = ref<Toast[]>([]);
  const mobileMenuOpen = ref(false);
  const routeLoading = ref(false);
  let routeLoadingTimer: number | undefined;
  let themeListenerAttached = false;

  function resolveTheme(value: Theme): ResolvedTheme {
    if (value === Theme.SYSTEM) {
      return systemThemeQuery.matches ? Theme.DARK : Theme.LIGHT;
    }
    return value;
  }

  function applyTheme(value: Theme) {
    resolvedTheme.value = resolveTheme(value);
    document.documentElement.classList.toggle('dark', resolvedTheme.value === Theme.DARK);
  }

  function setTheme(t: Theme) {
    theme.value = t;
    localStorage.setItem(THEME_STORAGE_KEY, t);
    applyTheme(t);
  }

  function toggleTheme() {
    const themes: Theme[] = [Theme.SYSTEM, Theme.LIGHT, Theme.DARK];
    const currentIndex = themes.indexOf(theme.value);
    setTheme(themes[(currentIndex + 1) % themes.length]);
  }

  function initTheme() {
    applyTheme(theme.value);
    if (!themeListenerAttached) {
      systemThemeQuery.addEventListener('change', handleSystemThemeChange);
      themeListenerAttached = true;
    }
  }

  function handleSystemThemeChange() {
    if (theme.value === Theme.SYSTEM) applyTheme(theme.value);
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
    resolvedTheme,
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
