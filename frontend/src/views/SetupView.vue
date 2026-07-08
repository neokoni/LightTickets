<script setup lang="ts">
import { ref, computed, reactive } from 'vue';
import { useRouter } from 'vue-router';
import { useAuthStore } from '@/stores/auth';
import { useUiStore } from '@/stores/ui';
import { Icon } from '@iconify/vue';
import { completeSetup, waitForServerReady } from '@/api/setup';
import type { SetupPayload } from '@/types/site';
import { setSiteConfigCache } from '@/stores/site';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
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
    provider: 'sqlite',
  },
  admin: {
    email: '',
    password: '',
    username: '',
  },
  site: {
    siteName: 'LightTickets',
    siteUrl: '',
  },
  mc: {
    defaultServerName: '',
  },
  storage: {
    driver: 'local',
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

// MySQL 字段
const mysqlFields = reactive({
  host: '',
  port: '',
  username: '',
  password: '',
  database: '',
  args: '',
});

function buildDbPayload(): SetupPayload['db'] {
  if (payload.db.provider === 'sqlite') {
    return { provider: 'sqlite' };
  }

  return {
    provider: 'mysql',
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
      if (payload.db.provider === 'sqlite') return true;
      return !!(
        mysqlFields.host.trim() &&
        mysqlFields.username.trim() &&
        mysqlFields.database.trim() &&
        (!mysqlFields.port.trim() || Number(mysqlFields.port) > 0)
      );
    case 3:
      if (payload.storage?.driver === 'local') return true;
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
        payload.storage?.driver === 's3'
          ? {
              driver: 's3',
              s3: payload.storage.s3,
            }
          : {
              driver: 'local',
            },
    });
    auth.setTokens(res.accessToken, res.admin);
    step.value = 7;
    setSiteConfigCache({
      isSetup: true,
      requireLogin: false,
      allowWebRegister: true,
      allowMcRegister: true,
      siteName: res.setup.siteName,
      siteUrl: res.setup.siteUrl,
      footerContent: null,
    });
    // Server restarts after setup — wait for it to come back
    const ready = await waitForServerReady();
    if (ready) {
      router.replace({ name: 'tickets' });
    } else {
      error.value = '服务器重启超时，请手动刷新页面。';
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : '设置失败，请重试。';
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div
    class="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 relative"
  >
    <div class="absolute top-4 right-4">
      <BaseButton
        :class="themeButtonClass"
        :aria-label="ui.theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'"
        @click="ui.toggleTheme()"
      >
        <Icon :icon="ui.theme === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="w-5 h-5" />
      </BaseButton>
    </div>
    <div
      class="w-full max-w-xl bg-white/95 dark:bg-slate-900/95 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm backdrop-blur p-8"
    >
      <div class="mb-8">
        <h1 class="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">
          LightTickets初始化向导
        </h1>
        <template v-if="step <= totalSteps">
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">
            步骤 {{ step }} / {{ totalSteps }}
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
          <img src="/icons/lighttickets.svg" alt="LightTickets" class="w-16 h-16 mx-auto mb-4" />
          <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
            欢迎使用 LightTickets
          </h2>
          <p
            class="text-slate-500 dark:text-slate-400 mt-2 text-sm leading-relaxed max-w-xs mx-auto"
          >
            本向导将帮助你完成站点初始化：数据库配置、管理员账户创建和基本站点设置。
          </p>
        </div>
      </div>

      <!-- Step 2: Database -->
      <div v-else-if="step === 2" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          数据库配置
        </h2>
        <div class="flex gap-3">
          <BaseButton
            :class="providerButtonClass"
            :data-active="payload.db.provider === 'sqlite'"
            @click="payload.db.provider = 'sqlite'"
          >
            SQLite
          </BaseButton>
          <BaseButton
            :class="providerButtonClass"
            :data-active="payload.db.provider === 'mysql'"
            @click="payload.db.provider = 'mysql'"
          >
            MySQL
          </BaseButton>
        </div>

        <p
          v-if="payload.db.provider === 'sqlite'"
          class="text-sm text-slate-500 dark:text-slate-400"
        >
          数据库文件将保存在
          <code class="text-xs bg-slate-100 dark:bg-slate-800 px-1 py-0.5 rounded"
            >data/data.db</code
          >
        </p>

        <div v-else class="grid grid-cols-2 gap-3">
          <BaseInput v-model="mysqlFields.host" label="主机" placeholder="localhost" />
          <BaseInput v-model="mysqlFields.port" label="端口（可选）" placeholder="3306" />
          <BaseInput v-model="mysqlFields.username" label="用户名" placeholder="root" />
          <BaseInput
            v-model="mysqlFields.password"
            label="密码"
            type="password"
            placeholder="password"
          />
          <BaseInput
            v-model="mysqlFields.database"
            label="数据库"
            placeholder="lighttickets"
            class="col-span-2"
          />
          <BaseInput
            v-model="mysqlFields.args"
            label="连接参数（可选）"
            placeholder="sslaccept=strict&connect_timeout=10"
            class="col-span-2"
          />
        </div>
      </div>

      <!-- Step 3: Storage -->
      <div v-else-if="step === 3" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          存储设置
        </h2>
        <label class="text-sm font-medium text-slate-900 dark:text-white">存储方式</label>
        <div class="flex gap-3">
          <BaseButton
            :class="storageButtonClass"
            :data-active="payload.storage?.driver === 'local'"
            @click="payload.storage!.driver = 'local'"
          >
            <Icon icon="lucide:hard-drive" class="w-4 h-4" />
            本地磁盘
          </BaseButton>
          <BaseButton
            :class="storageButtonClass"
            :data-active="payload.storage?.driver === 's3'"
            @click="payload.storage!.driver = 's3'"
          >
            <Icon icon="lucide:cloud" class="w-4 h-4" />
            S3 兼容存储
          </BaseButton>
        </div>

        <div
          v-if="payload.storage?.driver === 's3'"
          class="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-700"
        >
          <p class="text-sm font-medium text-slate-900 dark:text-white pt-2">S3 兼容存储配置</p>
          <BaseInput
            v-model="payload.storage!.s3!.endpoint"
            label="服务端点 *"
            placeholder="http://localhost:9000"
          />
          <BaseInput
            v-model="payload.storage!.s3!.bucket"
            label="存储桶 *"
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
            label="预签名链接过期时间（秒）"
            type="number"
            min="60"
            placeholder="300"
          />
          <div
            class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
          >
            <div>
              <p class="text-sm font-medium text-slate-900 dark:text-white">
                路径样式(Path Style)寻址
              </p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
                自建 S3 兼容存储(如 MinIO)需开启; AWS S3 官方可关闭
              </p>
            </div>
            <BaseToggle v-model="payload.storage!.s3!.forcePathStyle" />
          </div>
        </div>
      </div>

      <!-- Step 4: Admin Account -->
      <div v-else-if="step === 4" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          管理员账户
        </h2>
        <BaseInput v-model="payload.admin.username" label="用户名" placeholder="admin" />
        <BaseInput
          v-model="payload.admin.email"
          label="邮箱"
          placeholder="admin@example.com"
          type="email"
        />
        <BaseInput
          v-model="payload.admin.password"
          label="密码"
          placeholder="至少 6 位字符"
          type="password"
        />
      </div>

      <!-- Step 5: Site Settings -->
      <div v-else-if="step === 5" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          站点设置
        </h2>
        <BaseInput v-model="payload.site!.siteName" label="站点名称" placeholder="LightTickets" />
        <BaseInput
          v-model="payload.site!.siteUrl"
          label="站点地址（可选）"
          placeholder="https://ticket.example.com"
        />
      </div>

      <!-- Step 6: Optional Default Server -->
      <div v-else-if="step === 6" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          Minecraft 服务器（可选）
        </h2>
        <BaseInput
          v-model="payload.mc!.defaultServerName"
          label="默认服务器名称"
          placeholder="MyServer"
        />
        <p class="text-xs text-slate-400">留空可跳过。之后可在「管理 › 服务器」中添加服务器。</p>
      </div>

      <!-- Complete -->
      <div v-else-if="step === 7" class="text-center py-10 space-y-4">
        <div
          class="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mx-auto flex items-center justify-center text-2xl"
        >
          ✓
        </div>
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
          设置完成！
        </h2>
        <p class="text-slate-500 dark:text-slate-400 text-sm">服务器正在重启，请稍候...</p>
        <div v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</div>
      </div>

      <div
        v-if="error"
        class="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg"
      >
        {{ error }}
      </div>

      <div class="mt-8 flex justify-between">
        <BaseButton v-if="step > 1 && step <= totalSteps" @click="back"> 上一步 </BaseButton>
        <div v-else />
        <BaseButton v-if="step < totalSteps" :disabled="!canNext" @click="next">
          下一步
        </BaseButton>
        <BaseButton v-else-if="step === totalSteps" :loading="loading" @click="submit">
          完成设置
        </BaseButton>
        <BaseButton v-else-if="step === 1" @click="next"> 开始使用 </BaseButton>
      </div>
    </div>
  </div>
</template>
