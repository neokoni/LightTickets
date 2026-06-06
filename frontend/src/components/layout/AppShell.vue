<script setup lang="ts">
import AppHeader from './AppHeader.vue'
import ToastContainer from './ToastContainer.vue'
import { siteConfig } from '@/router'
</script>

<template>
  <div class="min-h-screen flex flex-col text-slate-900 dark:text-slate-100">
    <AppHeader />
    <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <slot />
    </main>
    <footer class="mt-auto bg-white/65 backdrop-blur-xl dark:bg-slate-950/65 border-t border-slate-200/80 dark:border-slate-800/80">
      <div class="mx-auto w-full max-w-7xl px-4 py-8 sm:px-6 lg:px-8 space-y-2">
        <p v-if="siteConfig.footerContent" class="text-center text-sm text-slate-500 dark:text-slate-400 [&_a]:underline [&_a]:hover:text-slate-700 dark:[&_a]:hover:text-slate-300" v-html="siteConfig.footerContent" />
        <p class="text-center text-sm text-slate-500 dark:text-slate-400">&copy; {{ new Date().getFullYear() }} {{ siteConfig.siteName || 'LightTickets' }}</p>
      </div>
    </footer>
    <ToastContainer />
  </div>
</template>
