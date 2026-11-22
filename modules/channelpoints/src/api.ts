// The Channel Points part of the contract between the UI and the main process (window.stz.channelpoints). Types only (plus a
// few constants), so the UI can import it without Node code.

import type { ModuleSettingsApi, Unsubscribe } from '@stream-toolz/core/api';
import type { Settings } from './settings';

/** The module's id: its key in config.json, its IPC namespace, window.stz.channelpoints. */
export const CHANNELPOINTS = 'channelpoints';

// Names that another module also exports ("OutputMode", "Settings") are prefixed: every module's api is merged into @stz/api.
export type { OutputMode as ChannelpointsOutputMode, RewardSettings, Settings as ChannelpointsSettings } from './settings';
/** Pure checks and constants the UI shares with the main process (these files have no Node imports). */
export { DEFAULT_REWARD, LOG_SIZE as CHANNELPOINTS_LOG_SIZE, MAX_SOUND_BYTES, SOUND_EXTENSIONS } from './settings';

/** A reward as Twitch lists it (the UI merges it with the settings). */
export interface RewardInfo {
  id: string;
  title: string;
  cost: number;
  /** Switched on in the Twitch dashboard (viewers can redeem it). */
  enabled: boolean;
}

/**
 * needs-login: the login lacks the channel points permission; unavailable: not the broadcaster's own channel (or no
 * affiliate/partner); not-connected: no Twitch connection. Anything else is Twitch's message.
 */
export type RewardsError = 'needs-login' | 'unavailable' | 'not-connected' | (string & {});
export type RewardsResult = { rewards: RewardInfo[]; error?: undefined } | { error: RewardsError; rewards?: undefined };

/**
 * played: its sound played; no-sound: the reward has no sound (or the file is gone); cooldown: too soon after the
 * same reward; disabled: switched off here; queue-full: too many waiting; test: from the Test button.
 */
export type RedemptionOutcome = 'played' | 'no-sound' | 'cooldown' | 'disabled' | 'queue-full' | 'test';

export interface RedemptionLogEntry {
  /** The redemption's id (a test gets its own). */
  id: string;
  at: number;
  /** Who redeemed (display name). */
  name: string;
  rewardTitle: string;
  /** What the viewer typed, for rewards that ask for text. */
  input: string;
  outcome: RedemptionOutcome;
}

export interface ChannelpointsStatus {
  /** The files in the sounds folder (names only), sorted. */
  sounds: string[];
  /** The last redemptions, oldest first. */
  log: RedemptionLogEntry[];
  /** Sounds waiting to play. */
  queued: number;
}

/** Why a picked file was not added. */
export type SoundRejection = 'too-large' | 'type' | 'failed';
export interface PickSoundsResult {
  /** The names in the sounds folder (cleaned, with a suffix when the name was taken). */
  added: string[];
  rejected: { name: string; reason: SoundRejection }[];
}

export interface ChannelpointsApi extends ModuleSettingsApi<Settings> {
  /** The channel's rewards from Twitch; an error instead of a throw, so the page can explain it. */
  rewards(): Promise<RewardsResult>;
  status(): Promise<ChannelpointsStatus>;
  onStatus(listener: (status: ChannelpointsStatus) => void): Unsubscribe;
  /** Plays the reward's sound right away on the chosen output (marked as a test in the log). */
  test(rewardId: string): Promise<void>;
  /** A sound on the audio device, for the user's own ears (never on the stream). */
  preview(name: string): Promise<void>;
  /** The user picks sound files; they are copied into the module's sounds folder. */
  pickSounds(): Promise<PickSoundsResult>;
  removeSound(name: string): Promise<void>;
  openSoundsFolder(): Promise<void>;
}
