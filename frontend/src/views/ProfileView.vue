<script setup lang="ts">
import { ref } from 'vue'
import { Icon } from '@iconify/vue'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'
import UserAvatar from '@/components/base/UserAvatar.vue'

const auth = useAuthStore()
const ui = useUiStore()

const activeSection = ref<'account' | 'password' | 'minecraft'>('account')

const navItems = [
  { key: 'account' as const, label: '账号信息', icon: 'lucide:user' },
  { key: 'password' as const, label: '修改密码', icon: 'lucide:lock' },
  { key: 'minecraft' as const, label: 'Minecraft 绑定', icon: 'lucide:gamepad-2' },
]

const mcCode = ref('')
const linking = ref(false)
const unlinking = ref(false)
const confirmUnlink = ref(false)

const avatarInput = ref(auth.user?.avatarUrl || '')
const savingAvatar = ref(false)

const editingUsername = ref(false)
const usernameInput = ref(auth.user?.username || '')
const savingUsername = ref(false)

const editingEmail = ref(false)
const emailInput = ref(auth.user?.email || '')
const savingEmail = ref(false)

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
    editingUsername.value = false
  } catch (e: any) {
    ui.toast(e.message || '更新失败', 'error')
  } finally {
    savingUsername.value = false
  }
}

async function saveEmail() {
  const val = emailInput.value.trim()
  if (!val || !val.includes('@')) {
    ui.toast('请输入有效的邮箱地址', 'error')
    return
  }
  if (val === auth.user?.email) return
  savingEmail.value = true
  try {
    await auth.updateEmail(val)
    ui.toast('邮箱已更新', 'success')
    editingEmail.value = false
  } catch (e: any) {
    ui.toast(e.message || '更新失败', 'error')
  } finally {
    savingEmail.value = false
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

async function unlinkMc() {
  unlinking.value = true
  try {
    await auth.unlinkMinecraft()
    ui.toast('MC 账号已解绑', 'success')
    confirmUnlink.value = false
  } catch (e: any) {
    ui.toast(e.message || '解绑失败', 'error')
  } finally {
    unlinking.value = false
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
  <div class="grid grid-cols-1 md:grid-cols-[200px_1fr] gap-6">
    <nav class="flex md:flex-col gap-1">
      <button
        v-for="item in navItems"
        :key="item.key"
        class="flex items-center gap-2 px-4 py-3 text-sm rounded-md transition text-left"
        :class="activeSection === item.key
          ? 'bg-slate-100 dark:bg-slate-800 text-slate-900 dark:text-slate-100 font-medium'
          : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'"
        @click="activeSection = item.key"
      >
        <Icon :icon="item.icon" class="w-4 h-4" />
        {{ item.label }}
      </button>
    </nav>

    <div class="space-y-6">
      <!-- Account Info -->
      <template v-if="activeSection === 'account'">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">账号信息</h2>

        <div class="flex items-start gap-4">
          <UserAvatar size="lg" :username="auth.user?.username || '?'" :avatar-url="auth.user?.avatarUrl" />
          <div class="space-y-0.5 flex-1 min-w-0">
            <template v-if="!editingUsername">
              <div class="flex items-center gap-2">
                <p class="font-semibold text-slate-900 dark:text-white">{{ auth.user?.username }}</p>
                <button class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition" @click="editingUsername = true">
                  <Icon icon="lucide:pencil" class="w-3.5 h-3.5" />
                </button>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center gap-2 max-w-lg">
                <BaseInput v-model="usernameInput" placeholder="2-32 个字符" class="flex-1 !py-1 !text-sm" />
                <BaseButton size="sm" :loading="savingUsername" :disabled="usernameInput.trim() === auth.user?.username" @click="saveUsername">确认</BaseButton>
                <BaseButton size="sm" @click="editingUsername = false; usernameInput = auth.user?.username || ''">取消</BaseButton>
              </div>
            </template>
            <template v-if="!editingEmail">
              <div class="flex items-center gap-2">
                <p class="text-xs text-slate-500 dark:text-slate-400 font-mono truncate">邮箱: {{ auth.user?.email }}</p>
                <button class="text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition" @click="editingEmail = true">
                  <Icon icon="lucide:pencil" class="w-3.5 h-3.5" />
                </button>
              </div>
            </template>
            <template v-else>
              <div class="flex items-center gap-2 max-w-lg">
                <BaseInput v-model="emailInput" placeholder="your@email.com" class="flex-1 !py-1 !text-sm" />
                <BaseButton size="sm" :loading="savingEmail" :disabled="emailInput.trim() === auth.user?.email" @click="saveEmail">确认</BaseButton>
                <BaseButton size="sm" @click="editingEmail = false; emailInput = auth.user?.email || ''">取消</BaseButton>
              </div>
            </template>
            <p class="text-xs text-slate-500 dark:text-slate-400 font-mono">ID: {{ auth.user?.id }}</p>
          </div>
        </div>

        <div class="space-y-4 max-w-lg">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-slate-900 dark:text-white">头像链接</label>
            <div class="flex gap-2">
              <BaseInput v-model="avatarInput" placeholder="https://xxxx" class="flex-1" />
              <BaseButton size="sm" :loading="savingAvatar" @click="saveAvatar">保存</BaseButton>
              <BaseButton v-if="auth.user?.avatarUrl" size="sm" :loading="savingAvatar" @click="clearAvatar">清除</BaseButton>
            </div>
          </div>
        </div>
      </template>

      <!-- Change Password -->
      <template v-if="activeSection === 'password'">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">修改密码</h2>

        <div class="space-y-4 max-w-lg">
          <div class="space-y-1.5">
            <label class="text-sm font-medium text-slate-900 dark:text-white">当前密码</label>
            <BaseInput v-model="currentPassword" type="password" placeholder="输入当前密码" />
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-medium text-slate-900 dark:text-white">新密码</label>
            <BaseInput v-model="newPassword" type="password" placeholder="至少 8 个字符" />
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-medium text-slate-900 dark:text-white">确认新密码</label>
            <BaseInput v-model="confirmPassword" type="password" placeholder="再次输入新密码" />
          </div>

          <BaseButton size="sm" :loading="savingPassword" @click="changePassword">更新密码</BaseButton>
        </div>
      </template>

      <!-- MC Binding -->
      <template v-if="activeSection === 'minecraft'">
        <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">Minecraft 绑定</h2>

        <div v-if="auth.user?.minecraftName" class="space-y-3 max-w-lg">
          <div class="flex items-center gap-3">
            <Icon icon="lucide:gamepad-2" class="w-5 h-5 text-green-500" />
            <div>
              <p class="font-medium text-slate-900 dark:text-white">{{ auth.user.minecraftName }}</p>
              <p class="text-xs text-slate-500">UUID: {{ auth.user.minecraftUuid }}</p>
            </div>
          </div>
          <template v-if="!confirmUnlink">
            <BaseButton size="sm" variant="danger" @click="confirmUnlink = true">解绑</BaseButton>
          </template>
          <template v-else>
            <p class="text-sm text-slate-500 dark:text-slate-400">确定要解绑该 Minecraft 账号吗？解绑后将无法在游戏中操作议题。</p>
            <div class="flex gap-2">
              <BaseButton size="sm" variant="danger" :loading="unlinking" @click="unlinkMc">确认解绑</BaseButton>
              <BaseButton size="sm" :disabled="unlinking" @click="confirmUnlink = false">取消</BaseButton>
            </div>
          </template>
        </div>

        <div v-else class="space-y-3 max-w-lg">
          <p class="text-sm text-slate-500 dark:text-slate-400">
            请输入在游戏中获取的验证码
          </p>
          <form @submit.prevent="linkMc" class="flex gap-2">
            <BaseInput v-model="mcCode" placeholder="6位验证码" class="flex-1" />
            <BaseButton type="submit" :loading="linking" :disabled="!mcCode.trim()">绑定</BaseButton>
          </form>
        </div>
      </template>
    </div>
  </div>
</template>
