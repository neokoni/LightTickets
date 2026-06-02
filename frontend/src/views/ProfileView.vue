<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'

const auth = useAuthStore()
const ui = useUiStore()

const mcCode = ref('')
const linking = ref(false)

const avatarInput = ref(auth.user?.avatarUrl || '')
const savingAvatar = ref(false)

async function saveAvatar() {
  savingAvatar.value = true
  try {
    await auth.updateAvatar(avatarInput.value.trim() || null)
    ui.toast('头像已更新', 'success')
  } catch (e: any) {
    ui.toast(e.message || '更新失败', 'error')
  } finally {
    savingAvatar.value = false
  }
}

async function clearAvatar() {
  avatarInput.value = ''
  savingAvatar.value = true
  try {
    await auth.updateAvatar(null)
    ui.toast('头像已清除', 'success')
  } catch (e: any) {
    ui.toast(e.message || '更新失败', 'error')
  } finally {
    savingAvatar.value = false
  }
}

async function linkMc() {
  if (!mcCode.value.trim()) return
  linking.value = true
  try {
    await auth.linkMinecraft(mcCode.value.trim())
    ui.toast('MC 账号绑定成功', 'success')
    mcCode.value = ''
  } catch (e: any) {
    ui.toast(e.message || '绑定失败', 'error')
  } finally {
    linking.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-8">
    <h1 class="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">个人资料</h1>

    <!-- Avatar -->
    <section class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-4">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">头像</h2>
      <div class="flex items-center gap-4">
        <img
          v-if="auth.user?.avatarUrl"
          :src="auth.user.avatarUrl"
          class="w-16 h-16 rounded-full object-cover border border-slate-200 dark:border-slate-700"
          alt="avatar"
        />
        <div v-else class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
          {{ auth.user?.username?.charAt(0).toUpperCase() }}
        </div>
        <div class="flex-1 space-y-2">
          <BaseInput v-model="avatarInput" placeholder="输入头像直链 URL" />
          <div class="flex gap-2">
            <BaseButton size="sm" :loading="savingAvatar" @click="saveAvatar">保存</BaseButton>
            <BaseButton v-if="auth.user?.avatarUrl" size="sm" variant="secondary" :loading="savingAvatar" @click="clearAvatar">清除</BaseButton>
          </div>
        </div>
      </div>
    </section>

    <!-- Account info -->
    <section class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-4">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">账号信息</h2>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
        <div>
          <span class="text-slate-500 dark:text-slate-400">用户名</span>
          <p class="mt-1 font-medium text-slate-900 dark:text-white">{{ auth.user?.username }}</p>
        </div>
        <div>
          <span class="text-slate-500 dark:text-slate-400">邮箱</span>
          <p class="mt-1 font-medium text-slate-900 dark:text-white">{{ auth.user?.email }}</p>
        </div>
        <div>
          <span class="text-slate-500 dark:text-slate-400">角色</span>
          <p class="mt-1 font-medium text-slate-900 dark:text-white">{{ auth.user?.role }}</p>
        </div>
      </div>
    </section>

    <!-- MC binding -->
    <section class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-4">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Minecraft 绑定</h2>

      <div v-if="auth.user?.minecraftName" class="flex items-center gap-3">
        <Icon icon="lucide:gamepad-2" class="w-5 h-5 text-green-500" />
        <div>
          <p class="font-medium text-slate-900 dark:text-white">{{ auth.user.minecraftName }}</p>
          <p class="text-xs text-slate-500">UUID: {{ auth.user.minecraftUuid }}</p>
        </div>
      </div>

      <div v-else class="space-y-3">
        <p class="text-sm text-slate-500 dark:text-slate-400">
          在游戏中输入 <code class="px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded-md text-xs">/bindweb</code> 获取验证码
        </p>
        <form @submit.prevent="linkMc" class="flex gap-2">
          <BaseInput v-model="mcCode" placeholder="6位验证码" class="flex-1" />
          <BaseButton type="submit" :loading="linking" :disabled="!mcCode.trim()">绑定</BaseButton>
        </form>
      </div>
    </section>
  </div>
</template>
