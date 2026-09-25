const CUSTOM_ICON_ATTR = 'data-branding-icon';

const CUSTOM_ICON_RELS = ['icon', 'apple-touch-icon'] as const;

const LIGHT_HREF_ATTR = 'data-branding-light-href';

const DARK_ICON_BY_HREF: Readonly<Record<string, string>> = {
  '/favicon.svg': '/favicon-dark.svg',
};

let defaultIcons: HTMLLinkElement[] | null = null;

function collectDefaultIcons(): HTMLLinkElement[] {
  return Array.from(
    document.querySelectorAll<HTMLLinkElement>(
      `link[rel~="icon"]:not([${CUSTOM_ICON_ATTR}]), link[rel="apple-touch-icon"]:not([${CUSTOM_ICON_ATTR}])`,
    ),
  );
}

function getDefaultIcons(): HTMLLinkElement[] {
  if (!defaultIcons) defaultIcons = collectDefaultIcons();
  return defaultIcons;
}

function applyDefaultIconTheme(dark: boolean): void {
  const head = document.head;

  for (const link of getDefaultIcons()) {
    if (link.relList.contains('icon')) {
      let lightHref = link.getAttribute(LIGHT_HREF_ATTR);
      if (lightHref === null) {
        lightHref = link.getAttribute('href') ?? '';
        link.setAttribute(LIGHT_HREF_ATTR, lightHref);
      }

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
