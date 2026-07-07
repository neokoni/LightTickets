<script setup lang="ts">
defineProps<{
  color?: string;
  variant?: 'solid' | 'outline';
}>();
</script>

<template>
  <span
    class="inline-flex items-center px-2 py-0.5 text-xs font-medium rounded-full"
    :class="variant === 'outline' ? 'border border-current' : ''"
    :style="color ? { backgroundColor: color + '20', color } : undefined"
  >
    <slot />
  </span>
</template>
