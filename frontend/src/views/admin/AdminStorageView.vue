<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { Icon } from '@iconify/vue'
import { useUiStore } from '@/stores/ui'
import BaseButton from '@/components/base/BaseButton.vue'
import {
  apiGetStorageConfig,
  apiUpdateStorageConfig,
  apiTestS3Connection,
  type StorageConfig,
} from '@/api/storage'

const ui = useUiStore()

const loading = ref(false)
const saving = ref(false)
const testing = ref(false)
const testResult = ref<{ success: boolean; message: string } | null>(null)

const driver = ref<'local' | 's3'>('local')
const s3 = ref({
  endpoint: '',
  bucket: '',
  accessKeyId: '',
  secretAccessKey: '',
  forcePathStyle: true,
  presignExpiry: 300,
})

const secretMasked = ref(false)

onMounted(async () => {
  loading.value = true
  try {
    const config = await apiGetStorageConfig()
    applyConfig(config)
  } catch (e: any) {
    ui.toast(e.message || '加载失败', 'error')
  } finally {
    loading.value = false
  }
})

function applyConfig(config: StorageConfig) {
  driver.value = config.driver
  if (config.s3) {
    s3.value = { ...s3.value, ...config.s3 }
    if (config.s3.secretAccessKey === '••••••••') {
      secretMasked.value = true
      s3.value.secretAccessKey = ''
    } else {
      secretMasked.value = false
    }
  }
}

function validateS3(): string | null {
  if (!s3.value.endpoint.trim()) return 'Endpoint 不能为空'
  if (!s3.value.bucket.trim()) return 'Bucket 不能为空'
  if (!s3.value.accessKeyId.trim()) return 'Access Key ID 不能为空'
  if (!s3.value.secretAccessKey.trim() && !secretMasked.value) return 'Secret Access Key 不能为空'
  return null
}

async function save() {
  if (driver.value === 's3') {
    const err = validateS3()
    if (err) { ui.toast(err, 'error'); return }
  }
  saving.value = true
  try {
    const payload: Parameters<typeof apiUpdateStorageConfig>[0] = {
      driver: driver.value,
    }
    if (driver.value === 's3') {
      payload.s3 = { ...s3.value }
      if (!s3.value.secretAccessKey && secretMasked.value) {
        delete (payload.s3 as any).secretAccessKey
      }
    }
    const result = await apiUpdateStorageConfig(payload)
    applyConfig(result)
    ui.toast('存储设置已保存', 'success')
  } catch (e: any) {
    ui.toast(e.message || '保存失败', 'error')
  } finally {
    saving.value = false
  }
}

async function testConnection() {
  testing.value = true
  testResult.value = null
  try {
    const result = await apiTestS3Connection()
    testResult.value = result
    if (result.success) {
      ui.toast('连接成功', 'success')
    } else {
      ui.toast(result.message || '连接失败', 'error')
    }
  } catch (e: any) {
    testResult.value = { success: false, message: e.message || '连接失败' }
    ui.toast(e.message || '连接失败', 'error')
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">存储设置</h2>

    <div v-if="loading" class="py-4 text-center text-slate-400">加载中...</div>

    <div v-else class="space-y-4 max-w-lg">
      <!-- Driver selection -->
      <div class="space-y-2">
        <label class="text-sm font-medium text-slate-900 dark:text-white">存储方式</label>
        <div class="grid grid-cols-2 gap-3">
          <button
            @click="driver = 'local'"
            class="flex items-center gap-2 px-4 py-3 rounded-lg border text-sm transition"
            :class="driver === 'local'
              ? 'border-slate-900 dark:border-slate-200 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'"
          >
            <Icon icon="lucide:hard-drive" class="w-4 h-4" />
            本地磁盘
          </button>
          <button
            @click="driver = 's3'"
            class="flex items-center gap-2 px-4 py-3 rounded-lg border text-sm transition"
            :class="driver === 's3'
              ? 'border-slate-900 dark:border-slate-200 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-white font-medium'
              : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-400'"
          >
            <Icon icon="lucide:cloud" class="w-4 h-4" />
            S3 兼容存储
          </button>
        </div>
      </div>

      <!-- S3 config -->
      <template v-if="driver === 's3'">
        <div class="space-y-4 pt-2 border-t border-slate-200 dark:border-slate-700">
          <p class="text-sm font-medium text-slate-900 dark:text-white pt-2">S3 兼容存储配置</p>

          <div class="space-y-1.5">
            <label class="text-sm text-slate-700 dark:text-slate-300">Endpoint <span class="text-red-500">*</span></label>
            <input
              v-model="s3.endpoint"
              type="text"
              class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
              placeholder="http://localhost:9000"
            />
          </div>

          <div class="space-y-1.5">
            <label class="text-sm text-slate-700 dark:text-slate-300">Bucket <span class="text-red-500">*</span></label>
            <input
              v-model="s3.bucket"
              type="text"
              class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
              placeholder="lighttickets"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="space-y-1.5">
              <label class="text-sm text-slate-700 dark:text-slate-300">Access Key ID <span class="text-red-500">*</span></label>
              <input
                v-model="s3.accessKeyId"
                type="text"
                class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
                placeholder="minioadmin"
              />
            </div>
            <div class="space-y-1.5">
              <label class="text-sm text-slate-700 dark:text-slate-300">Secret Access Key <span class="text-red-500">*</span></label>
              <input
                v-model="s3.secretAccessKey"
                type="password"
                class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
                :placeholder="secretMasked ? '••••••••（留空保持不变）' : 'minioadmin'"
              />
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-sm text-slate-700 dark:text-slate-300">预签名 URL 过期（秒）</label>
            <input
              v-model.number="s3.presignExpiry"
              type="number"
              min="60"
              class="w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-400 dark:focus:ring-slate-500"
              placeholder="300"
            />
          </div>

          <!-- Path Style toggle -->
          <div class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80">
            <div>
              <p class="text-sm font-medium text-slate-900 dark:text-white">Path Style 寻址</p>
              <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">自建 S3 兼容存储（如 MinIO）需开启；AWS S3 官方可关闭</p>
            </div>
            <button
              @click="s3.forcePathStyle = !s3.forcePathStyle"
              class="relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition"
              :class="s3.forcePathStyle ? 'bg-slate-900 dark:bg-slate-200' : 'bg-slate-200 dark:bg-slate-700'"
            >
              <span
                class="pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-sm ring-0 transition-transform dark:bg-slate-800"
                :class="s3.forcePathStyle ? 'translate-x-5' : 'translate-x-0'"
              />
            </button>
          </div>

          <!-- Test connection -->
          <div class="flex items-center gap-3">
            <BaseButton variant="primary" :loading="testing" @click="testConnection">
              <template #default>
                <Icon icon="lucide:plug" class="w-4 h-4" />
                测试连接
              </template>
            </BaseButton>
            <span v-if="testResult" class="text-sm" :class="testResult.success ? 'text-green-600 dark:text-green-400' : 'text-red-600 dark:text-red-400'">
              <Icon :icon="testResult.success ? 'lucide:check-circle' : 'lucide:x-circle'" class="w-4 h-4 inline mr-1" />
              {{ testResult.message }}
            </span>
          </div>
        </div>
      </template>

      <BaseButton filled :loading="saving" @click="save">{{ saving ? '保存中...' : '保存' }}</BaseButton>
    </div>
  </div>
</template>
