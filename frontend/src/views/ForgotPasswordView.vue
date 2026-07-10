<script setup lang="ts">
import { ref } from 'vue';
import { apiRequestPasswordReset } from '@/api/auth';
import { siteConfig, siteTitle } from '@/stores/site';
import { t } from '@/i18n';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseButton from '@/components/base/BaseButton.vue';
import TurnstileWidget from '@/components/auth/TurnstileWidget.vue';

const emailOrUsername = ref('');
const turnstileToken = ref('');
const turnstileWidget = ref<InstanceType<typeof TurnstileWidget> | null>(null);
const submitted = ref(false);
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  submitted.value = false;
  loading.value = true;
  try {
    await apiRequestPasswordReset(emailOrUsername.value, turnstileToken.value);
    submitted.value = true;
    turnstileWidget.value?.reset();
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('auth.forgot.failed');
    turnstileWidget.value?.reset();
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div
    class="flex min-h-[calc(100vh-16rem)] items-center justify-center px-4 py-10 sm:px-6 lg:px-8 lg:py-16"
  >
    <div
      class="w-full max-w-md rounded-xl border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/80 sm:p-8"
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
          {{ t('auth.forgot.title') }}
        </h1>
        <p class="mt-4 text-base leading-8 text-slate-600 dark:text-slate-300">
          {{ t('auth.forgot.subtitle') }}
        </p>
      </div>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <BaseInput
          v-model="emailOrUsername"
          :label="t('auth.emailOrUsername')"
          :placeholder="t('auth.emailOrUsernamePlaceholder')"
        />
        <TurnstileWidget
          v-if="siteConfig.turnstile.enabled"
          ref="turnstileWidget"
          v-model="turnstileToken"
          :site-key="siteConfig.turnstile.siteKey"
        />

        <p v-if="submitted" class="text-sm text-green-600 dark:text-green-400">
          {{ t('auth.forgot.sent') }}
        </p>
        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

        <BaseButton
          filled
          type="submit"
          :loading="loading"
          :disabled="!emailOrUsername.trim()"
          class="w-full"
        >
          {{ t('auth.forgot.submit') }}
        </BaseButton>
      </form>

      <p class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        <RouterLink
          to="/login"
          class="font-semibold text-slate-900 transition hover:text-slate-700 dark:text-slate-100 dark:hover:text-slate-300"
        >
          {{ t('auth.backToLogin') }}
        </RouterLink>
      </p>
    </div>
  </div>
</template>
