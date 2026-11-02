import { computed, ref, watchEffect } from 'vue';
import { t } from '@/i18n';
import { siteTitle } from '@/stores/site';

type PageTitleSource = { key: string } | { text: string };

const pageTitle = ref<PageTitleSource | null>(null);

const resolvedPageTitle = computed(() => {
  const source = pageTitle.value;
  if (!source) return '';
  return 'key' in source ? t(source.key) : source.text;
});

export function setPageTitleKey(key: string | null): void {
  pageTitle.value = key ? { key } : null;
}

export function setPageTitleText(text: string | null): void {
  pageTitle.value = text ? { text } : null;
}

watchEffect(() => {
  const page = resolvedPageTitle.value;
  document.title = page ? `${page} - ${siteTitle.value}` : siteTitle.value;
});
