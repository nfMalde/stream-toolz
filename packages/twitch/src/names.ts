// Twitch login names as the user types them. No Node imports: the UI and the settings checks use it.

/** Twitch login names: 4 to 25 letters, digits and underscores (older accounts may be shorter). */
export const LOGIN_NAME = /^[a-z0-9_]{1,25}$/;

/** A login name as typed ("@Name", "twitch.tv/name"): lower case, without the extras. */
export function cleanLogin(value: string): string {
  return value
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?twitch\.tv\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}
