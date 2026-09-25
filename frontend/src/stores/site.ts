import { computed, reactive, ref, watch } from 'vue';
import type { SiteConfig } from '@/types/site';
import { applySiteFavicon } from '@/utils/branding';
import type { useUiStore } from '@/stores/ui';

export const DEFAULT_SITE_TITLE = 'LightTickets';
export const DEFAULT_SITE_LOGO = '/icons/lighttickets.svg';

type SiteConfigCache = Omit<SiteConfig, 'isSetup' | 'requireLogin'> & {
  isSetup: boolean | null;
  requireLogin: boolean | null;
  connectionError: boolean;
};

export const siteConfig = reactive<SiteConfigCache>({
  isSetup: null,
  requireLogin: null,
  allowWebRegister: true,
  allowMcRegister: true,
  passwordResetEnabled: false,
  registrationEmailVerificationEnabled: false,
  siteName: '',
  siteUrl: null,
  footerContent: null,
  defaultLanguage: 'zh-CN',
  faviconUrl: null,
  faviconDarkUrl: null,
  logoUrl: null,
  logoDarkUrl: null,
  turnstile: { enabled: false, siteKey: '' },
  federatedAuthProviders: [],
  connectionError: false,
});

const darkTheme = ref(false);

function variantUrl(lightUrl: string | null, darkUrl: string | null): string | null {
  const light = lightUrl?.trim() || null;
  const dark = darkUrl?.trim() || null;
  return darkTheme.value ? dark || light : light;
}

export const siteTitle = computed(() => siteConfig.siteName?.trim() || DEFAULT_SITE_TITLE);

const customSiteLogoUrl = computed(() => variantUrl(siteConfig.logoUrl, siteConfig.logoDarkUrl));

export const siteLogoUrl = computed(() => customSiteLogoUrl.value || DEFAULT_SITE_LOGO);

export const isDefaultSiteLogo = computed(() => !customSiteLogoUrl.value);

watch(
  siteTitle,
  (value) => {
    document.title = value;
  },
  { immediate: true },
);

export function initSiteBranding(ui: ReturnType<typeof useUiStore>): void {
  watch(
    () => ui.resolvedTheme,
    (value) => {
      darkTheme.value = value === 'dark';
    },
    { immediate: true },
  );
  watch(
    () => variantUrl(siteConfig.faviconUrl, siteConfig.faviconDarkUrl),
    (value) => applySiteFavicon(value),
    { immediate: true },
  );
}

export function setSiteConfigCache(data: SiteConfig) {
  Object.assign(siteConfig, data, { connectionError: false });
}

export function setMailFeatureAvailabilityCache(
  value: Pick<SiteConfig, 'passwordResetEnabled' | 'registrationEmailVerificationEnabled'>,
) {
  siteConfig.passwordResetEnabled = value.passwordResetEnabled;
  siteConfig.registrationEmailVerificationEnabled = value.registrationEmailVerificationEnabled;
}

export function setRequireLoginCache(value: boolean) {
  siteConfig.requireLogin = value;
}

export function setConnectionError(value: boolean) {
  siteConfig.connectionError = value;
}
