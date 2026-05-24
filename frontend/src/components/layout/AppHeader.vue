<script setup lang="ts">
import { Icon } from '@iconify/vue'
import { RouterLink, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { useUiStore } from '@/stores/ui'
import { siteConfig } from '@/router'

const auth = useAuthStore()
const ui = useUiStore()
const router = useRouter()

function handleLogout() {
  auth.logout()
  ui.mobileMenuOpen = false
  if (siteConfig.requireLogin) {
    router.push({ name: 'login' })
  }
}
</script>

<template>
  <header class="sticky top-0 z-50 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl">
    <div class="max-w-6xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between">
      <div class="flex items-center gap-6">
        <RouterLink to="/" class="text-lg font-semibold text-slate-900 dark:text-white">
          LightTicket
        </RouterLink>
        <nav v-if="auth.isAuthenticated" class="hidden sm:flex items-center gap-4 text-sm text-slate-600 dark:text-slate-400">
          <RouterLink to="/" class="hover:text-slate-900 dark:hover:text-white transition-colors">工单</RouterLink>
          <RouterLink v-if="auth.isAdmin" to="/admin" class="hover:text-slate-900 dark:hover:text-white transition-colors">管理</RouterLink>
        </nav>
      </div>

      <div class="flex items-center gap-3">
        <button
          @click="ui.toggleTheme()"
          class="p-2 rounded-lg text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
          :aria-label="ui.theme === 'dark' ? '切换到亮色模式' : '切换到暗色模式'"
        >
          <Icon :icon="ui.theme === 'dark' ? 'lucide:sun' : 'lucide:moon'" class="w-5 h-5" />
        </button>

        <template v-if="auth.isAuthenticated">
          <div class="relative group">
            <button class="flex items-center gap-2 p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
              <div class="w-7 h-7 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xs font-medium text-slate-700 dark:text-slate-300">
                {{ auth.user?.username?.charAt(0).toUpperCase() }}
              </div>
            </button>
            <div class="absolute right-0 top-full mt-1 w-48 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all">
              <RouterLink to="/profile" class="block px-4 py-2 text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-700">个人资料</RouterLink>
              <button @click="handleLogout" class="w-full text-left px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-slate-50 dark:hover:bg-slate-700">退出登录</button>
            </div>
          </div>
        </template>

        <template v-else>
          <RouterLink to="/login" class="text-sm text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors">登录</RouterLink>
        </template>

        <button
          @click="ui.mobileMenuOpen = !ui.mobileMenuOpen"
          class="sm:hidden p-2 rounded-lg text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
          aria-label="菜单"
        >
          <Icon :icon="ui.mobileMenuOpen ? 'lucide:x' : 'lucide:menu'" class="w-5 h-5" />
        </button>
      </div>
    </div>

    <!-- craft233 style mobile overlay menu -->
    <Transition name="mobile-menu">
      <div v-if="ui.mobileMenuOpen" class="fixed inset-0 z-40 sm:hidden bg-slate-950/40 dark:bg-slate-950/60 flex flex-col p-4 pt-[4.5rem]" @click.self="ui.mobileMenuOpen = false">
        <div class="mx-auto w-full max-w-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm shadow-sm overflow-hidden pointer-events-auto">
          <div class="flex items-center justify-between px-4 py-3 border-b border-slate-200 dark:border-slate-700">
            <span class="text-sm font-medium text-slate-900 dark:text-white">菜单</span>
            <button @click="ui.mobileMenuOpen = false" class="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400">
              <Icon icon="lucide:x" class="w-4 h-4" />
            </button>
          </div>
          <div class="px-2 py-2 space-y-1">
            <template v-if="auth.isAuthenticated">
              <RouterLink to="/" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" @click="ui.mobileMenuOpen = false">
                <Icon icon="lucide:ticket" class="w-4 h-4 text-slate-500 dark:text-slate-400" />
                工单
              </RouterLink>
              <RouterLink v-if="auth.isAdmin" to="/admin" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" @click="ui.mobileMenuOpen = false">
                <Icon icon="lucide:shield" class="w-4 h-4 text-slate-500 dark:text-slate-400" />
                管理
              </RouterLink>
              <div class="my-1 border-t border-slate-200 dark:border-slate-700" />
              <RouterLink to="/profile" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" @click="ui.mobileMenuOpen = false">
                <Icon icon="lucide:user" class="w-4 h-4 text-slate-500 dark:text-slate-400" />
                个人资料
              </RouterLink>
              <button @click="handleLogout" class="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                <Icon icon="lucide:log-out" class="w-4 h-4" />
                退出登录
              </button>
            </template>
            <template v-else>
              <RouterLink to="/login" class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors" @click="ui.mobileMenuOpen = false">
                <Icon icon="lucide:log-in" class="w-4 h-4 text-slate-500 dark:text-slate-400" />
                登录
              </RouterLink>
            </template>
          </div>
        </div>
      </div>
    </Transition>
  </header>
</template>

<style scoped>
.mobile-menu-enter-active {
  transition: opacity 0.2s ease;
}
.mobile-menu-leave-active {
  transition: opacity 0.18s ease;
}
.mobile-menu-enter-from,
.mobile-menu-leave-to {
  opacity: 0;
}
</style>
