<script setup lang="ts">
import { ref, onMounted } from 'vue';
import { Icon } from '@iconify/vue';
import { useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseToggle from '@/components/base/BaseToggle.vue';
import { apiGetStorageConfig, apiUpdateStorageConfig, apiTestS3Connection } from '@/api/storage';
import type { StorageConfig } from '@/types/storage';

const ui = useUiStore();

const loading = ref(false);
const saving = ref(false);
const testing = ref(false);
const testResult = ref<{ success: boolean; message: string } | null>(null);

const driver = ref<'local' | 's3'>('local');
const s3 = ref({
  endpoint: '',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
  forcePathStyle: true,
  presignExpiry: 300,
});

const secretMasked = ref(false);
const storageButtonClass =
  '!justify-start !px-4 !py-3 border text-sm transition ' +
  'data-[active=true]:border-slate-900 data-[active=true]:dark:border-slate-200 ' +
  'data-[active=true]:bg-slate-50 data-[active=true]:dark:bg-slate-800 ' +
  'data-[active=true]:text-slate-900 data-[active=true]:dark:text-white ' +
  'data-[active=true]:font-medium data-[active=false]:border-slate-200 ' +
  'data-[active=false]:dark:border-slate-700 data-[active=false]:text-slate-600 ' +
  'data-[active=false]:dark:text-slate-400 data-[active=false]:hover:border-slate-400';

onMounted(async () => {
  loading.value = true;
  try {
    const config = await apiGetStorageConfig();
    applyConfig(config);
  } catch (e) {
    handleError(e, t('common.loadFailed'));
  } finally {
    loading.value = false;
  }
});

function applyConfig(config: StorageConfig) {
  driver.value = config.driver;
  if (config.s3) {
    s3.value = { ...s3.value, ...config.s3 };
    if (config.s3.secretAccessKey === '••••••••') {
      secretMasked.value = true;
      s3.value.secretAccessKey = '';
    } else {
      secretMasked.value = false;
    }
  }
}

function validateS3(): string | null {
  if (!s3.value.endpoint.trim()) return t('admin.storage.endpointRequired');
  if (!s3.value.bucket.trim()) return t('admin.storage.bucketRequired');
  if (!s3.value.accessKeyId.trim()) return t('admin.storage.accessKeyRequired');
  if (!s3.value.secretAccessKey.trim() && !secretMasked.value) {
    return t('admin.storage.secretKeyRequired');
  }
  return null;
}

async function save() {
  if (driver.value === 's3') {
    const err = validateS3();
    if (err) {
      ui.toast(err, 'error');
      return;
    }
  }
  saving.value = true;
  try {
    const payload: Parameters<typeof apiUpdateStorageConfig>[0] = {
      driver: driver.value,
    };
    if (driver.value === 's3') {
      payload.s3 = { ...s3.value };
      if (!s3.value.secretAccessKey && secretMasked.value) {
        delete payload.s3.secretAccessKey;
      }
    }
    const result = await apiUpdateStorageConfig(payload);
    applyConfig(result);
    ui.toast(t('admin.storage.saved'), 'success');
  } catch (e) {
    handleError(e, t('common.saveFailed'));
  } finally {
    saving.value = false;
  }
}

async function testConnection() {
  testing.value = true;
  testResult.value = null;
  try {
    const result = await apiTestS3Connection();
    testResult.value = result;
    if (result.success) {
      ui.toast(t('admin.storage.connectionSuccess'), 'success');
    } else {
      ui.toast(result.message || t('admin.storage.connectionFailed'), 'error');
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : t('admin.storage.connectionFailed');
    testResult.value = { success: false, message: msg };
    handleError(e, t('admin.storage.connectionFailed'));
  } finally {
    testing.value = false;
  }
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
      {{ t('admin.storage.title') }}
    </h2>

    <div v-if="loading" class="py-4 text-center text-slate-400">{{ t('common.loading') }}</div>

    <div v-else class="space-y-4 max-w-lg">
      <!-- Driver selection -->
      <div class="space-y-2">
        <label class="text-sm font-medium text-slate-900 dark:text-white">{{
          t('setup.storage.driver')
        }}</label>
        <div class="grid grid-cols-2 gap-3">
          <BaseButton
            :class="storageButtonClass"
            :data-active="driver === 'local'"
            @click="driver = 'local'"
          >
            <Icon icon="lucide:hard-drive" class="w-4 h-4" />
            {{ t('setup.storage.local') }}
          </BaseButton>
          <BaseButton
            :class="storageButtonClass"
            :data-active="driver === 's3'"
            @click="driver = 's3'"
          >
            <Icon icon="lucide:cloud" class="w-4 h-4" />
            {{ t('setup.storage.s3') }}
          </BaseButton>
        </div>
      </div>

      <!-- S3 config -->
      <template v-if="driver === 's3'">
        <div class="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-700">
          <p class="text-sm font-medium text-slate-900 dark:text-white pt-2">
            {{ t('setup.storage.s3Config') }}
          </p>

          <BaseInput
            v-model="s3.endpoint"
            :label="t('setup.storage.endpoint')"
            placeholder="http://localhost:9000"
          />

          <BaseInput
            v-model="s3.bucket"
            :label="t('setup.storage.bucket')"
            placeholder="lighttickets"
          />

          <div class="grid grid-cols-2 gap-3">
            <BaseInput v-model="s3.accessKeyId" label="Access Key ID *" placeholder="minioadmin" />
            <BaseInput
              v-model="s3.secretAccessKey"
              label="Secret Access Key *"
              type="password"
              :placeholder="secretMasked ? t('admin.storage.secretKeepPlaceholder') : 'minioadmin'"
            />
          </div>

          <BaseInput
            v-model.number="s3.presignExpiry"
            :label="t('setup.storage.presignExpiry')"
            type="number"
            min="60"
            placeholder="300"
          />

          <!-- Path Style toggle -->
          <div
            class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
          >
            <div>
              <p class="text-sm font-medium text-slate-900 dark:text-white">
                {{ t('setup.storage.pathStyle') }}
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                {{ t('setup.storage.pathStyleHelp') }}
              </p>
            </div>
            <BaseToggle v-model="s3.forcePathStyle" />
          </div>

          <!-- Test connection -->
          <div class="flex items-center gap-3">
            <BaseButton variant="primary" :loading="testing" @click="testConnection">
              <template #default>
                <Icon icon="lucide:plug" class="w-4 h-4" />
                {{ t('admin.storage.testConnection') }}
              </template>
            </BaseButton>
            <span
              v-if="testResult"
              class="text-sm"
              :class="
                testResult.success
                  ? 'text-green-600 dark:text-green-400'
                  : 'text-red-600 dark:text-red-400'
              "
            >
              <Icon
                :icon="testResult.success ? 'lucide:check-circle' : 'lucide:x-circle'"
                class="w-4 h-4 inline mr-1"
              />
              {{ testResult.message }}
            </span>
          </div>
        </div>
      </template>

      <BaseButton filled :loading="saving" @click="save">{{
        saving ? t('common.saving') : t('common.save')
      }}</BaseButton>
    </div>
  </div>
</template>
