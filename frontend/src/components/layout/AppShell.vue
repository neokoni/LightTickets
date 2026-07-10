<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue';
import MarkdownIt from 'markdown-it';
import AppHeader from './AppHeader.vue';
import ToastContainer from './ToastContainer.vue';
import ConfirmDialog from '@/components/base/ConfirmDialog.vue';
import { siteConfig } from '@/stores/site';

const md = new MarkdownIt({ html: false, linkify: true });

const defaultLinkOpen =
  md.renderer.rules.link_open ||
  ((tokens, idx, options, _env, self) => self.renderToken(tokens, idx, options));
md.renderer.rules.link_open = (tokens, idx, options, env, self) => {
  tokens[idx].attrSet('target', '_blank');
  tokens[idx].attrSet('rel', 'noopener noreferrer');
  return defaultLinkOpen(tokens, idx, options, env, self);
};

const footerRef = ref<HTMLElement | null>(null);
const footerHtml = computed(() =>
  siteConfig.footerContent ? md.renderInline(siteConfig.footerContent) : '',
);

watch(
  footerHtml,
  () => {
    nextTick(() => {
      if (footerRef.value) footerRef.value.innerHTML = footerHtml.value;
    });
  },
  { immediate: true },
);
</script>

<template>
  <div class="min-h-screen flex flex-col text-slate-900 dark:text-slate-100">
    <AppHeader />
    <main class="flex-1 w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8 lg:py-12">
      <slot />
    </main>
    <footer
      class="mt-auto bg-white/65 backdrop-blur-xl dark:bg-slate-950/65 border-t border-slate-200/80 dark:border-slate-800/80"
    >
      <div class="mx-auto w-full max-w-7xl px-4 py-4 sm:px-6 lg:px-8 space-y-1">
        <div
          v-if="footerHtml"
          ref="footerRef"
          class="prose prose-sm prose-slate mx-auto max-w-none text-center dark:prose-invert prose-a:underline hover:prose-a:text-slate-700 dark:hover:prose-a:text-slate-300 mb-0 last:mb-0 **:mb-0"
        />
        <p class="text-center text-sm text-slate-500 dark:text-slate-400">
          &copy; {{ new Date().getFullYear() }} {{ siteConfig.siteName || 'LightTickets' }}
        </p>
      </div>
    </footer>
    <ToastContainer />
    <ConfirmDialog />
  </div>
</template>
