import { ref } from 'vue';

interface ConfirmOptions {
  message: string;
  title?: string;
  confirmText?: string;
  cancelText?: string;
  danger?: boolean;
}

interface ConfirmState extends ConfirmOptions {
  open: boolean;
  resolve?: (value: boolean) => void;
}

const state = ref<ConfirmState>({
  open: false,
  message: '',
});

export function useConfirm() {
  function confirm(options: ConfirmOptions | string): Promise<boolean> {
    const opts: ConfirmOptions =
      typeof options === 'string' ? { message: options, danger: true } : options;
    return new Promise<boolean>((resolve) => {
      state.value = { open: true, resolve, ...opts };
    });
  }

  return { confirm, state };
}
