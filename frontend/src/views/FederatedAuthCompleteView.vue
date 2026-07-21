<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/i18n';
import BaseLoadingState from '@/components/base/BaseLoadingState.vue';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string' || !value.startsWith('/') || value.includes('\\')) return '/';
  try {
    const resolved = new window.URL(value, window.location.origin);
    return resolved.origin === window.location.origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : '/';
  } catch {
    return '/';
  }
}

onMounted(async () => {
  await auth.restore();
  await router.replace(auth.isAuthenticated ? safeReturnTo(route.query.returnTo) : '/login');
});
</script>

<template>
  <div class="mx-auto max-w-lg py-16 text-center">
    <BaseLoadingState />
    <p class="mt-4 text-sm text-slate-500 dark:text-slate-400">
      {{ t('federatedauth.completing') }}
    </p>
  </div>
</template>
