// Channel Points' settings, with their defaults and the check that turns untrusted input (the UI, an old or hand-edited
// config.json) into complete, valid settings. No Node imports: the UI shares this file.

import { bool, clamp, oneOf, text } from '@stream-toolz/core/normalize';

export type OutputMode = 'device' | 'obs';

/** What plays for one reward. The title is a copy of Twitch's, so the row has a name while Twitch is not reachable. */
export interface RewardSettings {
  title: string;
  /** A file name in the module's sounds folder; '' = no sound. */
  sound: string;
  /** 0..100, on top of the master volume. */
  volume: number;
  /** Redemptions of the same reward within this many seconds are skipped (0 = none). */
  cooldownSeconds: number;
  enabled: boolean;
}

export interface Settings {
  /** By reward id (Twitch's UUID). */
  rewards: Record<string, RewardSettings>;
  /** The ReadMyChat OBS browser source, or an audio device. */
  output: OutputMode;
  /** Audio device for output 'device' ('' = the system's default). */
  deviceId: string;
  /** Master volume 0..100. */
  volume: number;
  /** More waiting sounds than this: new redemptions are skipped until one has played. */
  maxQueue: number;
}

/** Redemptions kept for the "Last redemptions" card (memory only; fixed, not a setting). */
export const LOG_SIZE = 50;
/** More rewards than this are not kept (Twitch allows 50 custom rewards per channel). */
export const MAX_REWARDS = 200;
export const MAX_SOUND_BYTES = 10 * 1024 * 1024;
export const SOUND_EXTENSIONS = ['wav', 'mp3', 'ogg'] as const;

/** A reward id as Twitch issues them (a UUID), checked loosely. */
export const REWARD_ID = /^[\w-]{1,64}$/;
/** A file name in the sounds folder: no path separators, never "." or "..". */
export const SOUND_NAME = /^[\w-][\w.-]{0,119}$/;
/** Chromium's audio device ids: 64 hex characters, or 'default'/'communications'. */
const DEVICE_ID = /^[\w-]{1,128}$/;
const MAX_TITLE = 64;

export const DEFAULT_REWARD: RewardSettings = { title: '', sound: '', volume: 100, cooldownSeconds: 0, enabled: true };

export const DEFAULT_SETTINGS: Settings = {
  rewards: {},
  output: 'device',
  deviceId: '',
  volume: 80,
  maxQueue: 5,
};

/** Defaults for a first start (locale: the system's, e.g. "de-DE"). */
export function defaultSettings(_locale: string): Settings {
  return { ...DEFAULT_SETTINGS, rewards: {} };
}

/** A reward's title as Twitch shows it: one line, bounded. */
function title(value: unknown, fallback: string): string {
  return typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').trim().slice(0, MAX_TITLE) : fallback;
}

export function normalizeReward(value: unknown, base: RewardSettings = DEFAULT_REWARD): RewardSettings {
  const v: Partial<Record<keyof RewardSettings, unknown>> = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    title: title(v.title, base.title),
    sound: text(v.sound, SOUND_NAME, base.sound),
    volume: clamp(v.volume, 0, 100, base.volume, 1),
    cooldownSeconds: clamp(v.cooldownSeconds, 0, 3600, base.cooldownSeconds, 1),
    enabled: bool(v.enabled, base.enabled),
  };
}

/** Every reward whose id is valid, each checked against its earlier settings (or the defaults for a new one). */
function rewards(value: unknown, base: Settings['rewards']): Settings['rewards'] {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return base;
  const result: Settings['rewards'] = {};
  for (const [id, reward] of Object.entries(value as Record<string, unknown>)) {
    if (!REWARD_ID.test(id)) continue;
    if (Object.keys(result).length >= MAX_REWARDS) break;
    result[id] = normalizeReward(reward, Object.hasOwn(base, id) ? base[id] : DEFAULT_REWARD);
  }
  return result;
}

export function normalizeSettings(value: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const v: Partial<Record<keyof Settings, unknown>> = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    rewards: rewards(v.rewards, base.rewards),
    output: oneOf(v.output, ['device', 'obs'] as const, base.output),
    deviceId: text(v.deviceId, DEVICE_ID, base.deviceId),
    volume: clamp(v.volume, 0, 100, base.volume, 1),
    maxQueue: clamp(v.maxQueue, 1, 20, base.maxQueue, 1),
  };
}
