<script setup lang="ts">
defineProps<{
  username: string
  avatarUrl?: string | null
  size?: 'xs' | 'sm' | 'md' | 'lg'
  ring?: boolean
}>()

const sizeMap: Record<string, { img: string; fallback: string }> = {
  xs: { img: 'w-8 h-8', fallback: 'w-8 h-8 text-xs font-medium' },
  sm: { img: 'w-6 h-6', fallback: 'w-6 h-6 text-[10px]' },
  md: { img: 'w-7 h-7', fallback: 'w-7 h-7 text-xs' },
  lg: { img: 'w-16 h-16', fallback: 'w-16 h-16 text-xl font-medium border border-slate-200 dark:border-slate-700' },
}
</script>

<template>
  <img
    v-if="avatarUrl"
    :src="avatarUrl"
    :title="username"
    class="rounded-full object-cover shrink-0"
    :class="[sizeMap[size || 'md'].img, ring ? 'ring-2 ring-white dark:ring-slate-900' : '']"
  />
  <div
    v-else
    :title="username"
    class="rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-700 dark:text-slate-300"
    :class="[sizeMap[size || 'md'].fallback, ring ? 'ring-2 ring-white dark:ring-slate-900' : '']"
  >{{ username[0].toUpperCase() }}</div>
</template>
