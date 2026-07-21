<script setup lang="ts">
import { computed } from 'vue';
import { Icon } from '@iconify/vue';
import { RouterLink, RouterView, useRoute, useRouter } from 'vue-router';
import { t } from '@/i18n';
import BaseSelect from '@/components/base/BaseSelect.vue';

const route = useRoute();
const router = useRouter();

const navItems = [
  { to: '/admin/labels', labelKey: 'admin.nav.labels', icon: 'lucide:tag' },
  { to: '/admin/servers', labelKey: 'admin.nav.servers', icon: 'lucide:server' },
  { to: '/admin/templates', labelKey: 'admin.nav.templates', icon: 'lucide:layout-template' },
  { to: '/admin/users', labelKey: 'admin.nav.users', icon: 'lucide:users' },
  { to: '/admin/settings', labelKey: 'admin.nav.settings', icon: 'lucide:settings' },
  { to: '/admin/mail', labelKey: 'admin.nav.mail', icon: 'lucide:mail' },
  { to: '/admin/turnstile', labelKey: 'admin.nav.turnstile', icon: 'lucide:shield-check' },
  { to: '/admin/rate-limit', labelKey: 'admin.nav.rateLimit', icon: 'lucide:gauge' },
  { to: '/admin/federatedauth', labelKey: 'admin.nav.federatedauth', icon: 'lucide:key-round' },
  { to: '/admin/storage', labelKey: 'admin.nav.storage', icon: 'lucide:database' },
  { to: '/admin/about', labelKey: 'admin.nav.about', icon: 'lucide:info' },
];

const mobileNavOptions = computed(() =>
  navItems.map((item) => ({
    value: item.to,
    label: t(item.labelKey),
    icon: item.icon,
  })),
);

const selectedAdminPath = computed({
  get: () => route.path,
  set: (path: string) => {
    if (path !== route.path) router.push(path);
  },
});
</script>

<template>
  <div class="grid min-w-0 grid-cols-1 gap-6 md:grid-cols-[200px_minmax(0,1fr)]">
    <div class="md:hidden">
      <BaseSelect v-model="selectedAdminPath" :options="mobileNavOptions" variant="subtle" />
    </div>

    <nav class="settings-side-nav settings-side-nav-desktop">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        class="settings-side-nav-item"
        :data-active="route.path === item.to"
      >
        <Icon :icon="item.icon" class="w-4 h-4" />
        {{ t(item.labelKey) }}
      </RouterLink>
    </nav>
    <div class="min-w-0">
      <RouterView />
    </div>
  </div>
</template>
