<script setup lang="ts">
defineProps<{
  username: string;
  avatarUrl?: string | null;
}>();
</script>

<template>
  <img
    v-if="avatarUrl"
    :src="avatarUrl"
    :title="username"
    class="w-full h-full rounded-full object-cover bg-slate-100 dark:bg-slate-800"
  />
  <div
    v-else
    :title="username"
    class="w-full h-full rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-700 dark:text-slate-300"
  >
    {{ username[0].toUpperCase() }}
  </div>
</template>
