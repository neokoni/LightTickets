<script setup lang="ts">
import { useConfirm } from '@/composables/useConfirm';
import BaseButton from './BaseButton.vue';
import BaseModal from './BaseModal.vue';

const { state } = useConfirm();

function respond(value: boolean) {
  state.value.resolve?.(value);
  state.value = { ...state.value, open: false, resolve: undefined };
}
</script>

<template>
  <BaseModal
    :model-value="state.open"
    :title="state.title ?? '请确认'"
    @update:model-value="(v: boolean) => !v && respond(false)"
  >
    <p class="text-sm text-slate-700 dark:text-slate-300">{{ state.message }}</p>
    <template #footer>
      <BaseButton size="sm" @click="respond(false)">
        {{ state.cancelText ?? '取消' }}
      </BaseButton>
      <BaseButton size="sm" :variant="state.danger ? 'danger' : 'primary'" @click="respond(true)">
        {{ state.confirmText ?? '确定' }}
      </BaseButton>
    </template>
  </BaseModal>
</template>
