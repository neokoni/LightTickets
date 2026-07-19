<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { apiRequestRegistrationVerificationCode } from '@/api/auth';
import { siteConfig, siteTitle } from '@/stores/site';
import { t } from '@/i18n';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseButton from '@/components/base/BaseButton.vue';
import TurnstileWidget from '@/components/auth/TurnstileWidget.vue';
import { ApiError } from '@/types/api';

const router = useRouter();
const auth = useAuthStore();

const username = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const emailVerificationCode = ref('');
const turnstileToken = ref('');
const turnstileWidget = ref<InstanceType<typeof TurnstileWidget> | null>(null);
const error = ref('');
const loading = ref(false);
const codeSending = ref(false);
const codeSentEmail = ref('');
const resendSeconds = ref(0);
let resendTimer: number | null = null;

const normalizedEmail = computed(() => email.value.trim().toLowerCase());
const currentEmailIsCoolingDown = computed(
  () => codeSentEmail.value === normalizedEmail.value && resendSeconds.value > 0,
);

function clearResendTimer() {
  if (resendTimer !== null) window.clearInterval(resendTimer);
  resendTimer = null;
}

function startResendCountdown(seconds: number) {
  clearResendTimer();
  resendSeconds.value = seconds;
  resendTimer = window.setInterval(() => {
    resendSeconds.value = Math.max(0, resendSeconds.value - 1);
    if (resendSeconds.value === 0) clearResendTimer();
  }, 1000);
}

function resolveRequestError(e: unknown, fallbackKey: string): string {
  if (e instanceof ApiError && e.isCloudflareChallenge) {
    return t('auth.requestChallenged', { rayId: e.requestId ?? '-' });
  }
  return e instanceof Error ? e.message : t(fallbackKey);
}

onMounted(() => {
  if (!siteConfig.allowWebRegister) {
    router.replace('/login');
  }
});

onBeforeUnmount(clearResendTimer);

async function sendVerificationCode() {
  error.value = '';
  codeSending.value = true;
  try {
    const result = await apiRequestRegistrationVerificationCode(email.value, turnstileToken.value);
    emailVerificationCode.value = '';
    codeSentEmail.value = normalizedEmail.value;
    startResendCountdown(result.retryAfterSeconds);
  } catch (e) {
    error.value = resolveRequestError(e, 'auth.register.sendCodeFailed');
  } finally {
    codeSending.value = false;
    turnstileWidget.value?.reset();
  }
}

async function submit() {
  error.value = '';
  if (password.value !== confirmPassword.value) {
    error.value = t('auth.passwordMismatch');
    return;
  }
  if (password.value.length < 8) {
    error.value = t('auth.passwordMinLength');
    return;
  }
  if (
    siteConfig.registrationEmailVerificationEnabled &&
    !/^\d{6}$/.test(emailVerificationCode.value)
  ) {
    error.value = t('auth.register.codePlaceholder');
    return;
  }
  loading.value = true;
  try {
    await auth.register(
      email.value,
      password.value,
      username.value,
      siteConfig.registrationEmailVerificationEnabled ? emailVerificationCode.value : undefined,
      turnstileToken.value,
    );
    router.push('/');
  } catch (e) {
    error.value = resolveRequestError(e, 'auth.register.failed');
    turnstileWidget.value?.reset();
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
          {{ t('auth.register.title') }}
        </h1>
        <p class="mt-4 text-base leading-8 text-slate-600 dark:text-slate-300">
          {{ t('auth.register.subtitle') }}
        </p>
      </div>

      <form class="mt-6 space-y-4" @submit.prevent="submit">
        <BaseInput v-model="username" :label="t('user.username')" placeholder="your_name" />
        <BaseInput
          v-model="email"
          :label="t('user.email')"
          type="email"
          placeholder="you@example.com"
        />
        <BaseInput
          v-model="password"
          :label="t('auth.password')"
          type="password"
          :placeholder="t('auth.passwordMinLength')"
        />
        <BaseInput
          v-model="confirmPassword"
          :label="t('auth.confirmPassword')"
          type="password"
          :placeholder="t('auth.confirmPasswordPlaceholder')"
        />
        <TurnstileWidget
          v-if="siteConfig.turnstile.enabled"
          ref="turnstileWidget"
          v-model="turnstileToken"
          :site-key="siteConfig.turnstile.siteKey"
        />

        <div v-if="siteConfig.registrationEmailVerificationEnabled" class="space-y-1.5">
          <div class="flex items-end gap-2">
            <div class="min-w-0 flex-1">
              <BaseInput
                v-model="emailVerificationCode"
                :label="t('auth.register.code')"
                :placeholder="t('auth.register.codePlaceholder')"
                inputmode="numeric"
                autocomplete="one-time-code"
                maxlength="6"
              />
            </div>
            <BaseButton
              type="button"
              class="h-[38px] w-36 shrink-0"
              :loading="codeSending"
              :disabled="
                !normalizedEmail ||
                currentEmailIsCoolingDown ||
                (siteConfig.turnstile.enabled && !turnstileToken)
              "
              @click="sendVerificationCode"
            >
              {{
                currentEmailIsCoolingDown
                  ? t('auth.register.resendIn', { seconds: resendSeconds })
                  : t('auth.register.sendCode')
              }}
            </BaseButton>
          </div>
          <p
            v-if="codeSentEmail && codeSentEmail === normalizedEmail"
            class="text-xs text-green-600 dark:text-green-400"
          >
            {{ t('auth.register.codeSent') }}
          </p>
        </div>

        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

        <BaseButton
          filled
          type="submit"
          :loading="loading"
          :disabled="
            (siteConfig.turnstile.enabled && !turnstileToken) ||
            (siteConfig.registrationEmailVerificationEnabled &&
              !/^\d{6}$/.test(emailVerificationCode))
          "
          class="w-full"
        >
          {{ t('auth.register.title') }}
        </BaseButton>
      </form>

      <p class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        {{ t('auth.hasAccount') }}
        <RouterLink
          to="/login"
          class="font-semibold text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300 transition"
          >{{ t('auth.login.title') }}</RouterLink
        >
      </p>
    </div>
  </div>
</template>
