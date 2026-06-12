<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { siteConfig } from '@/router'
import BaseInput from '@/components/base/BaseInput.vue'
import BaseButton from '@/components/base/BaseButton.vue'

const router = useRouter()
const auth = useAuthStore()

const username = ref('')
const email = ref('')
const password = ref('')
const confirmPassword = ref('')
const error = ref('')
const loading = ref(false)

onMounted(() => {
  if (!siteConfig.allowWebRegister) {
    router.replace('/login')
  }
})

async function submit() {
  error.value = ''
  if (password.value !== confirmPassword.value) {
    error.value = '两次密码不一致'
    return
  }
  if (password.value.length < 6) {
    error.value = '密码至少6位'
    return
  }
  loading.value = true
  try {
    await auth.register(email.value, password.value, username.value)
    router.push('/')
  } catch (e: any) {
    error.value = e.message || '注册失败'
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <div class="flex min-h-[calc(100vh-16rem)] items-center justify-center px-4 py-10 sm:px-6 lg:px-8 lg:py-16">
    <div class="w-full max-w-md rounded-xl border border-slate-200/80 bg-white/80 p-6 shadow-sm backdrop-blur dark:border-slate-800/80 dark:bg-slate-900/80 sm:p-8">
      <div>
        <p class="text-sm font-semibold tracking-[0.2em] text-slate-500 uppercase dark:text-slate-400">LightTickets</p>
        <h1 class="mt-4 text-2xl font-bold tracking-tight text-slate-950 dark:text-white sm:text-3xl">注册</h1>
        <p class="mt-4 text-base leading-8 text-slate-600 dark:text-slate-300">创建 LightTickets 账号</p>
      </div>

      <form @submit.prevent="submit" class="mt-6 space-y-4">
        <BaseInput v-model="username" label="用户名" placeholder="your_name" />
        <BaseInput v-model="email" label="邮箱" type="email" placeholder="you@example.com" />
        <BaseInput v-model="password" label="密码" type="password" placeholder="至少6位" />
        <BaseInput v-model="confirmPassword" label="确认密码" type="password" placeholder="再次输入密码" />

        <p v-if="error" class="text-sm text-red-500">{{ error }}</p>

        <BaseButton filled type="submit" :loading="loading" class="w-full">注册</BaseButton>
      </form>

      <p class="mt-6 text-center text-sm text-slate-500 dark:text-slate-400">
        已有账号？
        <RouterLink to="/login" class="font-semibold text-slate-900 dark:text-slate-100 hover:text-slate-700 dark:hover:text-slate-300 transition">登录</RouterLink>
      </p>
    </div>
  </div>
</template>
