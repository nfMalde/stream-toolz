// Building blocks for the settings checks of the shell and the modules: each turns an untrusted value (the UI,
// an old or hand-edited config.json) into a valid one, or keeps the fallback. No Node imports.

/** Lists (ignored users, blocked words) and lookups (nicknames) keep at most this many entries. */
export const MAX_LIST = 200;

export function clamp(value: unknown, min: number, max: number, fallback: number, step = 0): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  return step ? Math.round(clamped / step) * step : clamped;
}

export function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

export function text(value: unknown, pattern: RegExp, fallback: string, allowEmpty = true): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (v === '') return allowEmpty ? '' : fallback;
  return pattern.test(v) ? v : fallback;
}

/** A list of words or names: trimmed, lower case, no duplicates, no empty entries. */
export function wordList(value: unknown, fallback: string[], clean: (v: string) => string, pattern: RegExp): string[] {
  if (!Array.isArray(value)) return fallback;
  const list = value.filter((v): v is string => typeof v === 'string').map(clean).filter((v) => v && pattern.test(v));
  return [...new Set(list)].slice(0, MAX_LIST);
}

/** A lookup (nicknames, pronunciations): keys cleaned and unique, spoken values without control characters. */
/** The entry for a key, or undefined: never anything from Object.prototype ("constructor" is a valid chat word). */
export function own(map: Record<string, string>, key: string): string | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

export function lookup(value: unknown, fallback: Record<string, string>, cleanKey: (k: string) => string, keyPattern: RegExp): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => [cleanKey(k), typeof v === 'string' ? v.replace(/\p{Cc}/gu, ' ').trim().slice(0, 60) : ''] as const)
    .filter(([k, v]) => k && v && keyPattern.test(k));
  return Object.fromEntries(entries.slice(0, MAX_LIST));
}
