<script setup lang="ts">
import { ref, onMounted, onBeforeUnmount } from 'vue'
import { Icon } from '@iconify/vue'
import { RouterLink, useRouter, useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { siteConfig } from '@/router'
import UserAvatar from '@/components/base/UserAvatar.vue'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()
const route = useRoute()

const profileMenuOpen = ref(false)
const profileMenuRef = ref<HTMLElement | null>(null)

function handleClickOutside(e: MouseEvent) {
  if (profileMenuRef.value && !profileMenuRef.value.contains(e.target as Node)) {
    profileMenuOpen.value = false
  }
}

onMounted(() => document.addEventListener('click', handleClickOutside))
onBeforeUnmount(() => document.removeEventListener('click', handleClickOutside))

function handleLogout() {
  auth.logout()
  ui.mobileMenuOpen = false
  profileMenuOpen.value = false
  if (siteConfig.requireLogin) {
    router.push({ name: 'login' })
  }
}
</script>

<template>
  <header class="sticky top-0 z-50 border-b border-slate-200/80 dark:border-slate-800/80 bg-white/45 dark:bg-slate-950/45 backdrop-blur-xl">
    <div class="mx-auto flex w-full max-w-7xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8 lg:py-5">
      <RouterLink to="/" class="inline-flex w-fit shrink-0 items-center gap-2.5">
        <img src="/icons/lighttickets.svg" alt="LightTickets" class="h-6 w-6 lg:h-7 lg:w-7" />
        <div class="text-sm font-semibold tracking-[0.06em] text-slate-900 dark:text-slate-100 lg:text-base">{{ siteConfig.siteName || 'LightTickets' }}</div>
      </RouterLink>

      <nav v-if="auth.isAuthenticated || !siteConfig.requireLogin" class="hidden items-center gap-1 lg:flex">
        <RouterLink to="/" class="nav-link px-2 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 lg:px-2.5 lg:text-base" :class="{ 'nav-link-active': route.path === '/' || route.path.startsWith('/tickets') }">
          <span class="nav-link-text">议题</span>
        </RouterLink>
        <RouterLink v-if="auth.isAdmin" to="/admin" class="nav-link px-2 py-2 text-sm font-medium text-slate-700 dark:text-slate-200 lg:px-2.5 lg:text-base" :class="{ 'nav-link-active': route.path.startsWith('/admin') }">
          <span class="nav-link-text">管理</span>
        </RouterLink>
      </nav>

      <div class="ml-auto flex items-center gap-2">
        <button
          @click="ui.toggleTheme()"
          class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-transparent text-slate-700 transition hover:text-slate-900 dark:border-slate-800 dark:text-slate-200 dark:hover:text-slate-100"
          :aria-label="ui.theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'"
        >
          <Transition name="theme-icon" mode="out-in">
            <Icon :key="ui.theme" :icon="ui.theme === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="h-4 w-4" />
          </Transition>
        </button>

        <template v-if="auth.isAuthenticated">
          <div class="relative inline-flex items-center justify-center rounded-full border border-slate-200 dark:border-slate-800" ref="profileMenuRef">
            <button @click="profileMenuOpen = !profileMenuOpen" class="hover:opacity-80">
              <div class="w-9 h-9 shrink-0">
                <UserAvatar :username="auth.user?.username || '?'" :avatar-url="auth.user?.avatarUrl" />
              </div>
            </button>
            <div v-if="profileMenuOpen" class="absolute right-0 top-full mt-1 w-48 py-1 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-lg">
              <RouterLink to="/profile" class="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:text-slate-900 dark:hover:text-slate-100" @click="profileMenuOpen = false">个人资料</RouterLink>
              <button @click="handleLogout" class="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300">退出登录</button>
            </div>
          </div>
        </template>

        <template v-else>
          <RouterLink to="/login" class="text-sm font-medium text-slate-700 dark:text-slate-200 hover:text-slate-900 dark:hover:text-slate-100 transition">登录</RouterLink>
        </template>

        <button
          @click="ui.mobileMenuOpen = !ui.mobileMenuOpen"
          class="inline-flex h-9 w-9 items-center justify-center rounded-full border border-slate-200 bg-transparent text-slate-700 transition hover:text-slate-900 dark:border-slate-800 dark:text-slate-200 dark:hover:text-slate-100 lg:hidden"
          aria-label="菜单"
        >
          <Icon :icon="ui.mobileMenuOpen ? 'lucide:x' : 'lucide:menu'" class="h-5 w-5" />
        </button>
      </div>
    </div>
  </header>

  <!-- Mobile overlay menu (outside header to avoid backdrop-blur clipping) -->
  <Transition name="fade">
    <div v-if="ui.mobileMenuOpen" class="fixed inset-0 z-[60] flex items-start justify-center bg-slate-950/40 backdrop-blur-sm p-4 pt-[4.5rem] lg:hidden" @click.self="ui.mobileMenuOpen = false">
      <Transition name="mobile-menu" appear>
        <div class="w-full max-w-xl rounded-xl border border-slate-200 bg-white/95 p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900/95" @click.stop>
            <div class="mb-5 flex items-center justify-between">
              <div class="flex items-center gap-2.5">
                <img src="/icons/lighttickets.svg" alt="LightTickets" class="h-6 w-6" />
                <div class="text-sm font-semibold text-slate-900 dark:text-slate-100">{{ siteConfig.siteName || 'LightTickets' }}</div>
              </div>
              <button
                type="button"
                class="inline-flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 text-slate-600 dark:border-slate-800 dark:text-slate-200"
                aria-label="关闭菜单"
                @click="ui.mobileMenuOpen = false"
              >
                ✕
              </button>
            </div>

            <nav class="flex flex-col gap-1">
              <template v-if="auth.isAuthenticated || !siteConfig.requireLogin">
                <RouterLink
                  to="/"
                  class="rounded-md px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-100"
                  active-class="nav-link-active"
                  @click="ui.mobileMenuOpen = false"
                >
                  议题
                </RouterLink>
                <RouterLink
                  v-if="auth.isAdmin"
                  to="/admin"
                  class="rounded-md px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-100"
                  active-class="nav-link-active"
                  @click="ui.mobileMenuOpen = false"
                >
                  管理
                </RouterLink>
                <template v-if="auth.isAuthenticated">
                  <div class="my-1 border-t border-slate-200 dark:border-slate-800" />
                  <RouterLink
                    to="/profile"
                    class="rounded-md px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-100"
                    @click="ui.mobileMenuOpen = false"
                  >
                    个人资料
                  </RouterLink>
                  <button @click="handleLogout" class="w-full rounded-md px-4 py-2.5 text-left text-sm font-medium text-red-600 dark:text-red-400 transition hover:text-red-700 dark:hover:text-red-300">
                    退出登录
                  </button>
                </template>
              </template>
              <template v-else>
                <RouterLink
                  to="/login"
                  class="rounded-md px-4 py-2.5 text-sm font-medium text-slate-700 transition hover:text-slate-900 dark:text-slate-200 dark:hover:text-slate-100"
                  @click="ui.mobileMenuOpen = false"
                >
                  登录
                </RouterLink>
              </template>
            </nav>
          </div>
        </Transition>
      </div>
    </Transition>
  </template>

<style scoped>
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.18s ease;
}

.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}

.mobile-menu-enter-active,
.mobile-menu-leave-active {
  transition: transform 0.24s ease, opacity 0.24s ease;
}

.mobile-menu-enter-from,
.mobile-menu-leave-to {
  transform: translateY(-14px);
  opacity: 0;
}

.theme-icon-enter-active,
.theme-icon-leave-active {
  transition: opacity 0.2s ease, transform 0.2s ease;
}

.theme-icon-enter-from {
  opacity: 0;
  transform: rotate(-16deg) scale(0.9);
}

.theme-icon-leave-to {
  opacity: 0;
  transform: rotate(16deg) scale(0.9);
}
</style>
