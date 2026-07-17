<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';
</script>

<template>
  <section
    class="flex min-h-[calc(100vh-17rem)] items-center justify-center py-10 text-center sm:py-16"
    aria-labelledby="not-found-title"
  >
    <div class="w-full max-w-lg">
      <p class="text-sm font-semibold text-slate-500 dark:text-slate-400">404</p>
      <h1
        id="not-found-title"
        class="mt-3 text-3xl font-bold text-slate-950 dark:text-white sm:text-4xl"
      >
        {{ t('notFound.title') }}
      </h1>
      <p class="mx-auto mt-4 max-w-md text-base leading-7 text-slate-600 dark:text-slate-300">
        {{ t('notFound.description') }}
      </p>

      <div class="mt-8">
        <BaseButton
          :as="RouterLink"
          to="/"
          filled
          icon="lucide:arrow-left"
          :has-hover="false"
          class="!text-white dark:!text-slate-900"
        >
          {{ t('notFound.action') }}
        </BaseButton>
      </div>
    </div>
  </section>
</template>
