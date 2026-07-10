<script setup lang="ts">
import { useConfirm } from '@/composables/useConfirm';
import { t } from '@/i18n';
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
    :title="state.title ?? t('common.confirmTitle')"
    @update:model-value="(v: boolean) => !v && respond(false)"
  >
    <p class="text-sm text-slate-700 dark:text-slate-300">{{ state.message }}</p>
    <template #footer>
      <BaseButton size="sm" @click="respond(false)">
        {{ state.cancelText ?? t('common.cancel') }}
      </BaseButton>
      <BaseButton size="sm" :variant="state.danger ? 'danger' : 'primary'" @click="respond(true)">
        {{ state.confirmText ?? t('common.confirm') }}
      </BaseButton>
    </template>
  </BaseModal>
</template>
