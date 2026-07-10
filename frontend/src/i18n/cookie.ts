const COOKIE_NAME = 'lt_language';
const MAX_AGE = 60 * 60 * 24 * 365;

export function getLanguageCookie(): string | null {
  const entry = document.cookie
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!entry) return null;
  return decodeURIComponent(entry.slice(COOKIE_NAME.length + 1));
}

export function setLanguageCookie(languageId: string): void {
  document.cookie = `${COOKIE_NAME}=${encodeURIComponent(languageId)}; Path=/; Max-Age=${MAX_AGE}; SameSite=Lax`;
}
