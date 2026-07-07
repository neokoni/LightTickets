import { defineStore } from 'pinia';
import { ref } from 'vue';

export interface Toast {
  id: number;
  message: string;
  type: 'success' | 'error' | 'info';
}

let toastId = 0;

export const useUiStore = defineStore('ui', () => {
  const theme = ref<'light' | 'dark'>(
    (localStorage.getItem('lt-theme') as 'light' | 'dark') ||
      (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'),
  );
  const toasts = ref<Toast[]>([]);
  const mobileMenuOpen = ref(false);

  function setTheme(t: 'light' | 'dark') {
    theme.value = t;
    localStorage.setItem('lt-theme', t);
    document.documentElement.classList.toggle('dark', t === 'dark');
  }

  function toggleTheme() {
    setTheme(theme.value === 'dark' ? 'light' : 'dark');
  }

  function initTheme() {
    document.documentElement.classList.toggle('dark', theme.value === 'dark');
  }

  function toast(message: string, type: Toast['type'] = 'info') {
    const id = ++toastId;
    toasts.value.push({ id, message, type });
    setTimeout(() => {
      toasts.value = toasts.value.filter((t) => t.id !== id);
    }, 4000);
  }

  return { theme, toasts, mobileMenuOpen, setTheme, toggleTheme, initTheme, toast };
});
