const RETURN_TO_BASE = new URL('https://lighttickets.invalid');

export function safeReturnTo(value: unknown): string {
  if (typeof value !== 'string') return '/';
  const path = value.trim();
  if (!path.startsWith('/') || path.includes('\\')) return '/';

  try {
    const resolved = new URL(path, RETURN_TO_BASE);
    return resolved.origin === RETURN_TO_BASE.origin
      ? `${resolved.pathname}${resolved.search}${resolved.hash}`
      : '/';
  } catch {
    return '/';
  }
}
