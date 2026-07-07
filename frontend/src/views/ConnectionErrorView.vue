<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, type Router } from 'vue-router';
import { getSiteConfig } from '@/api/setup';
import { setSiteConfigCache } from '@/stores/site';
import BaseButton from '@/components/base/BaseButton.vue';

let router: Router | null = null;
try {
  router = useRouter();
} catch {
  router = null;
}
const retrying = ref(false);

async function retry() {
  retrying.value = true;
  try {
    const config = await getSiteConfig();
    setSiteConfigCache(config);
    if (router) {
      router.push('/');
    } else {
      window.location.reload();
    }
  } catch {
    // still no connection
  } finally {
    retrying.value = false;
  }
}
</script>

<template>
  <div class="min-h-screen flex items-center justify-center px-4">
    <div class="text-center space-y-4">
      <h1 class="text-2xl font-bold text-slate-900 dark:text-white">无法连接到服务器</h1>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        请检查后端服务是否正在运行，或稍后重试。
      </p>
      <BaseButton :disabled="retrying" variant="primary" @click="retry">
        {{ retrying ? '重试中...' : '重试' }}
      </BaseButton>
    </div>
  </div>
</template>
