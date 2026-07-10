import { computed, reactive } from 'vue';
import type { SiteConfig } from '@/types/site';

export const DEFAULT_SITE_TITLE = 'LightTickets';

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
  siteName: '',
  siteUrl: null,
  footerContent: null,
  defaultLanguage: 'zh-CN',
  connectionError: false,
});

export const siteTitle = computed(() => siteConfig.siteName?.trim() || DEFAULT_SITE_TITLE);

export function setSiteConfigCache(data: SiteConfig) {
  Object.assign(siteConfig, data, { connectionError: false });
}

export function setRequireLoginCache(value: boolean) {
  siteConfig.requireLogin = value;
}

export function setConnectionError(value: boolean) {
  siteConfig.connectionError = value;
}
