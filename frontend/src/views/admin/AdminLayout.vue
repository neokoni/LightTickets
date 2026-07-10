<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { RouterLink, RouterView, useRoute } from 'vue-router';
import { t } from '@/i18n';

const route = useRoute();

const navItems = [
  { to: '/admin/labels', labelKey: 'admin.nav.labels', icon: 'lucide:tag' },
  { to: '/admin/servers', labelKey: 'admin.nav.servers', icon: 'lucide:server' },
  { to: '/admin/templates', labelKey: 'admin.nav.templates', icon: 'lucide:layout-template' },
  { to: '/admin/users', labelKey: 'admin.nav.users', icon: 'lucide:users' },
  { to: '/admin/settings', labelKey: 'admin.nav.settings', icon: 'lucide:settings' },
  { to: '/admin/mail', labelKey: 'admin.nav.mail', icon: 'lucide:mail' },
  { to: '/admin/turnstile', labelKey: 'admin.nav.turnstile', icon: 'lucide:shield-check' },
  { to: '/admin/storage', labelKey: 'admin.nav.storage', icon: 'lucide:database' },
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
        {{ t(item.labelKey) }}
      </RouterLink>
    </nav>
    <div>
      <RouterView />
    </div>
  </div>
</template>
