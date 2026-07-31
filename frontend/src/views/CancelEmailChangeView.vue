<script setup lang="ts">
import { computed, ref } from 'vue';
import { RouterLink, useRoute } from 'vue-router';
import { apiCancelEmailChange } from '@/api/auth';
import { t } from '@/i18n';
import { siteTitle } from '@/stores/site';
import BaseButton from '@/components/base/BaseButton.vue';

const route = useRoute();
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));
const loading = ref(false);
const completed = ref(false);
const error = ref('');

async function cancelEmailChange() {
  if (!token.value) {
    error.value = t('emailChangeCancel.invalid');
    return;
  }
  loading.value = true;
  error.value = '';
  try {
    await apiCancelEmailChange(token.value);
    completed.value = true;
  } catch {
    error.value = t('emailChangeCancel.invalid');
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
      class="w-full max-w-md rounded-lg border border-slate-200/80 bg-white px-4 py-6 shadow-sm dark:border-slate-800 dark:bg-slate-900 sm:p-8"
    >
      <p class="text-sm font-semibold text-slate-500 dark:text-slate-400">{{ siteTitle }}</p>
      <h1 class="mt-4 text-2xl font-bold text-slate-950 dark:text-white">
        {{ t('emailChangeCancel.title') }}
      </h1>
      <p class="mt-4 text-base leading-7 text-slate-600 dark:text-slate-300">
        {{ completed ? t('emailChangeCancel.success') : t('emailChangeCancel.description') }}
      </p>
      <p v-if="error" class="mt-4 text-sm text-red-500">{{ error }}</p>
      <div class="mt-6">
        <BaseButton
          v-if="!completed"
          filled
          :loading="loading"
          class="w-full"
          @click="cancelEmailChange"
        >
          {{ t('emailChangeCancel.confirm') }}
        </BaseButton>
        <BaseButton v-else :as="RouterLink" to="/" filled class="w-full">
          {{ t('emailChangeCancel.back') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
