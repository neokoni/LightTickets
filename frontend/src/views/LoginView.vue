<script setup lang="ts">
import { ref } from 'vue';
import { useRouter, useRoute } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { siteConfig } from '@/stores/site';
import { t } from '@/i18n';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseButton from '@/components/base/BaseButton.vue';

const router = useRouter();
const route = useRoute();
const auth = useAuthStore();

const emailOrUsername = ref('');
const password = ref('');
const error = ref('');
const loading = ref(false);

async function submit() {
  error.value = '';
  loading.value = true;
  try {
    await auth.login(emailOrUsername.value, password.value);
    const redirect = (route.query.redirect as string) || '/';
    router.push(redirect);
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('auth.login.failed');
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
          {{ t('auth.login.title') }}
        </h1>
        <p class="mt-4 text-base leading-8 text-slate-600 dark:text-slate-300">
          {{ t('auth.login.subtitle') }}
        </p>
      </div>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <BaseInput
          v-model="emailOrUsername"
          :label="t('auth.emailOrUsername')"
          type="text"
          :placeholder="t('auth.emailOrUsernamePlaceholder')"
        />
        <BaseInput
          v-model="password"
          :label="t('auth.password')"
          type="password"
          placeholder="••••••••"
        />

        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

        <BaseButton filled type="submit" :loading="loading" class="w-full">{{
          t('auth.login.title')
        }}</BaseButton>
      </form>

      <p
        v-if="siteConfig.allowWebRegister"
        class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400"
      >
        {{ t('auth.noAccount') }}
        <RouterLink
          to="/register"
          class="font-semibold text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300 transition"
          >{{ t('auth.register.title') }}</RouterLink
        >
      </p>
    </div>
  </div>
</template>
