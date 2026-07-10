import { computed } from 'vue';
import { Theme, useUiStore } from '@/stores/ui';

export function useTheme() {
  const ui = useUiStore();
  const isDark = computed(() => ui.theme === Theme.DARK);
  return { isDark, toggle: ui.toggleTheme, set: ui.setTheme };
}
