<script setup lang="ts">
import { onMounted } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { t } from '@/i18n';
import BaseLoadingState from '@/components/base/BaseLoadingState.vue';
import { safeReturnTo } from '@/utils/returnTo';

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();

onMounted(async () => {
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
