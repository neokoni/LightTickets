<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { computed } from 'vue';

const props = defineProps<{
  variant?: 'primary' | 'danger';
  filled?: boolean;
  size?: 'sm' | 'md' | 'lg';
  icon?: string;
  loading?: boolean;
  disabled?: boolean;
  as?: string | object;
  hasHover?: boolean;
}>();

const sizeClass = computed(() => {
  switch (props.size) {
    case 'sm':
      return 'px-2.5 py-1.5 text-xs';
    case 'lg':
      return 'px-6 py-3 text-sm';
    default:
      return 'px-5 py-2.5 text-sm';
  }
});

const variantClass = computed(() => {
  const v = props.variant || 'primary';
  const hover = props.hasHover !== false;
  if (props.filled) {
    const base =
      v === 'danger'
        ? 'bg-red-500 text-white border-none'
        : 'bg-slate-900 text-white border-none dark:bg-slate-100 dark:text-slate-900';
    const hoverClasses =
      v === 'danger'
        ? 'hover:bg-red-600 active:bg-red-700'
        : 'hover:bg-slate-800 active:bg-slate-950 dark:hover:bg-slate-200 dark:active:bg-slate-300';
    return hover ? `${base} ${hoverClasses}` : base;
  }
  const base =
    v === 'danger'
      ? 'bg-transparent border border-red-500/30 text-red-500 dark:border-red-400/30 dark:text-red-400'
      : 'bg-transparent border border-slate-300 text-slate-700 dark:border-slate-700 dark:text-slate-200';
  const hoverClasses =
    v === 'danger'
      ? 'hover:bg-red-500/10 active:bg-red-500/20 dark:hover:bg-red-400/10'
      : 'hover:bg-slate-100 active:bg-slate-200 dark:hover:bg-slate-800 dark:active:bg-slate-700';
  return hover ? `${base} ${hoverClasses}` : base;
});
</script>

<template>
  <component
    :is="as || 'button'"
    :disabled="as ? undefined : disabled || loading"
    class="inline-flex items-center justify-center gap-1.5 font-semibold rounded-md transition disabled:opacity-50 disabled:cursor-not-allowed"
    :class="[sizeClass, variantClass]"
  >
    <Icon v-if="loading" icon="lucide:loader-2" class="w-4 h-4 animate-spin" />
    <Icon v-else-if="icon" :icon="icon" class="w-4 h-4" />
    <slot />
  </component>
</template>
