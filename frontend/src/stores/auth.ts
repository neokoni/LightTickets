import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import type { User } from '@/types/user'
import { apiLogin, apiRegister, apiRefresh, apiLinkMinecraft, apiUpdateAvatar } from '@/api/auth'
import { setAccessToken } from '@/api/client'

export const useAuthStore = defineStore('auth', () => {
  const user = ref<User | null>(null)
  const loading = ref(true)

  const isAuthenticated = computed(() => !!user.value)
  const isStaff = computed(() => user.value?.role === 'staff' || user.value?.role === 'admin')
  const isAdmin = computed(() => user.value?.role === 'admin')

  async function login(emailOrUsername: string, password: string) {
    const res = await apiLogin(emailOrUsername, password)
    user.value = res.user
    setAccessToken(res.accessToken)
    localStorage.setItem('lt-refresh-token', res.refreshToken)
  }

  async function register(email: string, password: string, username: string) {
    const res = await apiRegister(email, password, username)
    user.value = res.user
    setAccessToken(res.accessToken)
    localStorage.setItem('lt-refresh-token', res.refreshToken)
  }

  async function restore() {
    const token = localStorage.getItem('lt-refresh-token')
    if (!token) {
      loading.value = false
      return
    }
    try {
      const res = await apiRefresh(token)
      user.value = res.user
      setAccessToken(res.accessToken)
    } catch {
      localStorage.removeItem('lt-refresh-token')
    } finally {
      loading.value = false
    }
  }

  function logout() {
    user.value = null
    setAccessToken(null)
    localStorage.removeItem('lt-refresh-token')
  }

  function setTokens(accessToken: string, refreshToken: string, userData: User) {
    user.value = userData
    setAccessToken(accessToken)
    localStorage.setItem('lt-refresh-token', refreshToken)
  }

  async function linkMinecraft(code: string) {
    const res = await apiLinkMinecraft(code)
    if (user.value) {
      user.value.minecraftUuid = res.uuid
      user.value.minecraftName = res.name
    }
  }

  async function updateAvatar(avatarUrl: string | null) {
    const updated = await apiUpdateAvatar(avatarUrl)
    if (user.value) {
      user.value.avatarUrl = updated.avatarUrl
    }
  }

  return { user, loading, isAuthenticated, isStaff, isAdmin, login, register, restore, logout, setTokens, linkMinecraft, updateAvatar }
})
