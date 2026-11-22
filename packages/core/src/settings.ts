// The shell's settings (those of every module are the module's own), with their defaults in one place and the
// check that turns untrusted input (the UI, an old or hand-edited config.json) into valid settings. No Node imports.

import { cleanLogin, LOGIN_NAME } from '@stream-toolz/twitch/api';
import { bool, clamp, text } from './normalize';

export interface AppSettings {
  /** App language ("de", "en"). */
  language: string;
  /** Addresses, the Client ID and file paths are hidden, in case the app is on stream. */
  streamerMode: boolean;
  /** Login name of the channel to connect to; empty: the logged-in account's own channel. */
  channel: string;
  /** Local port for the OBS browser sources. */
  serverPort: number;
}

export const DEFAULT_SERVER_PORT = 47391;

export const DEFAULT_APP_SETTINGS: AppSettings = {
  language: 'de',
  streamerMode: false,
  channel: '',
  serverPort: DEFAULT_SERVER_PORT,
};

/** First start: the app in the system's language (German or English). */
export function defaultAppSettings(locale: string): AppSettings {
  return { ...DEFAULT_APP_SETTINGS, language: locale.toLowerCase().startsWith('de') ? 'de' : 'en' };
}

const LANGUAGE = /^[a-z]{2}$/;

export function normalizeAppSettings(value: unknown, base: AppSettings = DEFAULT_APP_SETTINGS): AppSettings {
  const v: Partial<Record<keyof AppSettings, unknown>> = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    language: text(v.language, LANGUAGE, base.language, false),
    streamerMode: bool(v.streamerMode, base.streamerMode),
    channel: typeof v.channel === 'string' ? text(cleanLogin(v.channel), LOGIN_NAME, base.channel) : base.channel,
    serverPort: clamp(v.serverPort, 1024, 65535, base.serverPort, 1),
  };
}
