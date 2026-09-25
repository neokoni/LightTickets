const CUSTOM_ICON_ATTR = 'data-branding-icon';

const CUSTOM_ICON_RELS = ['icon', 'apple-touch-icon'] as const;

let defaultIcons: HTMLLinkElement[] | null = null;

function collectDefaultIcons(): HTMLLinkElement[] {
  return Array.from(
    document.querySelectorAll<HTMLLinkElement>(
      `link[rel~="icon"]:not([${CUSTOM_ICON_ATTR}]), link[rel="apple-touch-icon"]:not([${CUSTOM_ICON_ATTR}])`,
    ),
  );
}

export function applySiteFavicon(url: string | null): void {
  const head = document.head;
  head
    .querySelectorAll<HTMLLinkElement>(`link[${CUSTOM_ICON_ATTR}]`)
    .forEach((link) => link.remove());

  if (url) {
    if (!defaultIcons) {
      defaultIcons = collectDefaultIcons();
      defaultIcons.forEach((link) => link.remove());
    }
    for (const rel of CUSTOM_ICON_RELS) {
      const link = document.createElement('link');
      link.rel = rel;
      link.href = url;
      link.setAttribute(CUSTOM_ICON_ATTR, '');
      head.appendChild(link);
    }
    return;
  }

  if (defaultIcons) {
    defaultIcons.forEach((link) => head.appendChild(link));
    defaultIcons = null;
  }
}
