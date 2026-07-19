<script setup lang="ts">
import { Icon } from '@iconify/vue';
import { t } from '@/i18n';
import { DEFAULT_SITE_TITLE } from '@/stores/site';

const GITHUB_URL = 'https://github.com/neokoni/LightTickets';
const BUILD_COMMIT = import.meta.env.LT_BUILD_COMMIT;
const APP_VERSION = import.meta.env.LT_APP_VERSION;
const VERSION_LABEL = APP_VERSION === 'unknow' ? APP_VERSION : `v${APP_VERSION}`;
</script>

<template>
  <div class="max-w-xl">
    <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
      {{ t('admin.about.title') }}
    </h2>

    <div class="mt-8 flex items-center gap-3">
      <img
        src="/icons/lighttickets.svg"
        :alt="DEFAULT_SITE_TITLE"
        class="app-logo h-12 w-12 shrink-0"
      />
      <div class="min-w-0">
        <p class="break-words text-xl font-semibold text-slate-950 dark:text-white">
          {{ DEFAULT_SITE_TITLE }}
        </p>
        <p class="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{{ VERSION_LABEL }}</p>
      </div>
    </div>

    <div class="mt-8 flex flex-col items-start gap-3 text-sm text-slate-600 dark:text-slate-300">
      <a
        :href="GITHUB_URL"
        target="_blank"
        rel="noopener noreferrer"
        class="inline-flex max-w-full items-center gap-2 hover:text-slate-950 dark:hover:text-white"
      >
        <Icon icon="lucide:github" class="h-4 w-4 shrink-0" />
        <span
          class="break-all underline decoration-slate-300 underline-offset-4 dark:decoration-slate-600"
        >
          {{ GITHUB_URL }}
        </span>
        <Icon icon="lucide:external-link" class="h-3.5 w-3.5 shrink-0" />
      </a>
      <div class="inline-flex items-center gap-2">
        <Icon icon="lucide:git-commit-horizontal" class="h-4 w-4 shrink-0" />
        <code class="font-mono text-slate-800 dark:text-slate-100">{{ BUILD_COMMIT }}</code>
      </div>
    </div>
  </div>
</template>
