<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { Theme, useUiStore } from '@/stores/ui';
import { Icon } from '@iconify/vue';
import { completeSetup, waitForServerReady } from '@/api/setup';
import { DatabaseProvider, type SetupPayload } from '@/types/site';
import { StorageDriver } from '@/types/storage';
import { DEFAULT_SITE_TITLE, setSiteConfigCache } from '@/stores/site';
import { activeLanguage, availableLanguages, setLanguage, t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseSelect from '@/components/base/BaseSelect.vue';
import BaseToggle from '@/components/base/BaseToggle.vue';

const router = useRouter();
const auth = useAuthStore();
const ui = useUiStore();
const step = ref(1);
const loading = ref(false);
const error = ref('');
const themeButtonClass =
  '!h-10 !w-10 !px-0 !py-0 rounded-full border border-slate-200 bg-transparent text-slate-700 hover:text-slate-900 dark:border-slate-800 dark:text-slate-200 dark:hover:text-slate-100';
const providerButtonClass =
  '!flex-1 !py-3 rounded-xl border text-sm font-medium data-[active=true]:bg-slate-900 data-[active=true]:text-white data-[active=true]:border-slate-900 data-[active=true]:dark:bg-slate-200 data-[active=true]:dark:text-slate-900 data-[active=true]:dark:border-slate-200 data-[active=false]:bg-white/95 data-[active=false]:dark:bg-slate-900/95 data-[active=false]:text-slate-700 data-[active=false]:dark:text-slate-300 data-[active=false]:border-slate-200/80 data-[active=false]:dark:border-slate-800/80 data-[active=false]:backdrop-blur';
const storageButtonClass =
  '!flex-1 !justify-start !px-4 !py-3 border text-sm transition data-[active=true]:border-slate-900 data-[active=true]:dark:border-slate-200 data-[active=true]:bg-slate-50 data-[active=true]:dark:bg-slate-800 data-[active=true]:text-slate-900 data-[active=true]:dark:text-white data-[active=true]:font-medium data-[active=false]:border-slate-200 data-[active=false]:dark:border-slate-700 data-[active=false]:text-slate-600 data-[active=false]:dark:text-slate-400 data-[active=false]:hover:border-slate-400';

const payload = reactive<SetupPayload>({
  db: {
    provider: DatabaseProvider.SQLITE,
  },
  admin: {
    email: '',
    password: '',
    username: '',
  },
  site: {
    siteName: DEFAULT_SITE_TITLE,
    siteUrl: '',
    defaultLanguage: 'zh-CN',
  },
  mc: {
    defaultServerName: '',
  },
  storage: {
    driver: StorageDriver.LOCAL,
    s3: {
      endpoint: '',
      bucket: '',
      accessKeyId: '',
      secretAccessKey: '',
      forcePathStyle: true,
      presignExpiry: 300,
    },
  },
});

const setupSiteTitle = computed(() => payload.site?.siteName?.trim() || DEFAULT_SITE_TITLE);

// MySQL fields
const mysqlFields = reactive({
  host: '',
  port: '',
  username: '',
  password: '',
  database: '',
  args: '',
});

function buildDbPayload(): SetupPayload['db'] {
  if (payload.db.provider === DatabaseProvider.SQLITE) {
    return { provider: DatabaseProvider.SQLITE };
  }

  return {
    provider: DatabaseProvider.MYSQL,
    host: mysqlFields.host.trim(),
    port: mysqlFields.port.trim() ? Number(mysqlFields.port) : undefined,
    username: mysqlFields.username.trim(),
    password: mysqlFields.password,
    database: mysqlFields.database.trim(),
    args: mysqlFields.args.trim() || undefined,
  };
}

const totalSteps = 6;

const canNext = computed(() => {
  switch (step.value) {
    case 2:
      if (payload.db.provider === DatabaseProvider.SQLITE) return true;
      return !!(
        mysqlFields.host.trim() &&
        mysqlFields.username.trim() &&
        mysqlFields.database.trim() &&
        (!mysqlFields.port.trim() || Number(mysqlFields.port) > 0)
      );
    case 3:
      if (payload.storage?.driver === StorageDriver.LOCAL) return true;
      return !!(
        payload.storage?.s3?.endpoint?.trim() &&
        payload.storage.s3.bucket?.trim() &&
        payload.storage.s3.accessKeyId?.trim() &&
        payload.storage.s3.secretAccessKey?.trim()
      );
    case 4:
      return (
        payload.admin.email &&
        payload.admin.password.length >= 6 &&
        payload.admin.username.length >= 2
      );
    case 5:
      return !!payload.site!.siteName;
    default:
      return true;
  }
});

function next() {
  if (step.value < totalSteps) step.value++;
}

function back() {
  if (step.value > 1) step.value--;
}

async function submit() {
  loading.value = true;
  error.value = '';
  try {
    const res = await completeSetup({
      db: buildDbPayload(),
      admin: payload.admin,
      site: payload.site,
      mc: payload.mc?.defaultServerName
        ? { defaultServerName: payload.mc.defaultServerName }
        : undefined,
      storage:
        payload.storage?.driver === StorageDriver.S3
          ? {
              driver: StorageDriver.S3,
              s3: payload.storage.s3,
            }
          : {
              driver: StorageDriver.LOCAL,
            },
    });
    auth.setTokens(res.accessToken, res.admin);
    step.value = 7;
    setSiteConfigCache({
      isSetup: true,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      passwordResetEnabled: false,
      siteName: res.setup.siteName,
      siteUrl: res.setup.siteUrl,
      footerContent: null,
      defaultLanguage: res.setup.defaultLanguage,
      turnstile: { enabled: false, siteKey: '' },
    });
    // Server restarts after setup — wait for it to come back
    const ready = await waitForServerReady();
    if (ready) {
      router.replace({ name: 'tickets' });
    } else {
      error.value = t('setup.error.restartTimeout');
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : t('setup.error.failed');
  } finally {
    loading.value = false;
  }
}

async function changeSetupLanguage(languageId: string) {
  payload.site!.defaultLanguage = languageId;
  await setLanguage(languageId);
}
</script>

<template>
  <div
    class="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 relative"
  >
    <div class="absolute top-4 right-4">
      <BaseButton
        :class="themeButtonClass"
        :aria-label="ui.theme === Theme.DARK ? t('theme.light') : t('theme.dark')"
        @click="ui.toggleTheme()"
      >
        <Icon :icon="ui.theme === Theme.DARK ? 'lucide:sun' : 'lucide:moon'" class="w-5 h-5" />
      </BaseButton>
    </div>
    <div
      class="w-full max-w-xl bg-white/95 dark:bg-slate-900/95 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm backdrop-blur p-8"
    >
      <div class="mb-8">
        <h1 class="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          {{ t('setup.title') }}
        </h1>
        <template v-if="step <= totalSteps">
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
            {{ t('setup.step', { step, total: totalSteps }) }}
          </p>
          <div class="mt-4 h-1 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
            <div
              class="h-full bg-slate-900 dark:bg-slate-200 transition-all duration-300"
              :style="{ width: (step / totalSteps) * 100 + '%' }"
            />
          </div>
        </template>
      </div>

      <!-- Step 1: Welcome -->
      <div v-if="step === 1">
        <div class="text-center py-6">
          <img src="/icons/lighttickets.svg" :alt="setupSiteTitle" class="w-16 h-16 mx-auto mb-4" />
          <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
            {{ t('setup.welcome') }}
          </h2>
          <p
            class="text-slate-500 dark:text-slate-400 mt-2 text-sm leading-relaxed max-w-xs mx-auto"
          >
            {{ t('setup.welcomeDescription') }}
          </p>
        </div>
      </div>

      <!-- Step 2: Database -->
      <div v-else-if="step === 2" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {{ t('setup.database.title') }}
        </h2>
        <div class="flex gap-3">
          <BaseButton
            :class="providerButtonClass"
            :data-active="payload.db.provider === DatabaseProvider.SQLITE"
            @click="payload.db.provider = DatabaseProvider.SQLITE"
          >
            SQLite
          </BaseButton>
          <BaseButton
            :class="providerButtonClass"
            :data-active="payload.db.provider === DatabaseProvider.MYSQL"
            @click="payload.db.provider = DatabaseProvider.MYSQL"
          >
            MySQL
          </BaseButton>
        </div>

        <p
          v-if="payload.db.provider === DatabaseProvider.SQLITE"
          class="text-sm text-slate-500 dark:text-slate-400"
        >
          {{ t('setup.database.sqlitePathPrefix') }}
          <code class="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded"
            >data/data.db</code
          >
        </p>

        <div v-else class="grid grid-cols-2 gap-3">
          <BaseInput
            v-model="mysqlFields.host"
            :label="t('setup.database.host')"
            placeholder="localhost"
          />
          <BaseInput
            v-model="mysqlFields.port"
            :label="t('setup.database.port')"
            placeholder="3306"
          />
          <BaseInput
            v-model="mysqlFields.username"
            :label="t('setup.database.username')"
            placeholder="root"
          />
          <BaseInput
            v-model="mysqlFields.password"
            :label="t('setup.database.password')"
            type="password"
            placeholder="password"
          />
          <BaseInput
            v-model="mysqlFields.database"
            :label="t('setup.database.database')"
            placeholder="lighttickets"
            class="col-span-2"
          />
          <BaseInput
            v-model="mysqlFields.args"
            :label="t('setup.database.args')"
            placeholder="sslaccept=strict&connect_timeout=10"
            class="col-span-2"
          />
        </div>
      </div>

      <!-- Step 3: Storage -->
      <div v-else-if="step === 3" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {{ t('setup.storage.title') }}
        </h2>
        <label class="text-sm font-medium text-slate-900 dark:text-white">{{
          t('setup.storage.driver')
        }}</label>
        <div class="flex gap-3">
          <BaseButton
            :class="storageButtonClass"
            :data-active="payload.storage?.driver === StorageDriver.LOCAL"
            @click="payload.storage!.driver = StorageDriver.LOCAL"
          >
            <Icon icon="lucide:hard-drive" class="w-4 h-4" />
            {{ t('setup.storage.local') }}
          </BaseButton>
          <BaseButton
            :class="storageButtonClass"
            :data-active="payload.storage?.driver === StorageDriver.S3"
            @click="payload.storage!.driver = StorageDriver.S3"
          >
            <Icon icon="lucide:cloud" class="w-4 h-4" />
            {{ t('setup.storage.s3') }}
          </BaseButton>
        </div>

        <div
          v-if="payload.storage?.driver === StorageDriver.S3"
          class="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-700"
        >
          <p class="text-sm font-medium text-slate-900 dark:text-white pt-2">
            {{ t('setup.storage.s3Config') }}
          </p>
          <BaseInput
            v-model="payload.storage!.s3!.endpoint"
            :label="t('setup.storage.endpoint')"
            placeholder="http://localhost:9000"
          />
          <BaseInput
            v-model="payload.storage!.s3!.bucket"
            :label="t('setup.storage.bucket')"
            placeholder="lighttickets"
          />
          <div class="grid grid-cols-2 gap-3">
            <BaseInput
              v-model="payload.storage!.s3!.accessKeyId"
              label="Access Key ID *"
              placeholder="minioadmin"
            />
            <BaseInput
              v-model="payload.storage!.s3!.secretAccessKey"
              label="Secret Access Key *"
              type="password"
              placeholder="minioadmin"
            />
          </div>
          <BaseInput
            v-model.number="payload.storage!.s3!.presignExpiry"
            :label="t('setup.storage.presignExpiry')"
            type="number"
            min="60"
            placeholder="300"
          />
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
            <BaseToggle v-model="payload.storage!.s3!.forcePathStyle" />
          </div>
        </div>
      </div>

      <!-- Step 4: Admin Account -->
      <div v-else-if="step === 4" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {{ t('setup.admin.title') }}
        </h2>
        <BaseInput
          v-model="payload.admin.username"
          :label="t('setup.admin.username')"
          placeholder="admin"
        />
        <BaseInput
          v-model="payload.admin.email"
          :label="t('setup.admin.email')"
          placeholder="admin@example.com"
          type="email"
        />
        <BaseInput
          v-model="payload.admin.password"
          :label="t('setup.admin.password')"
          :placeholder="t('setup.admin.passwordPlaceholder')"
          type="password"
        />
      </div>

      <!-- Step 5: Site Settings -->
      <div v-else-if="step === 5" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {{ t('setup.site.title') }}
        </h2>
        <BaseInput
          v-model="payload.site!.siteName"
          :label="t('setup.site.name')"
          :placeholder="setupSiteTitle"
        />
        <BaseInput
          v-model="payload.site!.siteUrl"
          :label="t('setup.site.url')"
          placeholder="https://ticket.example.com"
        />
        <BaseSelect
          :model-value="activeLanguage"
          :label="t('settings.language.default')"
          :options="
            availableLanguages.map((language) => ({
              value: language.id,
              label: language.displayName,
            }))
          "
          @update:model-value="changeSetupLanguage($event || 'zh-CN')"
        />
      </div>

      <!-- Step 6: Optional Default Server -->
      <div v-else-if="step === 6" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {{ t('setup.mc.title') }}
        </h2>
        <BaseInput
          v-model="payload.mc!.defaultServerName"
          :label="t('setup.mc.defaultServerName')"
          placeholder="MyServer"
        />
        <p class="text-xs text-slate-400">{{ t('setup.mc.help') }}</p>
      </div>

      <!-- Complete -->
      <div v-else-if="step === 7" class="text-center py-10 space-y-4">
        <div
          class="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mx-auto flex items-center justify-center text-2xl"
        >
          ✓
        </div>
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          {{ t('setup.complete.title') }}
        </h2>
        <p class="text-slate-500 dark:text-slate-400 text-sm">
          {{ t('setup.complete.restarting') }}
        </p>
        <div v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</div>
      </div>

      <div
        v-if="error"
        class="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg"
      >
        {{ error }}
      </div>

      <div class="mt-8 flex justify-between">
        <BaseButton v-if="step > 1 && step <= totalSteps" @click="back">
          {{ t('common.previous') }}
        </BaseButton>
        <div v-else />
        <BaseButton v-if="step < totalSteps" :disabled="!canNext" @click="next">
          {{ t('common.next') }}
        </BaseButton>
        <BaseButton v-else-if="step === totalSteps" :loading="loading" @click="submit">
          {{ t('setup.complete.submit') }}
        </BaseButton>
        <BaseButton v-else-if="step === 1" @click="next">{{ t('setup.start') }}</BaseButton>
      </div>
    </div>
  </div>
</template>
