<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue';
import { getSettings, updateSettings } from '@/api/setup';
import { apiDeleteBranding, apiUploadBranding } from '@/api/branding';
import type { BrandingSlot, BrandingState } from '@/types/site';
import {
  DEFAULT_SITE_LOGO,
  setMailFeatureAvailabilityCache,
  setRequireLoginCache,
  siteConfig,
  siteTitle,
} from '@/stores/site';
import { DEFAULT_FAVICON, DEFAULT_FAVICON_DARK } from '@/utils/branding';
import { ToastType, useUiStore } from '@/stores/ui';
import { handleError } from '@/utils/error';
import { availableLanguages, t } from '@/i18n';
import BaseButton from '@/components/base/BaseButton.vue';
import BaseInput from '@/components/base/BaseInput.vue';
import BaseLoadingState from '@/components/base/BaseLoadingState.vue';
import BaseSelect from '@/components/base/BaseSelect.vue';
import BaseTextarea from '@/components/base/BaseTextarea.vue';
import BaseToggle from '@/components/base/BaseToggle.vue';

const BRANDING_ACCEPT = 'image/png,image/jpeg,image/webp,image/gif,image/svg+xml';

const ui = useUiStore();
const requireLogin = ref(false);
const allowWebRegister = ref(true);
const allowMcRegister = ref(true);
const siteName = ref('');
const siteUrl = ref('');
const footerContent = ref('');
const defaultLanguage = ref('zh-CN');
const sendEmailNotifications = ref(false);
const loading = ref(false);
const saving = ref(false);

onMounted(async () => {
  loading.value = true;
  try {
    const config = await getSettings();
    requireLogin.value = config.requireLogin;
    siteName.value = config.siteName;
    siteUrl.value = config.siteUrl ?? '';
    allowWebRegister.value = config.allowWebRegister ?? true;
    allowMcRegister.value = config.allowMcRegister ?? true;
    footerContent.value = config.footerContent ?? '';
    defaultLanguage.value = config.defaultLanguage;
    sendEmailNotifications.value = config.sendEmailNotifications;
  } finally {
    loading.value = false;
  }
});

async function save() {
  saving.value = true;
  try {
    const result = await updateSettings({
      requireLogin: requireLogin.value,
      allowWebRegister: allowWebRegister.value,
      allowMcRegister: allowMcRegister.value,
      siteName: siteName.value,
      siteUrl: siteUrl.value || null,
      footerContent: footerContent.value || null,
      defaultLanguage: defaultLanguage.value,
      sendEmailNotifications: sendEmailNotifications.value,
    });
    setRequireLoginCache(result.requireLogin);
    siteConfig.siteName = result.siteName;
    siteConfig.siteUrl = result.siteUrl;
    siteConfig.footerContent = result.footerContent;
    siteConfig.allowWebRegister = result.allowWebRegister;
    siteConfig.allowMcRegister = result.allowMcRegister;
    siteConfig.defaultLanguage = result.defaultLanguage;
    setMailFeatureAvailabilityCache(result);
    ui.toast(t('admin.settings.saved'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.saveFailed'));
  } finally {
    saving.value = false;
  }
}

const fileInputs = reactive<Partial<Record<BrandingSlot, HTMLInputElement | null>>>({});
const uploadingSlot = ref<BrandingSlot | null>(null);
const deletingSlot = ref<BrandingSlot | null>(null);

interface BrandingVariant {
  slot: BrandingSlot;
  dark: boolean;
  label: string;
  status: string;
  custom: boolean;
  previewUrl: string;
  previewClass: string;
}

interface BrandingAsset {
  lightSlot: BrandingSlot;
  darkSlot: BrandingSlot;
  lightUrl: string | null;
  darkUrl: string | null;
  defaultLight: string;
  defaultDark: string;
  defaultFilter: [string, string];
}

function buildVariants(asset: BrandingAsset): BrandingVariant[] {
  const variant = (dark: boolean): BrandingVariant => {
    const own = dark ? asset.darkUrl : asset.lightUrl;
    const inherited = dark ? asset.lightUrl : null;
    const fallback = inherited ?? (dark ? asset.defaultDark : asset.defaultLight);
    let status = t('admin.settings.brandingCustom');
    if (!own) {
      status = inherited
        ? t('admin.settings.brandingInherited')
        : t('admin.settings.brandingDefault');
    }
    return {
      slot: dark ? asset.darkSlot : asset.lightSlot,
      dark,
      label: dark ? t('admin.settings.variantDark') : t('admin.settings.variantLight'),
      status,
      custom: !!own,
      previewUrl: own ?? fallback,
      previewClass: own || inherited ? '' : asset.defaultFilter[dark ? 1 : 0],
    };
  };
  return [variant(false), variant(true)];
}

const brandingGroups = computed(() => [
  {
    key: 'favicon',
    label: t('admin.settings.favicon'),
    tileClass: 'w-9',
    variants: buildVariants({
      lightSlot: 'favicon',
      darkSlot: 'favicon-dark',
      lightUrl: siteConfig.faviconUrl,
      darkUrl: siteConfig.faviconDarkUrl,
      defaultLight: DEFAULT_FAVICON,
      defaultDark: DEFAULT_FAVICON_DARK,
      defaultFilter: ['', ''],
    }),
  },
  {
    key: 'logo',
    label: t('admin.settings.logo'),
    tileClass: 'w-28',
    variants: buildVariants({
      lightSlot: 'logo',
      darkSlot: 'logo-dark',
      lightUrl: siteConfig.logoUrl,
      darkUrl: siteConfig.logoDarkUrl,
      defaultLight: DEFAULT_SITE_LOGO,
      defaultDark: DEFAULT_SITE_LOGO,
      defaultFilter: ['brightness-0', 'brightness-0 invert'],
    }),
  },
]);

function applyBrandingState(state: BrandingState) {
  siteConfig.faviconUrl = state.faviconUrl;
  siteConfig.faviconDarkUrl = state.faviconDarkUrl;
  siteConfig.logoUrl = state.logoUrl;
  siteConfig.logoDarkUrl = state.logoDarkUrl;
}

function setFileInput(slot: BrandingSlot, element: unknown) {
  fileInputs[slot] = (element as HTMLInputElement | null) ?? null;
}

function pickBrandingFile(slot: BrandingSlot) {
  fileInputs[slot]?.click();
}

async function uploadBranding(slot: BrandingSlot, event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0] ?? null;
  input.value = '';
  if (!file) return;
  uploadingSlot.value = slot;
  try {
    applyBrandingState(await apiUploadBranding(slot, file));
    ui.toast(t('admin.settings.saved'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.saveFailed'));
  } finally {
    uploadingSlot.value = null;
  }
}

async function removeBranding(slot: BrandingSlot) {
  deletingSlot.value = slot;
  try {
    applyBrandingState(await apiDeleteBranding(slot));
    ui.toast(t('admin.settings.saved'), ToastType.SUCCESS);
  } catch (e) {
    handleError(e, t('common.deleteFailed'));
  } finally {
    deletingSlot.value = null;
  }
}
</script>

<template>
  <div class="space-y-6">
    <h2 class="text-xl font-semibold tracking-tight text-slate-950 dark:text-white">
      {{ t('admin.settings.title') }}
    </h2>

    <BaseLoadingState v-if="loading" />

    <div v-else class="space-y-4 max-w-lg">
      <!-- Site Name -->
      <BaseInput
        v-model="siteName"
        :label="t('admin.settings.siteName')"
        required
        maxlength="100"
        :placeholder="siteTitle"
      />

      <!-- Site URL -->
      <BaseInput
        v-model="siteUrl"
        :label="t('admin.settings.siteUrl')"
        type="url"
        placeholder="https://ticket.example.com"
      />

      <BaseSelect
        v-model="defaultLanguage"
        :label="t('settings.language.default')"
        required
        :options="
          availableLanguages.map((language) => ({
            value: language.id,
            label: language.displayName,
          }))
        "
      />

      <!-- Footer Content -->
      <div class="space-y-1.5">
        <label class="text-sm font-medium text-slate-900 dark:text-white">{{
          t('admin.settings.footerContent')
        }}</label>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          {{ t('admin.settings.footerHelp') }}
        </p>
        <BaseTextarea
          v-model="footerContent"
          :rows="3"
          maxlength="2000"
          :placeholder="t('admin.settings.footerPlaceholder')"
        />
      </div>

      <!-- Site Icon & Logo -->
      <div class="space-y-4">
        <div v-for="group in brandingGroups" :key="group.key" class="space-y-1.5">
          <label class="text-sm font-medium text-slate-900 dark:text-white">{{
            group.label
          }}</label>
          <div
            class="divide-y divide-slate-200/80 rounded-xl border border-slate-200/80 dark:divide-slate-800/80 dark:border-slate-800/80"
          >
            <div
              v-for="variant in group.variants"
              :key="variant.slot"
              class="flex items-center gap-4 px-4 py-3"
            >
              <div
                class="flex h-9 shrink-0 items-center justify-center rounded-md border p-1.5"
                :class="[
                  group.tileClass,
                  variant.dark ? 'border-slate-800 bg-slate-950' : 'border-slate-200 bg-white',
                ]"
              >
                <img
                  :src="variant.previewUrl"
                  :alt="variant.label"
                  class="max-h-full max-w-full object-contain"
                  :class="[variant.previewClass, { 'opacity-60': !variant.custom }]"
                />
              </div>
              <div class="min-w-0 flex-1">
                <p class="text-sm font-medium text-slate-900 dark:text-white">
                  {{ variant.label }}
                </p>
                <p class="text-xs text-slate-500 dark:text-slate-400">
                  {{ variant.status }}
                </p>
              </div>
              <div class="flex shrink-0 items-center gap-2">
                <BaseButton
                  size="sm"
                  icon="lucide:upload"
                  :loading="uploadingSlot === variant.slot"
                  :disabled="deletingSlot === variant.slot"
                  @click="pickBrandingFile(variant.slot)"
                >
                  {{ variant.custom ? t('admin.settings.brandingReplace') : t('common.upload') }}
                </BaseButton>
                <BaseButton
                  v-if="variant.custom"
                  size="sm"
                  variant="danger"
                  icon="lucide:trash-2"
                  :aria-label="t('common.delete')"
                  :title="t('common.delete')"
                  :loading="deletingSlot === variant.slot"
                  :disabled="uploadingSlot === variant.slot"
                  @click="removeBranding(variant.slot)"
                />
              </div>
              <input
                :ref="(element: unknown) => setFileInput(variant.slot, element)"
                type="file"
                class="sr-only"
                tabindex="-1"
                aria-hidden="true"
                :accept="BRANDING_ACCEPT"
                @change="uploadBranding(variant.slot, $event)"
              />
            </div>
          </div>
        </div>
        <p class="text-xs text-slate-500 dark:text-slate-400">
          {{ t('admin.settings.brandingFormatHint') }}
        </p>
      </div>

      <!-- Allow Web Register Toggle -->
      <div
        class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            {{ t('admin.settings.allowWebRegister') }}
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {{ t('admin.settings.allowWebRegisterHelp') }}
          </p>
        </div>
        <BaseToggle v-model="allowWebRegister" />
      </div>

      <!-- Allow MC Register Toggle -->
      <div
        class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            {{ t('admin.settings.allowMcRegister') }}
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {{ t('admin.settings.allowMcRegisterHelp') }}
          </p>
        </div>
        <BaseToggle v-model="allowMcRegister" />
      </div>

      <!-- Require Login Toggle -->
      <div
        class="flex items-center justify-between px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            {{ t('admin.settings.requireLogin') }}
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {{ t('admin.settings.requireLoginHelp') }}
          </p>
        </div>
        <BaseToggle v-model="requireLogin" />
      </div>

      <div
        class="flex items-center justify-between gap-4 px-6 py-5 rounded-xl border border-slate-200/80 dark:border-slate-800/80"
      >
        <div>
          <p class="text-sm font-medium text-slate-900 dark:text-white">
            {{ t('admin.settings.sendEmailNotifications') }}
          </p>
          <p class="text-xs text-slate-500 dark:text-slate-400 mt-1">
            {{ t('admin.settings.sendEmailNotificationsHelp') }}
          </p>
        </div>
        <BaseToggle v-model="sendEmailNotifications" />
      </div>

      <BaseButton filled :loading="saving" @click="save">{{
        saving ? t('common.saving') : t('common.save')
      }}</BaseButton>
    </div>
  </div>
</template>
