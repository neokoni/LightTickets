<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import type { User } from '@/types/user'
import { Icon } from '@iconify/vue'
import { completeSetup, waitForServerReady, type SetupPayload } from '@/api/setup'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'

const router = useRouter()
const auth = useAuthStore()
const ui = useUiStore()
const step = ref(1)
const loading = ref(false)
const error = ref('')

const payload = reactive<SetupPayload>({
  db: {
    provider: 'sqlite',
    databaseUrl: 'file:../data/data.db',
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
})

// MySQL 字段模式 vs URL 模式
const mysqlMode = ref<'fields' | 'url'>('fields')
const mysqlFields = reactive({
  host: 'localhost',
  port: '3306',
  user: 'root',
  password: '',
  database: 'lightticket',
  params: '',
})

function buildMysqlUrl() {
  const { host, port, user, password, database, params } = mysqlFields
  let url = `mysql://${encodeURIComponent(user)}:${encodeURIComponent(password)}@${host}:${port}/${database}`
  if (params.trim()) {
    url += '?' + params.trim()
  }
  return url
}

const totalSteps = 5

const canNext = computed(() => {
  switch (step.value) {
    case 2:
      if (payload.db.provider === 'sqlite') return !!payload.db.databaseUrl
      if (mysqlMode.value === 'url') return !!payload.db.databaseUrl
      return !!(mysqlFields.host && mysqlFields.port && mysqlFields.user && mysqlFields.database)
    case 3:
      return payload.admin.email && payload.admin.password.length >= 6 && payload.admin.username.length >= 2
    case 4:
      return !!payload.site!.siteName
    default:
      return true
  }
})

function next() {
  // 自动拼接待 MySQL 字段模式下的 URL
  if (step.value === 2 && payload.db.provider === 'mysql' && mysqlMode.value === 'fields') {
    payload.db.databaseUrl = buildMysqlUrl()
  }
  if (step.value < totalSteps) step.value++
}

function back() {
  if (step.value > 1) step.value--
}

async function submit() {
  // 提交前自动拼接 MySQL 字段
  if (payload.db.provider === 'mysql' && mysqlMode.value === 'fields') {
    payload.db.databaseUrl = buildMysqlUrl()
  }
  loading.value = true
  error.value = ''
  try {
    const res = await completeSetup({
      db: payload.db,
      admin: payload.admin,
      site: payload.site,
      mc: payload.mc?.defaultServerName ? { defaultServerName: payload.mc.defaultServerName } : undefined,
    })
    auth.setTokens(res.accessToken, res.refreshToken, res.admin as User)
    step.value = 6
    import('@/router').then((mod) => {
      mod.setSiteConfigCache({ isSetup: true, requireLogin: false })
    })
    // Server restarts after setup — wait for it to come back
    const ready = await waitForServerReady()
    if (ready) {
      router.replace({ name: 'tickets' })
    } else {
      error.value = '服务器重启超时，请手动刷新页面。'
    }
  } catch (e: any) {
    error.value = e?.message || '设置失败，请重试。'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4 relative">
    <div class="absolute top-4 right-4">
      <button
        @click="ui.toggleTheme()"
        class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-transparent text-slate-700 transition hover:text-slate-900 dark:border-slate-800 dark:text-slate-200 dark:hover:text-slate-100"
        :aria-label="ui.theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'"
      >
        <Icon :icon="ui.theme === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="w-5 h-5" />
      </button>
    </div>
    <div class="w-full max-w-xl bg-white/95 dark:bg-slate-900/95 rounded-xl border border-slate-200/80 dark:border-slate-800/80 shadow-sm backdrop-blur p-8">
      <div class="mb-8">
        <h1 class="text-2xl font-bold tracking-tight text-slate-950 dark:text-white">LightTickets初始化向导</h1>
        <template v-if="step <= totalSteps">
          <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">步骤 {{ step }} / {{ totalSteps }}</p>
          <div class="mt-4 h-1 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
            <div
              class="h-full bg-slate-900 dark:bg-slate-200 transition-all duration-300"
              :style="{ width: ((step / totalSteps) * 100) + '%' }"
            />
          </div>
        </template>
      </div>

      <!-- Step 1: Welcome -->
      <div v-if="step === 1">
        <div class="text-center py-6">
          <div class="w-16 h-16 rounded-2xl bg-slate-900 dark:bg-slate-200 mx-auto mb-4 flex items-center justify-center text-white dark:text-slate-900 text-2xl font-bold">
            LT
          </div>
          <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">欢迎使用 LightTickets</h2>
          <p class="text-slate-500 dark:text-slate-400 mt-2 text-sm leading-relaxed max-w-xs mx-auto">
            本向导将帮助你完成站点初始化：数据库配置、管理员账户创建和基本站点设置。
          </p>
        </div>
      </div>

      <!-- Step 2: Database -->
      <div v-else-if="step === 2" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">数据库配置</h2>
        <div class="flex gap-3">
          <button
            class="flex-1 py-3 rounded-xl border text-sm font-medium transition"
            :class="payload.db.provider === 'sqlite'
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200'
              : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-800/80 backdrop-blur'"
            @click="payload.db.provider = 'sqlite'"
          >
            SQLite
          </button>
          <button
            class="flex-1 py-3 rounded-xl border text-sm font-medium transition"
            :class="payload.db.provider === 'mysql'
              ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200'
              : 'bg-white/95 dark:bg-slate-900/95 text-slate-700 dark:text-slate-300 border-slate-200/80 dark:border-slate-800/80 backdrop-blur'"
            @click="payload.db.provider = 'mysql'"
          >
            MySQL
          </button>
        </div>

        <div v-if="payload.db.provider === 'sqlite'">
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">数据库文件路径</label>
          <BaseInput v-model="payload.db.databaseUrl" placeholder="file:../data/data.db" />
          <p class="text-xs text-slate-400 mt-1">路径相对于 prisma 目录，如 <code>file:../data/data.db</code>。</p>
        </div>

        <div v-else class="space-y-4">
          <div class="flex gap-2">
            <button
              class="px-3 py-1.5 text-xs font-medium rounded-md border transition"
              :class="mysqlMode === 'fields' ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200' : 'border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-400'"
              @click="mysqlMode = 'fields'"
            >
              分别填写
            </button>
            <button
              class="px-3 py-1.5 text-xs font-medium rounded-md border transition"
              :class="mysqlMode === 'url' ? 'bg-slate-900 text-white border-slate-900 dark:bg-slate-200 dark:text-slate-900 dark:border-slate-200' : 'border-slate-200/80 dark:border-slate-800/80 text-slate-600 dark:text-slate-400'"
              @click="mysqlMode = 'url'"
            >
              直接输入地址
            </button>
          </div>

          <div v-if="mysqlMode === 'fields'" class="grid grid-cols-2 gap-3">
            <BaseInput v-model="mysqlFields.host" label="主机" placeholder="localhost" />
            <BaseInput v-model="mysqlFields.port" label="端口" placeholder="3306" />
            <BaseInput v-model="mysqlFields.user" label="用户名" placeholder="root" />
            <BaseInput v-model="mysqlFields.password" label="密码" type="password" placeholder="password" />
            <BaseInput v-model="mysqlFields.database" label="数据库" placeholder="lightticket" class="col-span-2" />
            <BaseInput v-model="mysqlFields.params" label="额外参数（可选）" placeholder="sslaccept=strict&connect_timeout=10" class="col-span-2" />
          </div>

          <div v-else>
            <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">数据库地址</label>
            <BaseInput v-model="payload.db.databaseUrl" placeholder="mysql://root:password@localhost:3306/lightticket" />
            <p class="text-xs text-slate-400 mt-1">如 <code>mysql://root:password@localhost:3306/lightticket</code>。</p>
          </div>
        </div>
      </div>

      <!-- Step 3: Admin Account -->
      <div v-else-if="step === 3" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">管理员账户</h2>
        <BaseInput v-model="payload.admin.username" label="用户名" placeholder="admin" />
        <BaseInput v-model="payload.admin.email" label="邮箱" placeholder="admin@example.com" type="email" />
        <BaseInput v-model="payload.admin.password" label="密码" placeholder="至少 6 位字符" type="password" />
      </div>

      <!-- Step 4: Site Settings -->
      <div v-else-if="step === 4" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">站点设置</h2>
        <BaseInput v-model="payload.site!.siteName" label="站点名称" placeholder="LightTickets" />
        <BaseInput v-model="payload.site!.siteUrl" label="站点地址（可选）" placeholder="https://ticket.example.com" />
      </div>

      <!-- Step 5: Optional Default Server -->
      <div v-else-if="step === 5" class="space-y-5">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Minecraft 服务器（可选）</h2>
        <BaseInput v-model="payload.mc!.defaultServerName" label="默认服务器名称" placeholder="MyServer" />
        <p class="text-xs text-slate-400">留空可跳过。之后可在「管理 › 服务器」中添加服务器。</p>
      </div>

      <!-- Step 6: Complete -->
      <div v-else-if="step === 6" class="text-center py-10 space-y-4">
        <div class="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mx-auto flex items-center justify-center text-2xl">
          ✓
        </div>
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">设置完成！</h2>
        <p class="text-slate-500 dark:text-slate-400 text-sm">服务器正在重启，请稍候...</p>
        <div v-if="error" class="text-sm text-red-600 dark:text-red-400">{{ error }}</div>
      </div>

      <div v-if="error" class="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
        {{ error }}
      </div>

      <div class="mt-8 flex justify-between">
        <BaseButton v-if="step > 1 && step <= totalSteps" @click="back">
          上一步
        </BaseButton>
        <div v-else />
        <BaseButton v-if="step < totalSteps" :disabled="!canNext" @click="next">
          下一步
        </BaseButton>
        <BaseButton v-else-if="step === totalSteps" :loading="loading" @click="submit">
          完成设置
        </BaseButton>
        <BaseButton v-else-if="step === 1" @click="next">
          开始使用
        </BaseButton>
      </div>
    </div>
  </div>
</template>
