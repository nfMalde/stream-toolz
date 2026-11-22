// Alerts's settings, with their defaults and the check that turns untrusted input (the UI, an old or hand-edited
// config.json) into complete, valid settings. No Node imports: the UI shares this file.

import { bool, clamp, oneOf, text } from '@stream-toolz/core/normalize';
import { CHANNEL_EVENT_KINDS, type ChannelEventKind } from '@stream-toolz/twitch/api';

export type FontFamily = 'sans' | 'mono' | 'serif' | 'rounded';
export type Position = 'top' | 'center' | 'bottom';
export type Animation = 'fade' | 'slide' | 'pop';

export const FONT_FAMILIES: readonly FontFamily[] = ['sans', 'mono', 'serif', 'rounded'];
export const POSITIONS: readonly Position[] = ['top', 'center', 'bottom'];
export const ANIMATIONS: readonly Animation[] = ['fade', 'slide', 'pop'];

/** One kind of event on the overlay. */
export interface EventAlert {
  enabled: boolean;
  /** Own words ('' = the app language's default): {name}, {count}, {months}, {recipient}, {tier}. */
  text: string;
  /** A file name inside the module's sounds folder ('' = no sound); never a path. */
  sound: string;
  /** How long the alert stays on screen. */
  durationSeconds: number;
  /** 0..100, the sound's volume on the page and on the device. */
  volume: number;
}

export interface Style {
  /** Pixels. */
  fontSize: number;
  fontFamily: FontFamily;
  textColor: string;
  accentColor: string;
  /** Behind the alert box; 'transparent' for none. */
  background: string;
  position: Position;
  animation: Animation;
  /** The text a resub came with, below the alert. */
  showMessage: boolean;
}

export interface Settings {
  events: Record<ChannelEventKind, EventAlert>;
  /** More follows than this within a minute are shown as one line ("… und 3 weitere"); 0 = no limit. */
  followLimitPerMinute: number;
  /** Raids with fewer viewers are not shown. */
  minRaidViewers: number;
  style: Style;
  /** The sound also plays on an audio device, for the streamer's own ears. */
  deviceOutput: boolean;
  /** That device ('' = the system's default). */
  deviceId: string;
}

export const DEFAULT_EVENT_ALERT: EventAlert = { enabled: true, text: '', sound: '', durationSeconds: 8, volume: 80 };

export const DEFAULT_SETTINGS: Settings = {
  events: Object.fromEntries(CHANNEL_EVENT_KINDS.map((kind) => [kind, { ...DEFAULT_EVENT_ALERT }])) as Settings['events'],
  followLimitPerMinute: 5,
  minRaidViewers: 0,
  // Maldö's colours: orange on espresso, slightly see-through so the stream shows beneath.
  style: { fontSize: 40, fontFamily: 'sans', textColor: '#ffffff', accentColor: '#ff730f', background: '#0d0a07cc', position: 'top', animation: 'pop', showMessage: true },
  deviceOutput: false,
  deviceId: '',
};

/** Defaults for a first start (locale: the system's, e.g. "de-DE"); the texts follow the app language at run time. */
export function defaultSettings(_locale: string): Settings {
  return normalizeSettings({}, DEFAULT_SETTINGS);
}

/** A sound's file name: letters, digits, dot, dash, underscore; no path parts (checked again in the module). */
export const SOUND_NAME = /^[\w.-]{1,120}$/;
/** Hex colours (#rgb, #rrggbb, #rrggbbaa) or none. */
const COLOR = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
/** Chromium's audio device ids: 64 hex characters, or 'default'/'communications'. */
const DEVICE_ID = /^[\w-]{1,128}$/;

export function isSoundName(value: unknown): value is string {
  return typeof value === 'string' && SOUND_NAME.test(value) && value !== '.' && value !== '..';
}

function soundName(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  if (value === '') return '';
  return isSoundName(value) ? value : fallback;
}

function color(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (v === 'transparent') return v;
  return COLOR.test(v) ? v.toLowerCase() : fallback;
}

function eventAlert(value: unknown, base: EventAlert): EventAlert {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<Record<keyof EventAlert, unknown>>) : {};
  return {
    enabled: bool(v.enabled, base.enabled),
    // One line, without control characters.
    text: typeof v.text === 'string' ? v.text.replace(/\p{Cc}/gu, ' ').trim().slice(0, 160) : base.text,
    sound: soundName(v.sound, base.sound),
    durationSeconds: clamp(v.durationSeconds, 2, 60, base.durationSeconds, 1),
    volume: clamp(v.volume, 0, 100, base.volume, 1),
  };
}

function events(value: unknown, base: Settings['events']): Settings['events'] {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<Record<ChannelEventKind, unknown>>) : {};
  return Object.fromEntries(CHANNEL_EVENT_KINDS.map((kind) => [kind, eventAlert(v[kind], base[kind] ?? DEFAULT_EVENT_ALERT)])) as Settings['events'];
}

function style(value: unknown, base: Style): Style {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<Record<keyof Style, unknown>>) : {};
  return {
    fontSize: clamp(v.fontSize, 16, 120, base.fontSize, 1),
    fontFamily: oneOf(v.fontFamily, FONT_FAMILIES, base.fontFamily),
    textColor: color(v.textColor, base.textColor),
    accentColor: color(v.accentColor, base.accentColor),
    background: color(v.background, base.background),
    position: oneOf(v.position, POSITIONS, base.position),
    animation: oneOf(v.animation, ANIMATIONS, base.animation),
    showMessage: bool(v.showMessage, base.showMessage),
  };
}

/** Complete, valid settings: what is missing or invalid keeps its value from base. */
export function normalizeSettings(value: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const v: Partial<Record<keyof Settings, unknown>> = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    events: events(v.events, base.events),
    followLimitPerMinute: clamp(v.followLimitPerMinute, 0, 60, base.followLimitPerMinute, 1),
    minRaidViewers: clamp(v.minRaidViewers, 0, 10_000, base.minRaidViewers, 1),
    style: style(v.style, base.style),
    deviceOutput: bool(v.deviceOutput, base.deviceOutput),
    deviceId: text(v.deviceId, DEVICE_ID, base.deviceId),
  };
}
