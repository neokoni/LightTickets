const CUSTOM_ICON_ATTR = 'data-branding-icon';

const CUSTOM_ICON_RELS = ['icon', 'apple-touch-icon'] as const;

const LIGHT_HREF_ATTR = 'data-branding-light-href';

export const DEFAULT_FAVICON = '/favicon.svg';

export const DEFAULT_FAVICON_DARK = '/favicon-dark.svg';

interface DefaultIconSpec {
  rel: 'icon' | 'apple-touch-icon';
  href: string;
  type?: string;
  sizes?: string;
}

const DEFAULT_ICON_SPECS: readonly DefaultIconSpec[] = [
  { rel: 'icon', href: DEFAULT_FAVICON, type: 'image/svg+xml' },
  { rel: 'icon', href: '/icons/lighttickets_32.png', type: 'image/png', sizes: '32x32' },
  { rel: 'icon', href: '/icons/lighttickets_64.png', type: 'image/png', sizes: '64x64' },
  { rel: 'icon', href: '/icons/lighttickets_128.png', type: 'image/png', sizes: '128x128' },
  { rel: 'icon', href: '/icons/lighttickets_512.png', type: 'image/png', sizes: '512x512' },
  { rel: 'apple-touch-icon', href: '/icons/lighttickets_128.png', sizes: '128x128' },
];

const DARK_ICON_BY_HREF: Readonly<Record<string, string>> = {
  [DEFAULT_FAVICON]: DEFAULT_FAVICON_DARK,
};

let defaultIcons: HTMLLinkElement[] | null = null;

function getDefaultIcons(): HTMLLinkElement[] {
  if (defaultIcons) return defaultIcons;

  defaultIcons = DEFAULT_ICON_SPECS.map((spec) => {
    const link = document.createElement('link');
    link.rel = spec.rel;
    link.href = spec.href;
    if (spec.type) link.type = spec.type;
    if (spec.sizes) link.sizes = spec.sizes;
    if (spec.rel === 'icon') link.setAttribute(LIGHT_HREF_ATTR, spec.href);
    return link;
  });
  return defaultIcons;
}

function applyDefaultIconTheme(dark: boolean): void {
  const head = document.head;

  for (const link of getDefaultIcons()) {
    if (link.relList.contains('icon')) {
      const lightHref = link.getAttribute(LIGHT_HREF_ATTR) ?? link.getAttribute('href') ?? '';
      const darkHref = DARK_ICON_BY_HREF[lightHref];

      if (dark) {
        if (!darkHref) {
          link.remove();
          continue;
        }
        link.setAttribute('href', darkHref);
      } else {
        link.setAttribute('href', lightHref);
      }
    }

    if (!link.isConnected) head.appendChild(link);
  }
}

export function applySiteFavicon(url: string | null, dark = false): void {
  const head = document.head;
  head
    .querySelectorAll<HTMLLinkElement>(`link[${CUSTOM_ICON_ATTR}]`)
    .forEach((link) => link.remove());

  if (url) {
    getDefaultIcons().forEach((link) => link.remove());
    for (const rel of CUSTOM_ICON_RELS) {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = url;
      link.setAttribute(CUSTOM_ICON_ATTR, '');
      head.appendChild(link);
    }
    return;
  }

  applyDefaultIconTheme(dark);
}
