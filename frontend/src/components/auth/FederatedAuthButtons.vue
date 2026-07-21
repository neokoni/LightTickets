<script setup lang="ts">
import { ref } from 'vue';
import { useRoute } from 'vue-router';
import { apiStartFederatedAuth } from '@/api/federatedauth';
import { siteConfig } from '@/stores/site';
import { t } from '@/i18n';
import { handleError } from '@/utils/error';
import BaseButton from '@/components/base/BaseButton.vue';

defineProps<{ registrationOnly?: boolean }>();
const route = useRoute();
const loadingSlug = ref<string | null>(null);

async function start(slug: string) {
  loadingSlug.value = slug;
  try {
    const returnTo = typeof route.query.redirect === 'string' ? route.query.redirect : '/';
    const result = await apiStartFederatedAuth(slug, returnTo);
    window.location.assign(result.authorizationUrl);
  } catch (error) {
    handleError(error, t('federatedauth.startFailed'));
    loadingSlug.value = null;
  }
}
</script>

<template>
  <div class="space-y-2">
    <BaseButton
      v-for="provider in siteConfig.federatedAuthProviders.filter(
        (item) => !registrationOnly || item.allowRegistration,
      )"
      :key="provider.slug"
      class="w-full"
      :loading="loadingSlug === provider.slug"
      :disabled="loadingSlug !== null"
      @click="start(provider.slug)"
    >
      <img
        v-if="provider.iconUrl"
        :src="provider.iconUrl"
        :alt="provider.name"
        class="h-5 w-5 rounded object-contain"
      />
      {{ t('federatedauth.continueWith', { provider: provider.name }) }}
    </BaseButton>
  </div>
</template>
