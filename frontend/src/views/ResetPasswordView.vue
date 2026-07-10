<script setup lang="ts">
import { computed, ref } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import { apiConfirmPasswordReset } from '@/api/auth';
import { t } from '@/i18n';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseButton from '@/components/base/BaseButton.vue';

const route = useRoute();
const router = useRouter();
const token = computed(() => (typeof route.query.token === 'string' ? route.query.token : ''));

const password = ref('');
const confirmPassword = ref('');
const error = ref('');
const success = ref(false);
const loading = ref(false);

async function submit() {
  error.value = '';
  if (!token.value) {
    error.value = t('auth.reset.missingToken');
    return;
  }
  if (password.value.length < 8) {
    error.value = t('profile.password.minLength');
    return;
  }
  if (password.value !== confirmPassword.value) {
    error.value = t('auth.passwordMismatch');
    return;
  }

  loading.value = true;
  try {
    await apiConfirmPasswordReset(token.value, password.value);
    success.value = true;
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('auth.reset.failed');
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
          LightTickets
        </p>
        <h1
          class="mt-4 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl"
        >
          {{ t('auth.reset.title') }}
        </h1>
        <p class="mt-4 text-base leading-8 text-slate-600 dark:text-slate-300">
          {{ t('auth.reset.subtitle') }}
        </p>
      </div>

      <form v-if="!success" class="mt-6 space-y-4" @submit.prevent="submit">
        <BaseInput
          v-model="password"
          :label="t('profile.password.new')"
          type="password"
          :placeholder="t('profile.password.minLength')"
        />
        <BaseInput
          v-model="confirmPassword"
          :label="t('profile.password.confirmNew')"
          type="password"
          :placeholder="t('profile.password.confirmPlaceholder')"
        />

        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

        <BaseButton filled type="submit" :loading="loading" class="w-full">
          {{ t('auth.reset.submit') }}
        </BaseButton>
      </form>

      <div v-else class="mt-6 space-y-4">
        <p class="text-sm text-green-600 dark:text-green-400">
          {{ t('auth.reset.success') }}
        </p>
        <BaseButton filled class="w-full" @click="router.push('/login')">
          {{ t('auth.login.title') }}
        </BaseButton>
      </div>
    </div>
  </div>
</template>
