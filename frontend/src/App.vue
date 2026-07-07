<script setup lang="ts">
import { RouterView } from 'vue-router';
import { useRoute } from 'vue-router';
import AppShell from '@/components/layout/AppShell.vue';

const route = useRoute();
</script>

<template>
  <template v-if="route.meta.setup">
    <RouterView />
  </template>
  <AppShell v-else>
    <RouterView v-slot="{ Component }">
      <Transition name="page" mode="out-in">
        <component :is="Component" />
      </Transition>
    </RouterView>
  </AppShell>
</template>

<style>
.page-enter-active,
.page-leave-active {
  transition:
    opacity 0.28s ease,
    transform 0.28s ease;
}
.page-enter-from {
  opacity: 0;
  transform: translateY(8px);
}
.page-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
</style>
