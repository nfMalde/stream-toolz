// The Countdown part of the contract between the UI and the main process (window.stz.countdown): its settings, the
// timers and their texts, the overlay address and the folder. Types only (plus a few constants and the pure timer
// arithmetic the UI counts down with), so the UI can import it without Node code.

import type { ModuleSettingsApi, Unsubscribe } from '@stream-toolz/core/api';
import type { Settings } from './settings';
import type { Timer } from './timer';

/** The module's id: its key in config.json, its IPC namespace, window.stz.countdown. */
export const COUNTDOWN = 'countdown';

export type { Settings as CountdownSettings, Align, FontFamily, Output } from './settings';
export type { Timer } from './timer';
export type { TimeFormat } from './format';
export type { CountdownLanguage, ParsedCountdown } from './parse';
/** Pure helpers the UI shares with the main process (these files have no Node imports). */
export { ALIGNS, FONT_FAMILIES, MAX_TIMERS, OUTPUTS } from './settings';
export { TIME_FORMATS, formatRemaining } from './format';
export { MINUTE_MS, isDone, isPaused, remainingMs } from './timer';
export { parseCountdown } from './parse';

export interface CountdownStatus {
  timers: Timer[];
  /** The text each timer shows right now, by id (the UI counts down by itself; this is what OBS shows). */
  texts: Record<string, string>;
  /** The overlay page (with the key: hide it in streamer mode). */
  url: string;
  /** Where the text files go. */
  folder: string;
  /** The folder could not be created: the files are not written. */
  folderError?: string;
  /** Overlay pages connected right now. */
  clients: number;
}

/** not-understood: the phrase made no sense; too-many: MAX_TIMERS are running. */
export type StartResult = Timer | { error: 'not-understood' | 'too-many' };

export interface CountdownApi extends ModuleSettingsApi<Settings> {
  /** Starts a timer from a phrase ("in 15 Minuten", "bis 20:30 Pause"). */
  start(phrase: string): Promise<StartResult>;
  pause(id: string): Promise<void>;
  resume(id: string): Promise<void>;
  /** Adds (or takes) milliseconds, never below zero. */
  adjust(id: string, deltaMs: number): Promise<void>;
  remove(id: string): Promise<void>;
  clear(): Promise<void>;
  status(): Promise<CountdownStatus>;
  /** On every change of the timers, the address or the folder (not on every second). */
  onStatus(listener: (status: CountdownStatus) => void): Unsubscribe;
  copyUrl(): Promise<void>;
  openUrl(): Promise<void>;
  /** The user picks the folder for the text files; it is saved as the setting. undefined when they cancel. */
  pickFolder(): Promise<string | undefined>;
  openFolder(): Promise<void>;
}
