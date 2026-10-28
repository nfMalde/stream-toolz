// What the voice says for a message: emotes and emoji left out, links as a word, repeats shortened,
// long messages cut at a word. Pure functions, tested in test/text.test.ts.

import type { LinkHandling } from '../settings';
import type { ChatMessage } from './message';

export interface SpokenMessage {
  text: string;
  /** Only emotes (or emoji) and nothing to read. */
  emoteOnly: boolean;
  hasLink: boolean;
}

export interface TextOptions {
  links: LinkHandling;
  /** Said for a link ("Link"). */
  linkWord: string;
  collapseRepeats: boolean;
  maxLength: number;
  cleanNames: boolean;
  /** Login name → how the person is called (mentions use it too). */
  nicknames: Record<string, string>;
  /** Word (lower case) → how it is said. */
  pronunciations: Record<string, string>;
}

/** Top-level domains that make "word.tld" a link even without "http" or "www" (typos like "ok.wie" stay text). */
const TLDS = 'com|de|tv|net|org|io|gg|ly|me|co|uk|at|ch|eu|info|app|dev|xyz|link|shop|live|stream|to|be|fm|so|ai|gl';
const LINK = new RegExp(String.raw`(?:https?:\/\/\S+|www\.\S+|\b[\w-]+(?:\.[\w-]+)*\.(?:${TLDS})\b(?:\/\S*)?)`, 'gi');
/** Emoji, their joiners, skin tones and variation selectors. */
const EMOJI = /[\p{Extended_Pictographic}\u{1F3FB}-\u{1F3FF}\u{FE0F}\u{200D}\u{20E3}]/gu;
/** Invisible and control characters (control, zero-width and bidi marks, line separators). */
const INVISIBLE = /[\p{Cc}\p{Cf}\p{Zl}\p{Zp}]/gu;
/** More than two combining marks on a letter ("Zalgo" text). */
const ZALGO = /(\p{M}{2})\p{M}+/gu;

export function spokenMessage(message: ChatMessage, options: TextOptions): SpokenMessage {
  let emotes = 0;
  const parts: string[] = [];
  for (const fragment of message.fragments) {
    if (fragment.kind === 'text') parts.push(fragment.text);
    else if (fragment.kind === 'mention') {
      const login = fragment.text.replace(/^@/, '');
      parts.push(` ${options.nicknames[login.toLowerCase()] ?? spokenName(login, '', options.cleanNames)} `);
    }
    else emotes++;
  }

  let text = parts.join('').replace(INVISIBLE, ' ').replace(ZALGO, '$1');
  const withoutEmoji = text.replace(EMOJI, ' ');
  if (withoutEmoji !== text) emotes++;
  text = withoutEmoji;

  let hasLink = false;
  text = text.replace(LINK, () => {
    hasLink = true;
    return options.links === 'word' ? ` ${options.linkWord} ` : ' ';
  });

  if (options.collapseRepeats) text = collapseRepeats(text);
  text = pronounce(text.replace(/\s+/g, ' ').trim(), options.pronunciations);
  // Nothing but punctuation left ("!!!", "?") is nothing to read.
  if (!/[\p{L}\p{N}]/u.test(text)) text = '';
  return { text: shorten(text, options.maxLength), emoteOnly: !text && emotes > 0, hasLink };
}

/**
 * Words said the way the streamer wants ("gg" → "good game", "o7" → "Salut"): whole words in any case,
 * punctuation around them stays ("gg!" → "good game!").
 */
export function pronounce(text: string, pronunciations: Record<string, string>): string {
  if (!Object.keys(pronunciations).length) return text;
  return text.replace(/\S+/gu, (token) => {
    const exact = pronunciations[token.toLowerCase()];
    if (exact !== undefined) return exact;
    const parts = /^([("'„“‚]*)(.+?)([)"'“”‘’.,!?;:…]*)$/u.exec(token);
    const spoken = parts ? pronunciations[parts[2]!.toLowerCase()] : undefined;
    return spoken !== undefined ? `${parts![1]}${spoken}${parts![3]}` : token;
  });
}

/** "aaaaaaa" → "aaa", "!!!!!!" → "!!!", "lol lol lol lol" → "lol lol lol". Digits stay: "1000000" is a number. */
export function collapseRepeats(text: string): string {
  return text.replace(/(\P{N})\1{3,}/gu, '$1$1$1').replace(/(\S+)((?:\s+\1){2})(?:\s+\1)+/giu, '$1$2');
}

/** Cut at a word before maxLength; a cut text ends with an ellipsis, which the voices read as a pause. */
export function shorten(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  const cut = text.slice(0, maxLength);
  const space = cut.lastIndexOf(' ');
  return `${(space > maxLength * 0.6 ? cut.slice(0, space) : cut).replace(/[\s,;:]+$/, '')} …`;
}

/** Letters that the voices can read; names in other scripts fall back to the login name. */
const READABLE_NAME = /^[\p{Script=Latin}\p{N}_\s.-]+$/u;

/**
 * A name as the voice should say it. Display names in other scripts use the login. With cleaning:
 * "Gamer_Max_1234" → "Gamer Max", "MaldoeTV" → "Maldoe TV" (a number alone stays).
 */
export function spokenName(name: string, login: string, clean: boolean): string {
  let spoken = READABLE_NAME.test(name) || !login ? name : login;
  if (!clean) return spoken;
  const withoutDigits = spoken.replace(/[_\d]+$/, '');
  if (/\p{L}{2,}/u.test(withoutDigits)) spoken = withoutDigits;
  spoken = spoken
    .replace(/[_.]+/g, ' ')
    .replace(/(\p{Ll})(\p{Lu})/gu, '$1 $2')
    .replace(/\s+/g, ' ')
    .trim();
  return spoken || name;
}
