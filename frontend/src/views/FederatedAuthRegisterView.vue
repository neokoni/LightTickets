<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import {
  apiCompleteFederatedAuthRegistration,
  apiGetFederatedAuthRegistration,
  apiRequestFederatedAuthVerification,
} from '@/api/federatedauth';
import { useAuthStore } from '@/stores/auth';
import { siteConfig, siteTitle } from '@/stores/site';
import { t } from '@/i18n';
import { ApiError } from '@/types/api';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseLoadingState from '@/components/base/BaseLoadingState.vue';
import TurnstileWidget from '@/components/auth/TurnstileWidget.vue';
import type { FederatedAuthRegistrationSession } from '@/types/federatedauth';

const router = useRouter();
const auth = useAuthStore();
const session = ref<FederatedAuthRegistrationSession | null>(null);
const loadingSession = ref(true);
const username = ref('');
const email = ref('');
const password = ref('');
const confirmPassword = ref('');
const emailVerificationCode = ref('');
const turnstileToken = ref('');
const turnstileWidget = ref<InstanceType<typeof TurnstileWidget> | null>(null);
const error = ref('');
const submitting = ref(false);
const codeSending = ref(false);
const sentEmail = ref('');
const resendSeconds = ref(0);
let resendTimer: number | null = null;

const normalizedEmail = computed(() => email.value.trim().toLowerCase());
const coolingDown = computed(
  () => sentEmail.value === normalizedEmail.value && resendSeconds.value > 0,
);

function clearTimer() {
  if (resendTimer !== null) window.clearInterval(resendTimer);
  resendTimer = null;
}

function startTimer(seconds: number) {
  clearTimer();
  resendSeconds.value = seconds;
  resendTimer = window.setInterval(() => {
    resendSeconds.value = Math.max(0, resendSeconds.value - 1);
    if (!resendSeconds.value) clearTimer();
  }, 1000);
}

function message(value: unknown, fallback: string): string {
  if (value instanceof ApiError && value.isCloudflareChallenge) {
    return t('auth.requestChallenged', { rayId: value.requestId ?? '-' });
  }
  return value instanceof Error ? value.message : t(fallback);
}

onMounted(async () => {
  try {
    session.value = await apiGetFederatedAuthRegistration();
    username.value = session.value.usernameHint ?? '';
  } catch {
    await router.replace('/login');
  } finally {
    loadingSession.value = false;
  }
});

onBeforeUnmount(clearTimer);

async function sendCode() {
  error.value = '';
  codeSending.value = true;
  try {
    const result = await apiRequestFederatedAuthVerification(email.value, turnstileToken.value);
    sentEmail.value = normalizedEmail.value;
    emailVerificationCode.value = '';
    startTimer(result.retryAfterSeconds);
  } catch (caught) {
    error.value = message(caught, 'auth.register.sendCodeFailed');
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
  submitting.value = true;
  try {
    const result = await apiCompleteFederatedAuthRegistration({
      email: email.value,
      username: username.value,
      password: password.value,
      emailVerificationCode: siteConfig.registrationEmailVerificationEnabled
        ? emailVerificationCode.value
        : undefined,
      turnstileToken: turnstileToken.value,
    });
    auth.setTokens(result.accessToken, result.user);
    await router.replace('/');
  } catch (caught) {
    error.value = message(caught, 'federatedauth.registrationFailed');
    turnstileWidget.value?.reset();
  } finally {
    submitting.value = false;
  }
}
</script>

<template>
  <div class="flex min-h-[calc(100vh-16rem)] items-center justify-center px-2 py-10 sm:px-6">
    <div
      class="w-full max-w-md rounded-xl border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/80 sm:p-8"
    >
      <BaseLoadingState v-if="loadingSession" />
      <template v-else-if="session">
        <p class="text-sm font-semibold tracking-[0.2em] text-slate-500 uppercase">
          {{ siteTitle }}
        </p>
        <div class="mt-4 flex items-center gap-3">
          <img
            v-if="session.provider.iconUrl"
            :src="session.provider.iconUrl"
            :alt="session.provider.name"
            class="h-9 w-9 rounded object-contain"
          />
          <div>
            <h1 class="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
              {{ t('federatedauth.createAccount') }}
            </h1>
            <p class="text-sm text-slate-500 dark:text-slate-400">
              {{ t('federatedauth.createAccountHelp', { provider: session.provider.name }) }}
            </p>
          </div>
        </div>

        <form class="mt-6 space-y-4" @submit.prevent="submit">
          <BaseInput v-model="username" :label="t('user.username')" />
          <BaseInput v-model="email" :label="t('user.email')" type="email" />
          <BaseInput
            v-model="password"
            :label="t('auth.password')"
            type="password"
            :placeholder="t('auth.passwordMinLength')"
          />
          <BaseInput v-model="confirmPassword" :label="t('auth.confirmPassword')" type="password" />
          <TurnstileWidget
            v-if="siteConfig.turnstile.enabled"
            ref="turnstileWidget"
            v-model="turnstileToken"
            :site-key="siteConfig.turnstile.siteKey"
          />
          <div v-if="siteConfig.registrationEmailVerificationEnabled" class="flex items-end gap-2">
            <BaseInput
              v-model="emailVerificationCode"
              class="min-w-0 flex-1"
              :label="t('auth.register.code')"
              inputmode="numeric"
              maxlength="6"
            />
            <BaseButton
              type="button"
              class="h-[38px] w-36 shrink-0"
              :loading="codeSending"
              :disabled="
                !normalizedEmail || coolingDown || (siteConfig.turnstile.enabled && !turnstileToken)
              "
              @click="sendCode"
            >
              {{
                coolingDown
                  ? t('auth.register.resendIn', { seconds: resendSeconds })
                  : t('auth.register.sendCode')
              }}
            </BaseButton>
          </div>
          <p v-if="error" class="text-sm text-red-500">{{ error }}</p>
          <BaseButton
            filled
            type="submit"
            class="w-full"
            :loading="submitting"
            :disabled="
              password.length < 8 ||
              !username.trim() ||
              !normalizedEmail ||
              (siteConfig.turnstile.enabled && !turnstileToken) ||
              (siteConfig.registrationEmailVerificationEnabled &&
                !/^\d{6}$/.test(emailVerificationCode))
            "
          >
            {{ t('federatedauth.createAndBind') }}
          </BaseButton>
        </form>
      </template>
    </div>
  </div>
</template>
