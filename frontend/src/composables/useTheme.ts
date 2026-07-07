import { computed } from 'vue';
import { useUiStore } from '@/stores/ui';

export function useTheme() {
  const ui = useUiStore();
  const isDark = computed(() => ui.theme === 'dark');
  return { isDark, toggle: ui.toggleTheme, set: ui.setTheme };
}
