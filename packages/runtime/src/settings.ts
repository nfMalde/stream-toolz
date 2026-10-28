// Every setting with its default in one place (DEFAULT_SETTINGS), and the check that turns untrusted input
// (the UI, an old or hand-edited config.json) into complete, valid settings. No Node imports: the UI uses the types.

import { CHANNEL_EVENT_KINDS, EVENT_GROUPS, type ChannelEventKind, type EventGroup } from './chat/event-kind';
import { CHAT_LANGUAGES, languageOf, type ChatLanguage } from './chat/language';

export type OutputMode = 'device' | 'obs';
/** always: every message; changed: only when someone else wrote before (or after a while); never. */
export type ReadNames = 'always' | 'changed' | 'never';
/** Who is read: everyone, subscribers/VIPs/mods (and the broadcaster), or only a channel points reward. */
export type Audience = 'all' | 'privileged' | 'reward';
/** A link: said as "Link", the whole message skipped, or left out. */
export type LinkHandling = 'word' | 'skip-message' | 'remove';

export interface Settings {
  /** App language ("de", "en"). */
  language: string;
  streamerMode: boolean;

  /** Login name of the channel to read; empty: the logged-in account's own channel. */
  channel: string;

  output: OutputMode;
  /** Audio device for output 'device' ('' = the system's default). */
  deviceId: string;
  /** 0..100. */
  volume: number;

  /** The voice per language ('' = picked automatically). Without a voice for a language, the main language's reads. */
  voices: Record<ChatLanguage, string>;
  /** The chat's main language ("de-DE", "en-US"): for messages whose language is unclear, and when detection is off. */
  speechLanguage: string;
  /** Each message is read in its own language (German or English), with that language's voice and words. */
  detectLanguage: boolean;
  /** -10 (slow) .. 10 (fast). */
  rate: number;
  /** Seconds of silence after a comma and after a sentence inside a message. */
  commaPause: number;
  sentencePause: number;
  /** Seconds of silence between two messages. */
  pauseBetween: number;

  readNames: ReadNames;
  /** With 'changed': the name is said again after this many seconds of quiet. */
  nameRepeatSeconds: number;
  /** "{name}" and "{message}"; empty: the language's default ("{name} sagt: {message}"). */
  template: string;
  /** Longer messages are cut after this many characters (at a word). */
  maxLength: number;
  /** More waiting messages than this: the oldest are dropped. */
  maxQueue: number;
  /** Seconds a message waits before it is read, so moderators can delete it first. */
  modDelay: number;

  audience: Audience;
  /** The channel points reward whose messages are read (audience 'reward'). */
  rewardId: string;
  /** The logged-in account's own messages. */
  readOwn: boolean;
  /** Messages starting with "!". */
  skipCommands: boolean;
  /** Login names never read (bots). */
  ignoredUsers: string[];
  links: LinkHandling;
  /** The same text again within this many seconds is skipped; 0 = off. */
  duplicateSeconds: number;
  /** At most this many messages per person and minute; 0 = no limit. */
  userLimit: number;
  /** A message containing one of these words is skipped. */
  blockedWords: string[];
  /** "aaaaaaa" → "aaa", "lol lol lol lol lol" → "lol lol lol". */
  collapseRepeats: boolean;
  /** Names read as words: "Gamer_Max_1234" → "Gamer Max". */
  cleanNames: boolean;
  /** In a shared chat session: also messages written in the other channels. */
  sharedChat: boolean;

  /** How a person is called (login name → spoken name), e.g. "xx_dark_lord_xx" → "Lord". */
  nicknames: Record<string, string>;
  /** How a word is said (whole words, any case), e.g. "gg" → "good game". */
  pronunciations: Record<string, string>;

  /** Channel events read aloud, before the chat: follows, subs (Prime too), gifted subs, raids. */
  events: Record<EventGroup, boolean>;
  /** Own words per event ('' = the main language's default): {name}, {count}, {months}, {recipient}, {tier}. */
  eventTexts: Record<ChannelEventKind, string>;

  /** System-wide shortcuts (Electron accelerators, '' = off); they also work while a game has the focus. */
  hotkeys: Record<HotkeyAction, string>;

  /** Local port for the OBS browser source. */
  serverPort: number;
}

export type HotkeyAction = 'pause' | 'skip' | 'clear';
export const HOTKEY_ACTIONS: readonly HotkeyAction[] = ['pause', 'skip', 'clear'];

/** Bots that post a lot and are not meant to be read. The user can change the list. */
export const DEFAULT_IGNORED_USERS = [
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

export const DEFAULT_SERVER_PORT = 47391;

export const DEFAULT_SETTINGS: Settings = {
  language: 'de',
  streamerMode: false,
  channel: '',
  output: 'device',
  deviceId: '',
  volume: 80,
  voices: { de: '', en: '' },
  speechLanguage: 'de-DE',
  detectLanguage: true,
  rate: 0,
  commaPause: 0.35,
  sentencePause: 0.5,
  pauseBetween: 1,
  // Every message with its writer's name (the user, 2026-10-22: "soll immer den Namen mit vorlesen").
  readNames: 'always',
  nameRepeatSeconds: 30,
  template: '',
  maxLength: 200,
  maxQueue: 15,
  modDelay: 0,
  audience: 'all',
  rewardId: '',
  readOwn: true,
  skipCommands: true,
  ignoredUsers: DEFAULT_IGNORED_USERS,
  links: 'word',
  duplicateSeconds: 30,
  userLimit: 6,
  blockedWords: [],
  collapseRepeats: true,
  cleanNames: true,
  sharedChat: false,
  nicknames: {},
  pronunciations: {},
  events: { follow: true, sub: true, gift: true, raid: true },
  eventTexts: { follow: '', sub: '', prime: '', resub: '', gift: '', communityGift: '', raid: '' },
  // Unusual combinations, so no game loses its keys; "clear" is off (it throws messages away).
  hotkeys: { pause: 'Control+Shift+F9', skip: 'Control+Shift+F10', clear: '' },
  serverPort: DEFAULT_SERVER_PORT,
};

/** First start: the app and the chat in the system's language (German or English). */
export function defaultSettings(locale: string): Settings {
  const german = locale.toLowerCase().startsWith('de');
  return { ...DEFAULT_SETTINGS, language: german ? 'de' : 'en', speechLanguage: german ? 'de-DE' : 'en-US' };
}

const LANGUAGE = /^[a-z]{2}$/;
const SPEECH_LANGUAGE = /^[a-z]{2}-[A-Z]{2}$/;
/** Twitch login names: 4 to 25 letters, digits and underscores (older accounts may be shorter). */
const LOGIN = /^[a-z0-9_]{1,25}$/;
/** A channel points reward id (a UUID). */
const REWARD_ID = /^[0-9a-f-]{1,64}$/;
/** Chromium's audio device ids: 64 hex characters, or 'default'/'communications'. */
const DEVICE_ID = /^[\w-]{1,128}$/;
const MAX_LIST = 200;

function clamp(value: unknown, min: number, max: number, fallback: number, step = 0): number {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  const clamped = Math.min(max, Math.max(min, n));
  return step ? Math.round(clamped / step) * step : clamped;
}

function bool(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function oneOf<T extends string>(value: unknown, options: readonly T[], fallback: T): T {
  return options.includes(value as T) ? (value as T) : fallback;
}

function text(value: unknown, pattern: RegExp, fallback: string, allowEmpty = true): string {
  if (typeof value !== 'string') return fallback;
  const v = value.trim();
  if (v === '') return allowEmpty ? '' : fallback;
  return pattern.test(v) ? v : fallback;
}

/** A login name as typed ("@Name", "twitch.tv/name"): lower case, without the extras. */
export function cleanLogin(value: string): string {
  return value
    .trim()
    .replace(/^(https?:\/\/)?(www\.)?twitch\.tv\//i, '')
    .replace(/^@/, '')
    .replace(/\/.*$/, '')
    .toLowerCase();
}

/** A list of words or names: trimmed, lower case, no duplicates, no empty entries. */
function wordList(value: unknown, fallback: string[], clean: (v: string) => string, pattern: RegExp): string[] {
  if (!Array.isArray(value)) return fallback;
  const list = value.filter((v): v is string => typeof v === 'string').map(clean).filter((v) => v && pattern.test(v));
  return [...new Set(list)].slice(0, MAX_LIST);
}

/** A template must contain the message; the name is optional. Control characters are removed. */
function template(value: unknown, fallback: string): string {
  if (typeof value !== 'string') return fallback;
  const v = value.replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, 120);
  if (v === '') return '';
  return v.includes('{message}') ? v : fallback;
}

/** A lookup (nicknames, pronunciations): keys cleaned and unique, spoken values without control characters. */
function lookup(value: unknown, fallback: Record<string, string>, cleanKey: (k: string) => string, keyPattern: RegExp): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return fallback;
  const entries = Object.entries(value as Record<string, unknown>)
    .map(([k, v]) => [cleanKey(k), typeof v === 'string' ? v.replace(/\p{Cc}/gu, ' ').trim().slice(0, 60) : ''] as const)
    .filter(([k, v]) => k && v && keyPattern.test(k));
  return Object.fromEntries(entries.slice(0, MAX_LIST));
}

const KEY = String.raw`(?:F(?:[1-9]|1\d|2[0-4])|[A-Z0-9]|Space|Tab|Backspace|Delete|Insert|Enter|Up|Down|Left|Right|Home|End|PageUp|PageDown|num[0-9]|numadd|numsub|nummult|numdiv|numdec)`;
const ACCELERATOR = new RegExp(String.raw`^(?:(?:Control|Alt|Shift|Super)\+){0,4}${KEY}$`);
/** Keys that may be a shortcut on their own (function and number pad keys); others need a modifier, or typing would break. */
const ALONE = /^(?:F(?:[1-9]|1\d|2[0-4])|num\w+)$/;

/** An Electron accelerator the app accepts ("Control+Shift+F9", "F13", "Alt+num1"); '' = off. */
export function isValidHotkey(value: string): boolean {
  if (value === '') return true;
  if (!ACCELERATOR.test(value)) return false;
  const parts = value.split('+');
  return parts.length > 1 || ALONE.test(value);
}

function hotkeys(value: unknown, base: Settings['hotkeys']): Settings['hotkeys'] {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<Record<HotkeyAction, unknown>>) : {};
  const result = { ...base };
  for (const action of HOTKEY_ACTIONS) {
    const key = v[action];
    if (typeof key === 'string' && isValidHotkey(key)) result[action] = key;
  }
  return result;
}

function eventFlags(value: unknown, base: Settings['events']): Settings['events'] {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<Record<EventGroup, unknown>>) : {};
  return Object.fromEntries(EVENT_GROUPS.map((group) => [group, bool(v[group], base[group])])) as Settings['events'];
}

/** Own event texts: one line each, without control characters. */
function eventTexts(value: unknown, base: Settings['eventTexts']): Settings['eventTexts'] {
  const v = value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<Record<ChannelEventKind, unknown>>) : {};
  const clean = (kind: ChannelEventKind) => {
    const given = v[kind];
    return typeof given === 'string' ? given.replace(/\p{Cc}/gu, ' ').trim().slice(0, 160) : base[kind];
  };
  return Object.fromEntries(CHANNEL_EVENT_KINDS.map((kind) => [kind, clean(kind)])) as Settings['eventTexts'];
}

const isVoiceId = (id: unknown): id is string => typeof id === 'string' && id.length <= 120 && !/[|\r\n]/.test(id);

/** The voice per language. A config from before (one `voiceId`) gives that voice to its main language. */
function voices(v: Partial<Record<keyof Settings | 'voiceId', unknown>>, base: Settings): Settings['voices'] {
  const result = { ...base.voices };
  const given = v.voices && typeof v.voices === 'object' && !Array.isArray(v.voices) ? (v.voices as Partial<Record<ChatLanguage, unknown>>) : undefined;
  if (given) {
    for (const language of CHAT_LANGUAGES) {
      const id = given[language];
      if (isVoiceId(id)) result[language] = id;
    }
  } else if (isVoiceId(v.voiceId)) {
    result[languageOf(typeof v.speechLanguage === 'string' ? v.speechLanguage : base.speechLanguage)] = v.voiceId;
  }
  return result;
}

export function normalizeSettings(value: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const v: Partial<Record<keyof Settings, unknown>> = value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  return {
    language: text(v.language, LANGUAGE, base.language, false),
    streamerMode: bool(v.streamerMode, base.streamerMode),
    channel: typeof v.channel === 'string' ? text(cleanLogin(v.channel), LOGIN, base.channel) : base.channel,
    output: oneOf(v.output, ['device', 'obs'] as const, base.output),
    deviceId: text(v.deviceId, DEVICE_ID, base.deviceId),
    volume: clamp(v.volume, 0, 100, base.volume, 1),
    voices: voices(v, base),
    speechLanguage: text(v.speechLanguage, SPEECH_LANGUAGE, base.speechLanguage, false),
    detectLanguage: bool(v.detectLanguage, base.detectLanguage),
    rate: clamp(v.rate, -10, 10, base.rate, 1),
    commaPause: clamp(v.commaPause, 0, 2, base.commaPause, 0.05),
    sentencePause: clamp(v.sentencePause, 0, 2, base.sentencePause, 0.05),
    pauseBetween: clamp(v.pauseBetween, 0, 10, base.pauseBetween, 0.1),
    readNames: oneOf(v.readNames, ['always', 'changed', 'never'] as const, base.readNames),
    nameRepeatSeconds: clamp(v.nameRepeatSeconds, 0, 600, base.nameRepeatSeconds, 1),
    template: template(v.template, base.template),
    maxLength: clamp(v.maxLength, 20, 500, base.maxLength, 1),
    maxQueue: clamp(v.maxQueue, 1, 100, base.maxQueue, 1),
    modDelay: clamp(v.modDelay, 0, 30, base.modDelay, 0.5),
    audience: oneOf(v.audience, ['all', 'privileged', 'reward'] as const, base.audience),
    rewardId: text(v.rewardId, REWARD_ID, base.rewardId),
    readOwn: bool(v.readOwn, base.readOwn),
    skipCommands: bool(v.skipCommands, base.skipCommands),
    ignoredUsers: wordList(v.ignoredUsers, base.ignoredUsers, cleanLogin, LOGIN),
    links: oneOf(v.links, ['word', 'skip-message', 'remove'] as const, base.links),
    duplicateSeconds: clamp(v.duplicateSeconds, 0, 600, base.duplicateSeconds, 1),
    userLimit: clamp(v.userLimit, 0, 60, base.userLimit, 1),
    blockedWords: wordList(v.blockedWords, base.blockedWords, (w) => w.trim().toLowerCase().slice(0, 60), /\S/),
    collapseRepeats: bool(v.collapseRepeats, base.collapseRepeats),
    cleanNames: bool(v.cleanNames, base.cleanNames),
    sharedChat: bool(v.sharedChat, base.sharedChat),
    nicknames: lookup(v.nicknames, base.nicknames, cleanLogin, LOGIN),
    pronunciations: lookup(v.pronunciations, base.pronunciations, (w) => w.trim().toLowerCase().slice(0, 40), /^[^\s=]+$/u),
    events: eventFlags(v.events, base.events),
    eventTexts: eventTexts(v.eventTexts, base.eventTexts),
    hotkeys: hotkeys(v.hotkeys, base.hotkeys),
    serverPort: clamp(v.serverPort, 1024, 65535, base.serverPort, 1),
  };
}
