<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getSettings, testMailSettings, updateSettings } from '@/api/setup';
import { setRequireLoginCache, siteConfig } from '@/stores/site';
import { useUiStore } from '@/stores/ui';
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
const mailEnabled = ref(false);
const mailHost = ref('');
const mailPort = ref(587);
const mailSecure = ref(false);
const mailUsername = ref('');
const mailPassword = ref('');
const mailPasswordSet = ref(false);
const mailFromName = ref('');
const mailFromAddress = ref('');
const loading = ref(false);
const saving = ref(false);
const testingMail = ref(false);

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
    mailEnabled.value = config.mail.enabled;
    mailHost.value = config.mail.host;
    mailPort.value = config.mail.port;
    mailSecure.value = config.mail.secure;
    mailUsername.value = config.mail.username ?? '';
    mailPasswordSet.value = config.mail.passwordSet;
    mailFromName.value = config.mail.fromName;
    mailFromAddress.value = config.mail.fromAddress;
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
      mail: {
        enabled: mailEnabled.value,
        host: mailHost.value,
        port: mailPort.value,
        secure: mailSecure.value,
        username: mailUsername.value || null,
        password: mailPassword.value || null,
        fromName: mailFromName.value,
        fromAddress: mailFromAddress.value,
      },
    });
    setRequireLoginCache(result.requireLogin);
    siteConfig.siteName = result.siteName;
    siteConfig.siteUrl = result.siteUrl;
    siteConfig.footerContent = result.footerContent;
    siteConfig.allowWebRegister = result.allowWebRegister;
    siteConfig.allowMcRegister = result.allowMcRegister;
    siteConfig.defaultLanguage = result.defaultLanguage;
    mailPassword.value = '';
    mailPasswordSet.value = result.mail.passwordSet;
    ui.toast(t('admin.settings.saved'), 'success');
  } catch (e) {
    handleError(e, t('common.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function testMail() {
  testingMail.value = true;
  try {
    const result = await testMailSettings();
    ui.toast(
      result.success ? t('admin.settings.smtpTestSuccess') : result.message,
      result.success ? 'success' : 'error',
    );
  } catch (e) {
    handleError(e, t('admin.settings.smtpTestFailed'));
  } finally {
    testingMail.value = false;
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
        placeholder="LightTickets"
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

      <div class="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-800">
        <div
          class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
        >
          <div>
            <p class="text-sm font-medium text-slate-900 dark:text-white">
              {{ t('admin.settings.mailEnabled') }}
            </p>
            <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
              {{ t('admin.settings.mailEnabledHelp') }}
            </p>
          </div>
          <BaseToggle v-model="mailEnabled" />
        </div>

        <template v-if="mailEnabled">
          <div class="grid grid-cols-1 gap-3 sm:grid-cols-[1fr_120px]">
            <BaseInput
              v-model="mailHost"
              :label="t('admin.settings.smtpHost')"
              placeholder="smtp.example.com"
            />
            <BaseInput
              v-model.number="mailPort"
              :label="t('admin.settings.smtpPort')"
              type="number"
              min="1"
              placeholder="587"
            />
          </div>

          <div
            class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
          >
            <div>
              <p class="text-sm font-medium text-slate-900 dark:text-white">
                {{ t('admin.settings.smtpSecure') }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {{ t('admin.settings.smtpSecureHelp') }}
              </p>
            </div>
            <BaseToggle v-model="mailSecure" />
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BaseInput
              v-model="mailUsername"
              :label="t('admin.settings.smtpUsername')"
              placeholder="mailer"
            />
            <BaseInput
              v-model="mailPassword"
              :label="t('admin.settings.smtpPassword')"
              type="password"
              :placeholder="
                mailPasswordSet
                  ? t('admin.settings.smtpPasswordKeep')
                  : t('admin.settings.smtpPassword')
              "
            />
          </div>

          <div class="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <BaseInput
              v-model="mailFromName"
              :label="t('admin.settings.mailFromName')"
              placeholder="LightTickets"
            />
            <BaseInput
              v-model="mailFromAddress"
              :label="t('admin.settings.mailFromAddress')"
              type="email"
              placeholder="noreply@example.com"
            />
          </div>

          <BaseButton type="button" :loading="testingMail" @click="testMail">
            {{ t('admin.settings.smtpTest') }}
          </BaseButton>
        </template>
      </div>

      <BaseButton filled :loading="saving" @click="save">{{
        saving ? t('common.saving') : t('common.save')
      }}</BaseButton>
    </div>
  </div>
</template>
