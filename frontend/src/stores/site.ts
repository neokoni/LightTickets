import { reactive } from 'vue';
import type { SiteConfig } from '@/types/site';

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
  siteName: 'LightTickets',
  siteUrl: null,
  footerContent: null,
  connectionError: false,
});

export function setSiteConfigCache(data: SiteConfig) {
  Object.assign(siteConfig, data, { connectionError: false });
}

export function setRequireLoginCache(value: boolean) {
  siteConfig.requireLogin = value;
}

export function setConnectionError(value: boolean) {
  siteConfig.connectionError = value;
}
