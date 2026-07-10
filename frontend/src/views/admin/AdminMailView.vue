<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { getSettings, testMailSettings, updateSettings } from '@/api/setup';
import { canSendPasswordResetMail, setPasswordResetEnabledCache, siteTitle } from '@/stores/site';
import { ToastType, useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseToggle from '@/components/base/BaseToggle.vue';

const ui = useUiStore();
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
    mailEnabled.value = config.mail.enabled;
    mailHost.value = config.mail.host;
    mailPort.value = config.mail.port;
    mailSecure.value = config.mail.secure;
    mailUsername.value = config.mail.username ?? '';
    mailPasswordSet.value = config.mail.passwordSet;
    mailFromName.value = config.mail.fromName;
    mailFromAddress.value = config.mail.fromAddress;
  } catch (e) {
    handleError(e, t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
});

async function save() {
  saving.value = true;
  try {
    const result = await updateSettings({
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
    mailPassword.value = '';
    mailPasswordSet.value = result.mail.passwordSet;
    setPasswordResetEnabledCache(canSendPasswordResetMail(result.mail));
    ui.toast(t('admin.mail.saved'), ToastType.SUCCESS);
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
      result.success ? ToastType.SUCCESS : ToastType.ERROR,
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
    <div class="space-y-1">
      <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
        {{ t('admin.mail.title') }}
      </h2>
      <p class="text-sm text-slate-500 dark:text-slate-400">
        {{ t('admin.mail.description') }}
      </p>
    </div>

    <div v-if="loading" class="py-4 text-center text-slate-400">{{ t('common.loading') }}</div>

    <div v-else class="space-y-4 max-w-lg">
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
            :placeholder="siteTitle"
          />
          <BaseInput
            v-model="mailFromAddress"
            :label="t('admin.settings.mailFromAddress')"
            type="email"
            placeholder="noreply@example.com"
          />
        </div>

        <div class="flex flex-wrap gap-3">
          <BaseButton filled :loading="saving" @click="save">
            {{ saving ? t('common.saving') : t('common.save') }}
          </BaseButton>
          <BaseButton type="button" :loading="testingMail" @click="testMail">
            {{ t('admin.settings.smtpTest') }}
          </BaseButton>
        </div>
      </template>

      <BaseButton v-else filled :loading="saving" @click="save">
        {{ saving ? t('common.saving') : t('common.save') }}
      </BaseButton>
    </div>
  </div>
</template>
