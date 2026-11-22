// Checks for arguments of calls from the UI (IPC): they are never trusted, in the shell and in every module.

export function asObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

/** An id or a short value. */
export function asString(value: unknown): string {
  if (typeof value !== 'string' || value.length > 200) throw new Error('Invalid argument');
  return value;
}

/** A text the user typed, e.g. a test message (Twitch allows 500 characters). */
export function asText(value: unknown): string {
  if (typeof value !== 'string' || value.length > 500) throw new Error('Invalid argument');
  return value;
}
