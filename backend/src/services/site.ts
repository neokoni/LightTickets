export const DEFAULT_SITE_TITLE = 'LightTickets';

export function resolveSiteTitle(value: string | null | undefined): string {
  return value?.trim() || DEFAULT_SITE_TITLE;
}
