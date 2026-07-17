<script setup lang="ts">
const checked = defineModel<boolean>('checked', { default: false });

defineProps<{
  disabled?: boolean;
}>();
</script>

<template>
  <button
    type="button"
    :disabled="disabled"
    class="base-checkbox"
    role="checkbox"
    :aria-checked="checked"
    :data-checked="checked"
    @click="checked = !checked"
  />
</template>
