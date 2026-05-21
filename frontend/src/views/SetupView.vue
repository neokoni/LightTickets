<script setup lang="ts">
import { ref, computed, reactive } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { completeSetup, type SetupPayload } from '@/api/setup'
import BaseButton from '@/components/base/BaseButton.vue'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseColorPicker from '@/components/base/BaseColorPicker.vue'

const router = useRouter()
const auth = useAuthStore()
const step = ref(1)
const loading = ref(false)
const error = ref('')

const payload = reactive<SetupPayload>({
  db: {
    provider: 'sqlite',
    databaseUrl: 'file:./dev.db',
  },
  admin: {
    email: '',
    password: '',
    username: '',
  },
  site: {
    siteName: 'LightTicket',
    siteUrl: '',
    accentColor: '#111111',
  },
  mc: {
    defaultServerName: '',
  },
})

const totalSteps = 5

const canNext = computed(() => {
  switch (step.value) {
    case 2:
      return payload.db.provider && payload.db.databaseUrl
    case 3:
      return payload.admin.email && payload.admin.password.length >= 6 && payload.admin.username.length >= 2
    case 4:
      return !!payload.site!.siteName
    default:
      return true
  }
})

function next() {
  if (step.value < totalSteps) step.value++
}

function back() {
  if (step.value > 1) step.value--
}

async function submit() {
  loading.value = true
  error.value = ''
  try {
    const res = await completeSetup({
      db: payload.db,
      admin: payload.admin,
      site: payload.site,
      mc: payload.mc?.defaultServerName ? { defaultServerName: payload.mc.defaultServerName } : undefined,
    })
    auth.setTokens(res.token, res.refreshToken)
    step.value = 6
    setTimeout(() => router.replace({ name: 'tickets' }), 1800)
  } catch (e: any) {
    error.value = e?.message || '设置失败，请重试。'  
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="min-h-screen bg-slate-50 dark:bg-slate-950 flex items-center justify-center p-4">
    <div class="w-full max-w-xl bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm p-8">
      <div class="mb-8">
        <h1 class="text-2xl font-bold text-slate-900 dark:text-slate-100">站点初始化</h1>
        <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">步骤 {{ step }} / {{ totalSteps }}</p>
        <div class="mt-4 h-1 bg-slate-100 dark:bg-slate-800 rounded overflow-hidden">
          <div
            class="h-full bg-accent-500 transition-all duration-300"
            :style="{ width: ((step / totalSteps) * 100) + '%' }"
          />
        </div>
      </div>

      <!-- Step 1: Welcome -->
      <div v-if="step === 1">
        <div class="text-center py-6">
          <div class="w-16 h-16 rounded-2xl bg-accent-500 mx-auto mb-4 flex items-center justify-center text-white text-2xl font-bold">
            LT
          </div>
          <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">欢迎使用 LightTicket</h2>
          <p class="text-slate-500 dark:text-slate-400 mt-2 text-sm leading-relaxed max-w-xs mx-auto">
            本向导将帮助你完成站点初始化：数据库配置、管理员账户创建和基本站点设置。
          </p>
        </div>
      </div>

      <!-- Step 2: Database -->
      <div v-else-if="step === 2" class="space-y-5">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">数据库配置</h2>
        <div class="flex gap-3">
          <button
            class="flex-1 py-3 rounded-xl border text-sm font-medium transition-colors"
            :class="payload.db.provider === 'sqlite'
              ? 'bg-accent-500 text-white border-accent-500'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'"
            @click="payload.db.provider = 'sqlite'"
          >
            SQLite
          </button>
          <button
            class="flex-1 py-3 rounded-xl border text-sm font-medium transition-colors"
            :class="payload.db.provider === 'mysql'
              ? 'bg-accent-500 text-white border-accent-500'
              : 'bg-white dark:bg-slate-900 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'"
            @click="payload.db.provider = 'mysql'"
          >
            MySQL
          </button>
        </div>
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">数据库地址</label>
          <BaseInput
            v-model="payload.db.databaseUrl"
            :placeholder="payload.db.provider === 'sqlite' ? 'file:./dev.db' : 'mysql://user:pass@localhost:3306/db'"
          />
          <p class="text-xs text-slate-400 mt-1">SQLite 建议使用相对路径，如 <code>file:./dev.db</code>。</p>
        </div>
      </div>

      <!-- Step 3: Admin Account -->
      <div v-else-if="step === 3" class="space-y-5">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">管理员账户</h2>
        <BaseInput v-model="payload.admin.username" label="用户名" placeholder="admin" />
        <BaseInput v-model="payload.admin.email" label="邮箱" placeholder="admin@example.com" type="email" />
        <BaseInput v-model="payload.admin.password" label="密码" placeholder="至少 6 位字符" type="password" />
      </div>

      <!-- Step 4: Site Settings -->
      <div v-else-if="step === 4" class="space-y-5">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">站点设置</h2>
        <BaseInput v-model="payload.site!.siteName" label="站点名称" placeholder="LightTicket" />
        <BaseInput v-model="payload.site!.siteUrl" label="站点地址（可选）" placeholder="https://ticket.example.com" />
        <div>
          <label class="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-2">强调色</label>
          <BaseColorPicker v-model="payload.site!.accentColor" />
        </div>
      </div>

      <!-- Step 5: Optional Default Server -->
      <div v-else-if="step === 5" class="space-y-5">
        <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">Minecraft 服务器（可选）</h2>
        <BaseInput v-model="payload.mc!.defaultServerName" label="默认服务器名称" placeholder="MyServer" />
        <p class="text-xs text-slate-400">留空可跳过。之后可在「管理 › 服务器」中添加服务器。</p>
      </div>

      <!-- Step 6: Complete -->
      <div v-else-if="step === 6" class="text-center py-10 space-y-4">
        <div class="w-14 h-14 rounded-full bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 mx-auto flex items-center justify-center text-2xl">
          ✓
        </div>
        <h2 class="text-lg font-semibold text-slate-900 dark:text-slate-100">设置完成！</h2>
        <p class="text-slate-500 dark:text-slate-400 text-sm">正在跳转至工单列表...</p>
      </div>

      <div v-if="error" class="mt-4 text-sm text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 px-3 py-2 rounded-lg">
        {{ error }}
      </div>

      <div class="mt-8 flex justify-between">
        <BaseButton v-if="step > 1 && step < 6" variant="secondary" @click="back">
          上一步
        </BaseButton>
        <div v-else />
        <BaseButton v-if="step < 5" :disabled="!canNext" @click="next">
          下一步
        </BaseButton>
        <BaseButton v-else-if="step === 5" :loading="loading" @click="submit">
          完成设置
        </BaseButton>
        <BaseButton v-else-if="step === 1" @click="next">
          开始使用
        </BaseButton>
      </div>
    </div>
  </div>
</template>
