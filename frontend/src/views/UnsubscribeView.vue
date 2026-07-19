<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { apiUnsubscribeEmailNotifications } from '@/api/auth';
import { t } from '@/i18n';
import { siteTitle } from '@/stores/site';
import BaseButton from '@/components/base/BaseButton.vue';

const route = useRoute();
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));
const loading = ref(false);
const completed = ref(false);
const error = ref('');

async function unsubscribe() {
  if (!token.value) {
    error.value = t('unsubscribe.invalid');
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await apiUnsubscribeEmailNotifications(token.value);
    completed.value = true;
  } catch {
    error.value = t('unsubscribe.invalid');
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div
    class="flex min-h-[calc(100vh-16rem)] items-center justify-center px-2 py-10 max-[341px]:px-1 sm:px-6 lg:px-8 lg:py-16"
  >
    <div
      class="w-full max-w-md rounded-xl border border-slate-200/80 bg-white/80 px-3 py-6 shadow-sm backdrop-blur max-[341px]:px-1 dark:border-slate-800/80 dark:bg-slate-900/80 sm:p-8"
    >
      <div>
        <p
          class="text-sm font-semibold tracking-[0.2em] text-slate-500 uppercase dark:text-slate-400"
        >
          {{ siteTitle }}
        </p>
        <h1
          class="mt-4 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl"
        >
          {{ t('unsubscribe.title') }}
        </h1>
        <p class="mt-4 text-base leading-8 text-slate-600 dark:text-slate-300">
          {{ completed ? t('unsubscribe.success') : t('unsubscribe.description') }}
        </p>
      </div>
      <p v-if="error" class="mt-4 text-sm text-red-500">{{ error }}</p>
      <div class="mt-6">
        <BaseButton v-if="!completed" filled :loading="loading" class="w-full" @click="unsubscribe">
          {{ t('unsubscribe.confirm') }}
        </BaseButton>
        <BaseButton v-else :as="RouterLink" to="/" filled class="w-full">
          {{ t('unsubscribe.back') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
