import { computed, reactive } from 'vue';
import type { MailSettings, SiteConfig } from '@/types/site';

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
  passwordResetEnabled: false,
  registrationEmailVerificationEnabled: false,
  siteName: '',
  siteUrl: null,
  footerContent: null,
  defaultLanguage: 'zh-CN',
  turnstile: { enabled: false, siteKey: '' },
  connectionError: false,
});

export const siteTitle = computed(() => siteConfig.siteName?.trim() || DEFAULT_SITE_TITLE);

export function setSiteConfigCache(data: SiteConfig) {
  Object.assign(siteConfig, data, { connectionError: false });
}

export function canSendPasswordResetMail(mail: MailSettings): boolean {
  if (!mail.enabled) return false;
  if (!mail.host.trim()) return false;
  if (!Number.isInteger(mail.port) || mail.port <= 0) return false;
  if (!mail.fromAddress.trim()) return false;
  if (mail.username && !mail.passwordSet) return false;
  return true;
}

export function setPasswordResetEnabledCache(value: boolean) {
  siteConfig.passwordResetEnabled = value;
  siteConfig.registrationEmailVerificationEnabled = value;
}

export function setRequireLoginCache(value: boolean) {
  siteConfig.requireLogin = value;
}

export function setConnectionError(value: boolean) {
  siteConfig.connectionError = value;
}
