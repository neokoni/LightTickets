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

const usernameInput = ref(auth.user?.username || '')
const savingUsername = ref(false)

const currentPassword = ref('')
const newPassword = ref('')
const confirmPassword = ref('')
const savingPassword = ref(false)

async function saveUsername() {
  const val = usernameInput.value.trim()
  if (!val || val.length < 2 || val.length > 32) {
    ui.toast('用户名需要 2-32 个字符', 'error')
    return
  }
  if (val === auth.user?.username) return
  savingUsername.value = true
  try {
    await auth.updateUsername(val)
    ui.toast('用户名已更新', 'success')
  } catch (e: any) {
    ui.toast(e.message || '更新失败', 'error')
  } finally {
    savingUsername.value = false
  }
}

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
  savingAvatar.value = true
  try {
    await auth.updateAvatar(null)
    avatarInput.value = ''
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

async function changePassword() {
  if (!currentPassword.value || !newPassword.value) {
    ui.toast('请填写所有密码字段', 'error')
    return
  }
  if (newPassword.value.length < 8) {
    ui.toast('新密码至少 8 个字符', 'error')
    return
  }
  if (newPassword.value !== confirmPassword.value) {
    ui.toast('两次输入的密码不一致', 'error')
    return
  }
  savingPassword.value = true
  try {
    await auth.changePassword(currentPassword.value, newPassword.value)
    ui.toast('密码已更新', 'success')
    currentPassword.value = ''
    newPassword.value = ''
    confirmPassword.value = ''
  } catch (e: any) {
    ui.toast(e.message || '更新失败', 'error')
  } finally {
    savingPassword.value = false
  }
}
</script>

<template>
  <div class="max-w-2xl mx-auto space-y-8">
    <h1 class="text-3xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-4xl">个人资料</h1>

    <!-- Account info -->
    <section class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-4">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">账号信息</h2>

      <div class="flex items-start gap-4">
        <img
          v-if="auth.user?.avatarUrl"
          :src="auth.user.avatarUrl"
          class="w-16 h-16 rounded-full object-cover border border-slate-200 dark:border-slate-700 shrink-0"
          alt="avatar"
          @error="auth.user.avatarUrl = null"
        />
        <div v-else class="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl font-medium text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 shrink-0">
          {{ auth.user?.username?.charAt(0).toUpperCase() }}
        </div>
        <div class="space-y-0.5">
          <p class="font-semibold text-slate-900 dark:text-white">{{ auth.user?.username }}</p>
          <p class="text-xs text-slate-500 dark:text-slate-400 font-mono">ID: {{ auth.user?.id }}</p>
        </div>
      </div>

      <div class="space-y-1.5">
        <label class="text-sm text-slate-500 dark:text-slate-400">用户名</label>
        <div class="flex gap-2">
          <BaseInput v-model="usernameInput" placeholder="2-32 个字符" class="flex-1" />
          <BaseButton size="sm" :loading="savingUsername" :disabled="usernameInput.trim() === auth.user?.username" @click="saveUsername">保存</BaseButton>
        </div>
      </div>

      <div class="space-y-1.5">
        <label class="text-sm text-slate-500 dark:text-slate-400">头像链接</label>
        <div class="flex gap-2">
          <BaseInput v-model="avatarInput" placeholder="https://xxxx" class="flex-1" />
          <BaseButton size="sm" :loading="savingAvatar" @click="saveAvatar">保存</BaseButton>
          <BaseButton v-if="auth.user?.avatarUrl" size="sm" :loading="savingAvatar" @click="clearAvatar">清除</BaseButton>
        </div>
      </div>
    </section>

    <!-- Change password -->
    <section class="px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80 bg-white/70 dark:bg-slate-900/70 backdrop-blur space-y-4">
      <h2 class="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">修改密码</h2>

      <div class="space-y-1.5">
        <label class="text-sm text-slate-500 dark:text-slate-400">当前密码</label>
        <BaseInput v-model="currentPassword" type="password" placeholder="输入当前密码" />
      </div>

      <div class="space-y-1.5">
        <label class="text-sm text-slate-500 dark:text-slate-400">新密码</label>
        <BaseInput v-model="newPassword" type="password" placeholder="至少 8 个字符" />
      </div>

      <div class="space-y-1.5">
        <label class="text-sm text-slate-500 dark:text-slate-400">确认新密码</label>
        <BaseInput v-model="confirmPassword" type="password" placeholder="再次输入新密码" />
      </div>

      <BaseButton size="sm" :loading="savingPassword" @click="changePassword">更新密码</BaseButton>
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
          请输入在游戏中获取的验证码
        </p>
        <form @submit.prevent="linkMc" class="flex gap-2">
          <BaseInput v-model="mcCode" placeholder="6位验证码" class="flex-1" />
          <BaseButton type="submit" :loading="linking" :disabled="!mcCode.trim()">绑定</BaseButton>
        </form>
      </div>
    </section>
  </div>
</template>
