// Countdown's settings, with their defaults and the check that turns untrusted input (the UI, an old or hand-edited
// config.json) into complete, valid settings. The timers live here too, so a countdown to 20:30 survives a
// restart. No Node imports: the UI shares this file.

import { bool, clamp, oneOf } from '@stream-toolz/core/normalize';
import { TIME_FORMATS, type TimeFormat } from './format';
import { MAX_LABEL } from './parse';
import type { Timer } from './timer';

/** Where the countdown shows: the browser source, a text file an OBS text source reads (OBS picks the font), or both. */
export type Output = 'overlay' | 'file' | 'both';
/** System font stacks: the overlay loads nothing from the internet. */
export type FontFamily = 'sans' | 'mono' | 'serif' | 'rounded';
export type Align = 'left' | 'center' | 'right';

export const OUTPUTS: readonly Output[] = ['overlay', 'file', 'both'];
export const FONT_FAMILIES: readonly FontFamily[] = ['sans', 'mono', 'serif', 'rounded'];
export const ALIGNS: readonly Align[] = ['left', 'center', 'right'];
/** More would not fit a stream; the text files are numbered up to this. */
export const MAX_TIMERS = 10;
export const MAX_DONE_TEXT = 100;

export interface Settings {
  /** Running and paused timers, oldest first (the overlay shows the newest on top). */
  timers: Timer[];
  output: Output;
  /** Where the text files go ('' = the module's data folder); an absolute path. */
  folder: string;
  format: TimeFormat;
  /** A text instead of 0:00 when a timer is done; off by default (the user, 2026-11-14: "Default: Aus"). */
  showDoneText: boolean;
  /** The text shown at zero while showDoneText is on ('' shows 0:00 anyway). */
  doneText: string;
  /** A done timer disappears after this many seconds; 0 = it stays until removed by hand (the default: the user, 2026-11-22). */
  doneSeconds: number;

  // --- The overlay's look ---
  fontSize: number;
  fontFamily: FontFamily;
  /** "#rrggbb". */
  color: string;
  align: Align;
  shadow: boolean;
  /** The label above the time. */
  showLabel: boolean;
  labelSize: number;
}

export const DEFAULT_SETTINGS: Settings = {
  timers: [],
  output: 'overlay',
  folder: '',
  format: 'auto',
  showDoneText: false,
  doneText: '',
  doneSeconds: 0,
  fontSize: 96,
  fontFamily: 'sans',
  color: '#ffffff',
  align: 'center',
  shadow: true,
  showLabel: true,
  labelSize: 36,
};

/** Defaults for a first start (the locale plays no part here). */
export function defaultSettings(_locale: string): Settings {
  return { ...DEFAULT_SETTINGS };
}

const TIMER_ID = /^[a-z0-9]{1,32}$/;
const HEX_COLOR = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/;
/** Windows ("C:\…", "\\server\share"), macOS and Linux ("/…"). */
const ABSOLUTE_PATH = /^(?:[A-Za-z]:[\\/]|\\\\[^\\/]+[\\/]|\/)/;

function color(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim().toLowerCase();
  if (!HEX_COLOR.test(v)) return fallback;
  return v.length === 4 ? `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}` : v;
}

function folder(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (v === '') return '';
  // No control characters (a file name cannot hold them) and nothing relative: every file stays below this folder.
  if (v.length > 1000 || /\p{Cc}/u.test(v) || !ABSOLUTE_PATH.test(v)) return fallback;
  return v;
}

export function cleanLabel(value: unknown): string {
  return typeof value === 'string' ? value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_LABEL) : '';
}

function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

/** A timer from the config: only with a plausible id and numbers; duplicates and anything beyond the limit are dropped. */
function timers(value: unknown, fallback: Timer[]): Timer[] {
  if (!Array.isArray(value)) return fallback;
  const result: Timer[] = [];
  const seen = new Set<string>();
  for (const entry of value) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    const t = entry as Partial<Record<keyof Timer, unknown>>;
    if (typeof t.id !== 'string' || !TIMER_ID.test(t.id) || seen.has(t.id)) continue;
    if (!finite(t.endsAt) || !finite(t.createdAt)) continue;
    if (t.pausedRemainingMs !== undefined && !finite(t.pausedRemainingMs)) continue;
    seen.add(t.id);
    const timer: Timer = { id: t.id, label: cleanLabel(t.label), endsAt: Math.round(t.endsAt), createdAt: Math.round(t.createdAt) };
    if (t.pausedRemainingMs !== undefined) timer.pausedRemainingMs = Math.round(t.pausedRemainingMs);
    result.push(timer);
    if (result.length >= MAX_TIMERS) break;
  }
  return result;
}

export function normalizeSettings(value: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const v: Partial<Record<keyof Settings, unknown>> = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    timers: timers(v.timers, base.timers),
    output: oneOf(v.output, OUTPUTS, base.output),
    folder: folder(v.folder, base.folder),
    format: oneOf(v.format, TIME_FORMATS, base.format),
    showDoneText: bool(v.showDoneText, base.showDoneText),
    doneText: typeof v.doneText === 'string' ? v.doneText.replace(/\p{Cc}/gu, ' ').trim().slice(0, MAX_DONE_TEXT) : base.doneText,
    doneSeconds: clamp(v.doneSeconds, 0, 600, base.doneSeconds, 1),
    fontSize: clamp(v.fontSize, 24, 400, base.fontSize, 1),
    fontFamily: oneOf(v.fontFamily, FONT_FAMILIES, base.fontFamily),
    color: color(v.color, base.color),
    align: oneOf(v.align, ALIGNS, base.align),
    shadow: bool(v.shadow, base.shadow),
    showLabel: bool(v.showLabel, base.showLabel),
    labelSize: clamp(v.labelSize, 12, 200, base.labelSize, 1),
  };
}
