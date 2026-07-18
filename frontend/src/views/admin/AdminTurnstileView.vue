<script setup lang="ts">
import { computed, ref, onMounted } from 'vue';
import { getSettings, updateSettings } from '@/api/setup';
import { setSiteConfigCache, siteConfig } from '@/stores/site';
import { ToastType, useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseLoadingState from '@/components/base/BaseLoadingState.vue';
import BaseToggle from '@/components/base/BaseToggle.vue';

const ui = useUiStore();
const enabled = ref(false);
const siteKey = ref('');
const secretKey = ref('');
const secretKeySet = ref(false);
const loading = ref(false);
const saving = ref(false);

const hasRequiredKeys = computed(
  () => !!siteKey.value.trim() && (secretKeySet.value || !!secretKey.value.trim()),
);

onMounted(async () => {
  loading.value = true;
  try {
    const config = await getSettings();
    enabled.value = config.turnstile.enabled;
    siteKey.value = config.turnstile.siteKey;
    secretKeySet.value = config.turnstile.secretKeySet;
  } catch (e) {
    handleError(e, t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
});

async function save() {
  if (enabled.value && !hasRequiredKeys.value) {
    ui.toast(t('admin.turnstile.keysRequired'), ToastType.ERROR);
    return;
  }

  saving.value = true;
  try {
    const result = await updateSettings({
      turnstile: {
        enabled: enabled.value,
        siteKey: siteKey.value,
        secretKey: secretKey.value || null,
      },
    });
    secretKey.value = '';
    secretKeySet.value = result.turnstile.secretKeySet;
    setSiteConfigCache({
      ...siteConfig,
      isSetup: siteConfig.isSetup === true,
      requireLogin: siteConfig.requireLogin === true,
      turnstile: {
        enabled:
          result.turnstile.enabled && !!result.turnstile.siteKey && result.turnstile.secretKeySet,
        siteKey: result.turnstile.siteKey,
      },
    });
    ui.toast(t('admin.turnstile.saved'), ToastType.SUCCESS);
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
        {{ t('admin.turnstile.title') }}
      </h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        {{ t('admin.turnstile.description') }}
      </p>
    </div>

    <BaseLoadingState v-if="loading" />

    <div v-else class="space-y-4 max-w-lg">
      <div
        class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            {{ t('admin.turnstile.enabled') }}
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {{ t('admin.turnstile.enabledHelp') }}
          </p>
        </div>
        <BaseToggle v-model="enabled" />
      </div>

      <template v-if="enabled">
        <BaseInput
          v-model="siteKey"
          :label="t('admin.turnstile.siteKey')"
          placeholder="0x4AAAA..."
        />
        <BaseInput
          v-model="secretKey"
          :label="t('admin.turnstile.secretKey')"
          type="password"
          :placeholder="
            secretKeySet ? t('admin.turnstile.secretKeyKeep') : t('admin.turnstile.secretKey')
          "
        />
      </template>

      <BaseButton filled :loading="saving" @click="save">
        {{ saving ? t('common.saving') : t('common.save') }}
      </BaseButton>
    </div>
  </div>
</template>
