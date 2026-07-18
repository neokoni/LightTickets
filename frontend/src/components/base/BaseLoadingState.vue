<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { t } from '@/i18n';

defineProps<{
  label?: string;
}>();
</script>

<template>
  <div
    class="flex items-center justify-center gap-2 py-6 text-sm text-slate-500 dark:text-slate-400"
  >
    <Icon icon="lucide:loader-2" class="h-4 w-4 animate-spin" />
    <span>{{ label || t('common.loading') }}</span>
  </div>
</template>
