import { useUiStore } from '@/stores/ui';

export function handleError(e: unknown, fallback = '操作失败'): void {
  const message = e instanceof Error && e.message ? e.message : fallback;
  useUiStore().toast(message, 'error');
}
