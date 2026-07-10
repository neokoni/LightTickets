<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getSettings, updateSettings } from '@/api/setup';
import { setRequireLoginCache, siteConfig, siteTitle } from '@/stores/site';
import { ToastType, useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { availableLanguages, t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseSelect from '@/components/base/BaseSelect.vue';
import BaseTextarea from '@/components/base/BaseTextarea.vue';
import BaseToggle from '@/components/base/BaseToggle.vue';

const ui = useUiStore();
const requireLogin = ref(false);
const allowWebRegister = ref(true);
const allowMcRegister = ref(true);
const siteName = ref('');
const siteUrl = ref('');
const footerContent = ref('');
const defaultLanguage = ref('zh-CN');
const loading = ref(false);
const saving = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    const config = await getSettings();
    requireLogin.value = config.requireLogin;
    siteName.value = config.siteName;
    siteUrl.value = config.siteUrl ?? '';
    allowWebRegister.value = config.allowWebRegister ?? true;
    allowMcRegister.value = config.allowMcRegister ?? true;
    footerContent.value = config.footerContent ?? '';
    defaultLanguage.value = config.defaultLanguage;
  } finally {
    loading.value = false;
  }
});

async function save() {
  saving.value = true;
  try {
    const result = await updateSettings({
      requireLogin: requireLogin.value,
      allowWebRegister: allowWebRegister.value,
      allowMcRegister: allowMcRegister.value,
      siteName: siteName.value,
      siteUrl: siteUrl.value || null,
      footerContent: footerContent.value || null,
      defaultLanguage: defaultLanguage.value,
    });
    setRequireLoginCache(result.requireLogin);
    siteConfig.siteName = result.siteName;
    siteConfig.siteUrl = result.siteUrl;
    siteConfig.footerContent = result.footerContent;
    siteConfig.allowWebRegister = result.allowWebRegister;
    siteConfig.allowMcRegister = result.allowMcRegister;
    siteConfig.defaultLanguage = result.defaultLanguage;
    ui.toast(t('admin.settings.saved'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.saveFailed'));
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
      {{ t('admin.settings.title') }}
    </h2>

    <div v-if="loading" class="py-4 text-center text-slate-400">{{ t('common.loading') }}</div>

    <div v-else class="space-y-4 max-w-lg">
      <!-- Site Name -->
      <BaseInput
        v-model="siteName"
        :label="t('admin.settings.siteName')"
        maxlength="100"
        :placeholder="siteTitle"
      />

      <!-- Site URL -->
      <BaseInput
        v-model="siteUrl"
        :label="t('admin.settings.siteUrl')"
        type="url"
        placeholder="https://ticket.example.com"
      />

      <BaseSelect
        v-model="defaultLanguage"
        :label="t('settings.language.default')"
        :options="
          availableLanguages.map((language) => ({
            value: language.id,
            label: language.displayName,
          }))
        "
      />

      <!-- Footer Content -->
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-slate-900 dark:text-white">{{
          t('admin.settings.footerContent')
        }}</label>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          {{ t('admin.settings.footerHelp') }}
        </p>
        <BaseTextarea
          v-model="footerContent"
          :rows="3"
          maxlength="2000"
          :placeholder="t('admin.settings.footerPlaceholder')"
        />
      </div>

      <!-- Allow Web Register Toggle -->
      <div
        class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            {{ t('admin.settings.allowWebRegister') }}
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {{ t('admin.settings.allowWebRegisterHelp') }}
          </p>
        </div>
        <BaseToggle v-model="allowWebRegister" />
      </div>

      <!-- Allow MC Register Toggle -->
      <div
        class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            {{ t('admin.settings.allowMcRegister') }}
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {{ t('admin.settings.allowMcRegisterHelp') }}
          </p>
        </div>
        <BaseToggle v-model="allowMcRegister" />
      </div>

      <!-- Require Login Toggle -->
      <div
        class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            {{ t('admin.settings.requireLogin') }}
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {{ t('admin.settings.requireLoginHelp') }}
          </p>
        </div>
        <BaseToggle v-model="requireLogin" />
      </div>

      <BaseButton filled :loading="saving" @click="save">{{
        saving ? t('common.saving') : t('common.save')
      }}</BaseButton>
    </div>
  </div>
</template>
