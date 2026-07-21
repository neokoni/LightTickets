const FORBIDDEN_SEGMENTS = new Set(['__proto__', 'prototype', 'constructor']);

export function readJsonPath(value: unknown, path: string | null | undefined): unknown {
  const normalized = path?.trim();
  if (!normalized) return undefined;

  let current = value;
  for (const segment of normalized.split('.')) {
    if (!segment || FORBIDDEN_SEGMENTS.has(segment)) return undefined;
    if (Array.isArray(current)) {
      if (!/^\d+$/.test(segment)) return undefined;
      current = current[Number(segment)];
      continue;
    }
    if (typeof current !== 'object' || current === null) return undefined;
    current = Object.prototype.hasOwnProperty.call(current, segment)
      ? (current as Record<string, unknown>)[segment]
      : undefined;
  }
  return current;
}
