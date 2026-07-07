<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';

const route = useRoute();

const navItems = [
  { to: '/admin/labels', label: '标签', icon: 'lucide:tag' },
  { to: '/admin/servers', label: '服务器', icon: 'lucide:server' },
  { to: '/admin/templates', label: '模板', icon: 'lucide:layout-template' },
  { to: '/admin/users', label: '用户', icon: 'lucide:users' },
  { to: '/admin/settings', label: '设置', icon: 'lucide:settings' },
  { to: '/admin/storage', label: '存储', icon: 'lucide:database' },
];
</script>

<template>
  <div class="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
    <nav class="flex md:flex-col gap-1">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="flex items-center gap-2 px-4 py-3 text-sm rounded-md transition"
        :class="
          route.path === item.to
            ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
            : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
        "
      >
        <Icon :icon="item.icon" class="w-4 h-4" />
        {{ item.label }}
      </RouterLink>
    </nav>
    <div>
      <RouterView />
    </div>
  </div>
</template>
