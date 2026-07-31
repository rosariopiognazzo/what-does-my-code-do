import { createHash } from 'node:crypto';

export function normalizeProjectPath(value: string): string {
  return value.replaceAll('\\', '/').replace(/^\.\//, '');
}

export function stableNodeId(kind: string, path: string, symbol?: string): string {
  const parts = [kind, normalizeProjectPath(path)];
  if (symbol) parts.push(symbol);
  return parts.join(':');
}

export function slugify(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .replace(/-{2,}/g, '-');
}

export function capabilityId(name: string): string {
  return `capability:${slugify(name) || 'unnamed'}`;
}

export function shortHash(value: string): string {
  return createHash('sha256').update(value).digest('hex').slice(0, 16);
}

export function stableStringify(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(',')}]`;
  }

  if (value && typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`);
    return `{${entries.join(',')}}`;
  }

  return JSON.stringify(value);
}

export function contentHash(value: unknown): string {
  return createHash('sha256').update(stableStringify(value)).digest('hex');
}
