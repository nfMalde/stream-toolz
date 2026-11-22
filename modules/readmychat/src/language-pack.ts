// Language packs: one JSON file per chat language with the words that give it away and the few texts the app
// itself speaks in it (the model is GT Toolz's docs/04-language-packs.md). Data only, no code, so a pack from
// someone else cannot execute anything. The check here is strict: a pack is either complete and valid, or it is
// skipped with a reason (decided 2026-10-30: a half-usable pack would read half the chat in the wrong words).
// No Node imports: the UI shares the types, and the file reading is in main/language-packs.ts.

import { CHANNEL_EVENT_KINDS, type ChannelEventKind } from '@stream-toolz/twitch/api';

export const LANGUAGE_PACK_FORMAT = 'stream-toolz-language-pack';

export interface SpokenTexts {
  /** Default template around a message: {name}, {message}. */
  says: string;
  /** Said instead of a link. */
  link: string;
  /** Name of the app's test messages. */
  testName: string;
  /** Test of the output (setup, settings). */
  outputTest: string;
  /** Voice preview. */
  preview: string;
  /** {name} of an anonymous gift. */
  anonymous: string;
  /** {tier}: a Prime sub, or the tier ({n} = 1, 2, 3). */
  prime: string;
  tier: string;
  /** Channel events: {name}, {count}, {months}, {recipient}, {tier}. */
  events: Record<ChannelEventKind, string>;
  /** The same with a count of one, where the words change. */
  eventsOne: Partial<Record<ChannelEventKind, string>>;
}

export interface LanguagePack {
  /** "de", "en", "pt-br": the key of the voice setting and what the queue shows. */
  id: string;
  /** Display name in the language itself ("Deutsch"). */
  name: string;
  /** BCP 47 ("de-DE"): the voice is chosen by it (packages/speech defaultVoiceId). */
  locale: string;
  /** Lower-case words typical of the language; a word in more than one loaded pack counts for none. */
  words: string[];
  /** Letters typical of the language ("äöüß"): a word containing one counts like a listed word. */
  letters: string;
  texts: SpokenTexts;
  /** Word (lower case) → how the voice says it; the streamer's own pronunciations win over these. */
  pronounce: Record<string, string>;
  /** Shipped with the app (de, en) or from the language-packs folder. */
  builtIn: boolean;
}

/** What the UI gets about a loaded pack (enough for the voice pickers and the events page). */
export type LanguagePackInfo = Pick<LanguagePack, 'id' | 'name' | 'locale' | 'texts' | 'builtIn'>;

/** Every plain text key with the placeholders it may use. */
const TEXT_KEYS: Record<Exclude<keyof SpokenTexts, 'events' | 'eventsOne'>, readonly string[]> = {
  says: ['name', 'message'],
  link: [],
  testName: [],
  outputTest: [],
  preview: [],
  anonymous: [],
  prime: [],
  tier: ['n'],
};
export const EVENT_PLACEHOLDERS: readonly string[] = ['name', 'count', 'months', 'recipient', 'tier'];

export const MAX_TEXT_LENGTH = 500;
export const MAX_WORDS = 2000;
const MAX_PRONOUNCE = 200;
/** "de", "pt-br": lower case, so the voice setting's key and a file name never differ by case. */
export const PACK_ID = /^[a-z]{2,3}(-[a-z0-9]{2,8})?$/;
/** BCP 47-ish: a language and up to three subtags ("de-DE", "zh-Hant-TW"). */
const LOCALE = /^[A-Za-z]{2,3}(-[A-Za-z0-9]{2,8}){0,3}$/;
/** One word for detection: letters (with marks) and apostrophes. */
const WORD = /^[\p{L}\p{M}']{1,40}$/u;
const PRONOUNCE_WORD = /^[\p{L}\p{M}\p{N}'-]{1,40}$/u;

export type PackValidation = { pack: LanguagePack; error?: undefined } | { pack?: undefined; error: string };

const isObject = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);

/** A text with only the placeholders meant for its key; the reason if not. */
function textError(key: string, value: unknown, allowed: readonly string[]): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return `"${key}" must be a text`;
  if (value.length > MAX_TEXT_LENGTH) return `"${key}" is longer than ${MAX_TEXT_LENGTH} characters`;
  if (/\p{Cc}/u.test(value)) return `"${key}" contains control characters`;
  const unknown = [...value.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!).filter((name) => !allowed.includes(name));
  if (unknown.length) return `"${key}" uses unknown placeholder(s) ${unknown.map((u) => `{${u}}`).join(', ')}`;
  return undefined;
}

/** Checks a parsed JSON value. Never throws: a usable pack, or why the file is not one. */
export function validateLanguagePack(value: unknown, builtIn = false): PackValidation {
  if (!isObject(value)) return { error: 'not a JSON object' };
  if (value['format'] !== LANGUAGE_PACK_FORMAT) return { error: `"format" must be "${LANGUAGE_PACK_FORMAT}"` };
  if (value['version'] !== 1) return { error: `unsupported version ${String(value['version'])}` };
  const id = value['id'];
  if (typeof id !== 'string' || !PACK_ID.test(id)) return { error: '"id" must be a language code like "de", "en" or "pt-br" (lower case)' };
  const name = value['name'];
  if (typeof name !== 'string' || !name.trim() || name.length > 60 || /\p{Cc}/u.test(name)) return { error: '"name" must be a short text' };
  const locale = value['locale'];
  if (typeof locale !== 'string' || !LOCALE.test(locale)) return { error: '"locale" must be a BCP 47 tag like "de-DE"' };

  const words = value['words'];
  if (!Array.isArray(words)) return { error: '"words" must be a list of words' };
  if (words.length > MAX_WORDS) return { error: `"words" has more than ${MAX_WORDS} entries` };
  for (const word of words) {
    if (typeof word !== 'string' || !WORD.test(word)) return { error: `"words": ${JSON.stringify(word).slice(0, 40)} is not a word` };
    if (word !== word.toLowerCase()) return { error: `"words": "${word}" must be lower case` };
  }

  let letters = '';
  if (value['letters'] !== undefined) {
    if (typeof value['letters'] !== 'string' || !/^[\p{L}\p{M}]{0,40}$/u.test(value['letters'])) return { error: '"letters" must be a string of letters' };
    letters = value['letters'].toLowerCase();
  }

  const texts = value['texts'];
  if (!isObject(texts)) return { error: '"texts" is missing' };
  const clean: Partial<SpokenTexts> = {};
  for (const [key, allowed] of Object.entries(TEXT_KEYS) as [keyof typeof TEXT_KEYS, readonly string[]][]) {
    const error = textError(`texts.${key}`, texts[key], allowed);
    if (error) return { error };
    clean[key] = texts[key] as string;
  }
  const events = texts['events'];
  if (!isObject(events)) return { error: '"texts.events" is missing' };
  const cleanEvents: Partial<Record<ChannelEventKind, string>> = {};
  for (const kind of CHANNEL_EVENT_KINDS) {
    const error = textError(`texts.events.${kind}`, events[kind], EVENT_PLACEHOLDERS);
    if (error) return { error };
    cleanEvents[kind] = events[kind] as string;
  }
  const eventsOne: Partial<Record<ChannelEventKind, string>> = {};
  if (texts['eventsOne'] !== undefined) {
    const given = texts['eventsOne'];
    if (!isObject(given)) return { error: '"texts.eventsOne" must be an object' };
    for (const [kind, text] of Object.entries(given)) {
      if (!CHANNEL_EVENT_KINDS.includes(kind as ChannelEventKind)) return { error: `"texts.eventsOne.${kind}" is not an event` };
      const error = textError(`texts.eventsOne.${kind}`, text, EVENT_PLACEHOLDERS);
      if (error) return { error };
      eventsOne[kind as ChannelEventKind] = text as string;
    }
  }
  for (const key of Object.keys(texts)) {
    if (!(key in TEXT_KEYS) && key !== 'events' && key !== 'eventsOne') return { error: `unknown text "${key}"` };
  }

  const pronounce: Record<string, string> = {};
  if (value['pronounce'] !== undefined) {
    const given = value['pronounce'];
    if (!isObject(given)) return { error: '"pronounce" must be an object: word → spoken spelling' };
    const entries = Object.entries(given);
    if (entries.length > MAX_PRONOUNCE) return { error: `"pronounce" has more than ${MAX_PRONOUNCE} entries` };
    for (const [word, spoken] of entries) {
      if (!PRONOUNCE_WORD.test(word) || typeof spoken !== 'string' || !spoken.trim() || spoken.length > 60 || /\p{Cc}/u.test(spoken)) {
        return { error: `"pronounce": "${word.slice(0, 40)}" must be one word with a spoken spelling` };
      }
      pronounce[word.toLowerCase()] = spoken.trim();
    }
  }

  return {
    pack: {
      id,
      name: name.trim(),
      locale,
      words: [...new Set(words as string[])],
      letters,
      texts: { ...(clean as Omit<SpokenTexts, 'events' | 'eventsOne'>), events: cleanEvents as Record<ChannelEventKind, string>, eventsOne },
      pronounce,
      builtIn,
    },
  };
}

/** The primary language subtag of a locale or pack id: "de-DE" → "de", "pt-br" → "pt". */
export function primaryLanguage(tag: string): string {
  return tag.split('-')[0]!.toLowerCase();
}

/**
 * The pack for a locale or pack id: the id itself, the exact locale, then the same language ("de-AT" → de).
 * Undefined when none fits.
 */
export function packFor<P extends Pick<LanguagePack, 'id' | 'locale'>>(languageOrLocale: string, packs: readonly P[]): P | undefined {
  const wanted = languageOrLocale.toLowerCase();
  if (!wanted) return undefined;
  return (
    packs.find((p) => p.id === wanted) ??
    packs.find((p) => p.locale.toLowerCase() === wanted) ??
    packs.find((p) => primaryLanguage(p.locale) === primaryLanguage(wanted) || primaryLanguage(p.id) === primaryLanguage(wanted))
  );
}

/** The pack that reads when nothing fits a language: English, else the first one loaded. */
export function fallbackPack<P extends Pick<LanguagePack, 'id' | 'locale'>>(packs: readonly P[]): P | undefined {
  return packs.find((p) => p.id === 'en') ?? packs[0];
}

/** What the UI gets about a pack. */
export function packInfo(pack: LanguagePack): LanguagePackInfo {
  return { id: pack.id, name: pack.name, locale: pack.locale, texts: pack.texts, builtIn: pack.builtIn };
}
