// The Alerts part of the contract between the UI and the main process (window.stz.alerts): its settings, the
// overlay's address and sounds, what is on screen, the test and sound calls. Types only (plus a few constants),
// so the UI can import it without Node code.

import type { ModuleSettingsApi, Unsubscribe } from '@stream-toolz/core/api';
import type { ChannelEventKind } from '@stream-toolz/twitch/api';
import type { Settings } from './settings';

/** The module's id: its key in config.json, its IPC namespace, window.stz.alerts. */
export const ALERTS = 'alerts';

// Every name here is shared with the other modules' APIs in window.stz (export * in apps/desktop/src/bridge-api.ts):
// aliased with "Alert", so nothing clashes with a sibling's Settings or Style.
export type { Animation as AlertAnimation, EventAlert as AlertEventSettings, FontFamily as AlertFont, Position as AlertPosition, Settings as AlertsSettings, Style as AlertStyle } from './settings';
export { ANIMATIONS as ALERT_ANIMATIONS, FONT_FAMILIES as ALERT_FONTS, POSITIONS as ALERT_POSITIONS } from './settings';
export { defaultAlertText } from './texts';

/** An alert as the page shows it (and the UI's status). */
export interface Alert {
  id: string;
  kind: ChannelEventKind;
  /** The event's text with its placeholders filled. */
  title: string;
  /** A resub's message, or the "… and 3 more" of collapsed follows. */
  message?: string;
  /** A file name in the sounds folder. */
  sound?: string;
  durationMs: number;
  /** 0..1. */
  volume: number;
  test?: boolean;
}

export interface AlertsStatus {
  /** The page's address on the local server (with the key: hidden in streamer mode). */
  url: string;
  /** The sounds in the module's folder (file names). */
  sounds: string[];
  /** Alerts waiting behind the current one. */
  queued: number;
  current?: Alert;
  /** Overlay pages connected right now. */
  pages: number;
}

export interface AlertsApi extends ModuleSettingsApi<Settings> {
  status(): Promise<AlertsStatus>;
  onStatus(listener: (status: AlertsStatus) => void): Unsubscribe;
  /** Shows an example of the event with its current text and sound (also when the event is off). */
  test(kind: ChannelEventKind): Promise<void>;
  /** Drops the waiting alerts and the one on screen. */
  clear(): Promise<void>;
  /** The user picks sound files; they are copied into the module's folder. Returns the folder's sounds. */
  pickSounds(): Promise<string[]>;
  removeSound(name: string): Promise<string[]>;
  /** Plays a sound on the audio device, for the user's own ears (never on the stream). */
  preview(name: string): Promise<void>;
  copyUrl(): Promise<void>;
  openUrl(): Promise<void>;
}
