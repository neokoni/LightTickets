import { ToastType, useUiStore } from '@/stores/ui';
import { t } from '@/i18n';

export function handleError(e: unknown, fallback = t('common.operationFailed')): void {
  const message = e instanceof Error && e.message ? e.message : fallback;
  useUiStore().toast(message, ToastType.ERROR);
}
