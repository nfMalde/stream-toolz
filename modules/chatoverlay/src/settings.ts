// Chat Overlay's settings, with their defaults and the check that turns untrusted input (the UI, an old or hand-edited
// config.json) into complete, valid settings. No Node imports: the UI shares this file.

import { bool, clamp, oneOf, wordList } from '@stream-toolz/core/normalize';
import { cleanLogin, LOGIN_NAME } from '@stream-toolz/twitch/api';

/** Fonts the overlay can use: families every Windows/macOS install has; the page downloads nothing. */
export type FontFamily = 'sans' | 'mono' | 'serif' | 'rounded';
export const FONT_FAMILIES: readonly FontFamily[] = ['sans', 'mono', 'serif', 'rounded'];
/** Each chatter's own Twitch colour, or one colour for every name. */
export type NameColors = 'twitch' | 'single';
/** Emotes as their text, or as pictures (OBS's browser loads them from Twitch's CDN). */
export type EmoteMode = 'text' | 'images';
/** up: the newest message at the bottom, older ones move up (like Twitch); down: the newest at the top. */
export type Direction = 'up' | 'down';
export type Align = 'left' | 'right';

export interface Settings {
  /** Messages shown at most (1..50); older ones leave. */
  maxMessages: number;
  /** Seconds a message stays before it fades out; 0 = it stays until it is pushed out. */
  fadeSeconds: number;
  /** Pixels (12..64). */
  fontSize: number;
  fontFamily: FontFamily;
  /** The message text; a colour ("#f4ede6", "rgba(…)"). */
  textColor: string;
  /** Behind the whole overlay ("transparent" for the usual stream look). */
  background: string;
  nameColors: NameColors;
  /** The one colour for names ('single'), and the fallback for chatters without a Twitch colour. */
  nameColor: string;
  /** Small coloured tags for mods, VIPs, subscribers and the streamer (drawn in CSS, no badge images). */
  showBadges: boolean;
  emotes: EmoteMode;
  direction: Direction;
  align: Align;
  /** Width of the chat column in pixels (200..1920); OBS's browser source should be at least as wide. */
  width: number;
  /** Messages starting with "!" are not shown. */
  hideCommands: boolean;
  /** Login names never shown (bots). */
  hideBots: string[];
  /** Follows, subs and raids as one-line notices between the messages. */
  showEvents: boolean;
}

/**
 * Bots that post a lot and are not meant for the overlay. The same list as ReadMyChat's DEFAULT_IGNORED_USERS, copied
 * on purpose (a module does not import another module's settings, docs/04 "When a second module speaks").
 */
export const DEFAULT_HIDDEN_BOTS = [
  'nightbot',
  'streamelements',
  'streamlabs',
  'moobot',
  'fossabot',
  'wizebot',
  'botrixoficial',
  'sery_bot',
  'soundalerts',
  'kofistreambot',
  'blerp',
  'streamstickers',
  'pokemoncommunitygame',
];

export const DEFAULT_SETTINGS: Settings = {
  maxMessages: 12,
  fadeSeconds: 0,
  fontSize: 22,
  fontFamily: 'sans',
  textColor: '#ffffff',
  background: 'transparent',
  nameColors: 'twitch',
  nameColor: '#ff730f',
  showBadges: true,
  // Pictures would make OBS fetch them from Twitch's CDN: the streamer switches that on knowingly.
  emotes: 'text',
  direction: 'up',
  align: 'left',
  width: 600,
  hideCommands: true,
  hideBots: DEFAULT_HIDDEN_BOTS,
  showEvents: true,
};

/** Defaults for a first start (locale: the system's, e.g. "de-DE"); nothing here depends on it. */
export function defaultSettings(_locale: string): Settings {
  return { ...DEFAULT_SETTINGS };
}

/**
 * A colour as the page may use it: "#rgb", "#rgba", "#rrggbb", "#rrggbbaa", "rgb(r, g, b)", "rgba(r, g, b, a)" or
 * "transparent". Nothing else, so the value can never carry anything but a colour into the page's styles.
 */
export const COLOR = /^(?:#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})|transparent|rgba?\(\s*\d{1,3}\s*,\s*\d{1,3}\s*,\s*\d{1,3}\s*(?:,\s*(?:0|1|0?\.\d{1,3})\s*)?\))$/i;

export function isColor(value: unknown): value is string {
  return typeof value === 'string' && COLOR.test(value.trim());
}

function color(value: unknown, fallback: string): string {
  return isColor(value) ? value.trim().toLowerCase() : fallback;
}

/** Complete, valid settings: what is missing or invalid keeps its value from base. */
export function normalizeSettings(value: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const v: Partial<Record<keyof Settings, unknown>> = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    maxMessages: clamp(v.maxMessages, 1, 50, base.maxMessages, 1),
    fadeSeconds: clamp(v.fadeSeconds, 0, 600, base.fadeSeconds, 1),
    fontSize: clamp(v.fontSize, 12, 64, base.fontSize, 1),
    fontFamily: oneOf(v.fontFamily, FONT_FAMILIES, base.fontFamily),
    textColor: color(v.textColor, base.textColor),
    background: color(v.background, base.background),
    nameColors: oneOf(v.nameColors, ['twitch', 'single'] as const, base.nameColors),
    nameColor: color(v.nameColor, base.nameColor),
    showBadges: bool(v.showBadges, base.showBadges),
    emotes: oneOf(v.emotes, ['text', 'images'] as const, base.emotes),
    direction: oneOf(v.direction, ['up', 'down'] as const, base.direction),
    align: oneOf(v.align, ['left', 'right'] as const, base.align),
    width: clamp(v.width, 200, 1920, base.width, 1),
    hideCommands: bool(v.hideCommands, base.hideCommands),
    hideBots: wordList(v.hideBots, base.hideBots, cleanLogin, LOGIN_NAME),
    showEvents: bool(v.showEvents, base.showEvents),
  };
}
