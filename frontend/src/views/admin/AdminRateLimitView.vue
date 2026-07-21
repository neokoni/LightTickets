<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getSettings, updateSettings } from '@/api/setup';
import type { RateLimitConfig } from '@/types/site';
import { ToastType, useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseLoadingState from '@/components/base/BaseLoadingState.vue';

const ui = useUiStore();
const config = ref<RateLimitConfig | null>(null);
const defaults = ref<RateLimitConfig | null>(null);
const loading = ref(false);
const saving = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    const settings = await getSettings();
    config.value = settings.rateLimit;
    defaults.value = settings.rateLimitDefaults;
  } catch (e) {
    handleError(e, t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
});

function placeholder(value: number | undefined): string {
  return value === undefined ? '' : String(value);
}

async function save() {
  if (!config.value) return;
  saving.value = true;
  try {
    const result = await updateSettings({ rateLimit: config.value });
    config.value = result.rateLimit;
    defaults.value = result.rateLimitDefaults;
    ui.toast(t('admin.rateLimit.saved'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.saveFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <div class="space-y-1">
      <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
        {{ t('admin.rateLimit.title') }}
      </h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        {{ t('admin.rateLimit.description') }}
      </p>
    </div>

    <BaseLoadingState v-if="loading" />

    <div v-else-if="config" class="space-y-4 max-w-2xl">
      <section
        class="space-y-4 px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
            {{ t('admin.rateLimit.globalTitle') }}
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {{ t('admin.rateLimit.globalHelp') }}
          </p>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BaseInput
            v-model.number="config.global.windowSeconds"
            :label="t('admin.rateLimit.windowSeconds')"
            type="number"
            min="1"
            max="86400"
            :placeholder="placeholder(defaults?.global.windowSeconds)"
          />
          <BaseInput
            v-model.number="config.global.maxRequests"
            :label="t('admin.rateLimit.maxRequests')"
            type="number"
            min="1"
            max="100000"
            :placeholder="placeholder(defaults?.global.maxRequests)"
          />
        </div>
      </section>

      <section
        class="space-y-4 px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
            {{ t('admin.rateLimit.authTitle') }}
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {{ t('admin.rateLimit.authHelp') }}
          </p>
        </div>
        <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <BaseInput
            v-model.number="config.auth.windowSeconds"
            :label="t('admin.rateLimit.windowSeconds')"
            type="number"
            min="1"
            max="86400"
            :placeholder="placeholder(defaults?.auth.windowSeconds)"
          />
          <BaseInput
            v-model.number="config.auth.maxRequests"
            :label="t('admin.rateLimit.maxRequests')"
            type="number"
            min="1"
            max="100000"
            :placeholder="placeholder(defaults?.auth.maxRequests)"
          />
        </div>
      </section>

      <section
        class="space-y-4 px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <h3 class="text-sm font-semibold text-slate-900 dark:text-white">
            {{ t('admin.rateLimit.emailTitle') }}
          </h3>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {{ t('admin.rateLimit.emailHelp') }}
          </p>
        </div>
        <BaseInput
          v-model.number="config.email.cooldownSeconds"
          :label="t('admin.rateLimit.cooldownSeconds')"
          type="number"
          min="1"
          max="86400"
          :placeholder="placeholder(defaults?.email.cooldownSeconds)"
        />
      </section>

      <BaseButton filled :loading="saving" @click="save">
        {{ saving ? t('common.saving') : t('common.save') }}
      </BaseButton>
    </div>
  </div>
</template>
