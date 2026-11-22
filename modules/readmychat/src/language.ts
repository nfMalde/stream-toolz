// Which loaded language a chat message is in. A small, dependency-free guess from the words and letters each
// pack lists, English contractions, and the script a message is written in (Cyrillic, Greek, Japanese, …).
// Short or mixed messages ("gg", "lol", "nice") stay undecided: the chat's main language reads them.
// Until 2026-10-30 the German and English word lists were in this file; now every pack brings its own, so a
// new language is a JSON file, not code. Tested in test/language.test.ts.

import { fallbackPack, packFor, primaryLanguage, type LanguagePack } from './language-pack';

/** A loaded pack's id ("de", "en", "pt-br"). */
export type ChatLanguage = string;

type DetectionPack = Pick<LanguagePack, 'id' | 'locale' | 'words' | 'letters'>;

/** Scripts that name their language: a word in one of them counts for the first loaded pack of those languages. */
const SCRIPTS: { pattern: RegExp; languages: string[] }[] = [
  { pattern: /\p{Script=Cyrillic}/u, languages: ['ru', 'uk', 'bg', 'sr', 'be', 'mk', 'kk'] },
  { pattern: /\p{Script=Greek}/u, languages: ['el'] },
  { pattern: /[\p{Script=Hiragana}\p{Script=Katakana}]/u, languages: ['ja'] },
  { pattern: /\p{Script=Hangul}/u, languages: ['ko'] },
  // Han alone is Chinese; Japanese is caught by its kana first.
  { pattern: /\p{Script=Han}/u, languages: ['zh', 'ja'] },
  { pattern: /\p{Script=Arabic}/u, languages: ['ar', 'fa', 'ur'] },
  { pattern: /\p{Script=Hebrew}/u, languages: ['he'] },
  { pattern: /\p{Script=Thai}/u, languages: ['th'] },
  { pattern: /\p{Script=Devanagari}/u, languages: ['hi', 'mr', 'ne'] },
  { pattern: /\p{Script=Georgian}/u, languages: ['ka'] },
  { pattern: /\p{Script=Armenian}/u, languages: ['hy'] },
];

/** don't, it's, i'm, you're, that's, can't, i've, we'll … (English only, worth two words). */
const CONTRACTION = /^[a-z]+'(t|s|m|re|ve|ll|d)$/i;

interface Index {
  /** Word → the one pack that lists it; words in more than one pack are left out. */
  words: Map<string, string>;
  letters: { id: string; pattern: RegExp }[];
  scripts: { pattern: RegExp; id: string }[];
  english: string | undefined;
}

/** The index is built once per packs array (the reader keeps one array until packs are reloaded). */
const indexes = new WeakMap<readonly DetectionPack[], Index>();

function indexOf(packs: readonly DetectionPack[]): Index {
  let index = indexes.get(packs);
  if (index) return index;
  const words = new Map<string, string>();
  const shared = new Set<string>();
  for (const pack of packs) {
    for (const word of pack.words) {
      const owner = words.get(word);
      if (owner !== undefined && owner !== pack.id) shared.add(word);
      else words.set(word, pack.id);
    }
  }
  for (const word of shared) words.delete(word);
  const escape = (s: string) => s.replace(/[\\\]^-]/g, '\\$&');
  index = {
    words,
    letters: packs.filter((p) => p.letters).map((p) => ({ id: p.id, pattern: new RegExp(`[${escape(p.letters)}]`, 'iu') })),
    scripts: SCRIPTS.flatMap(({ pattern, languages }) => {
      const pack = languages.map((language) => packs.find((p) => primaryLanguage(p.locale) === language)).find((p) => p);
      return pack ? [{ pattern, id: pack.id }] : [];
    }),
    english: packs.find((p) => primaryLanguage(p.locale) === 'en')?.id,
  };
  indexes.set(packs, index);
  return index;
}

/** The id of the pack the text is most likely in, or undefined when the message gives no clear hint. */
export function detectLanguage(text: string, packs: readonly DetectionPack[]): ChatLanguage | undefined {
  if (!packs.length) return undefined;
  const index = indexOf(packs);
  const score = new Map<string, number>();
  const add = (id: string | undefined, points: number) => {
    if (id !== undefined) score.set(id, (score.get(id) ?? 0) + points);
  };
  for (const raw of text.toLowerCase().replace(/[’`]/g, "'").split(/[^\p{L}\p{M}']+/u)) {
    const word = raw.replace(/^'+|'+$/g, '');
    if (!word) continue;
    if (CONTRACTION.test(word)) add(index.english, 2);
    else add(index.words.get(word), 1);
    for (const { id, pattern } of index.letters) if (pattern.test(word)) add(id, 1);
    for (const { id, pattern } of index.scripts) if (pattern.test(word)) add(id, 1);
  }
  let best: string | undefined;
  let bestScore = 0;
  let tie = false;
  for (const [id, points] of score) {
    if (points > bestScore) {
      best = id;
      bestScore = points;
      tie = false;
    } else if (points === bestScore) tie = true;
  }
  return tie ? undefined : best;
}

/** The pack id that reads a chat whose main language is this locale ("de-DE" → "de"); English or the first pack when none fits. */
export function mainLanguage(speechLanguage: string, packs: readonly Pick<LanguagePack, 'id' | 'locale'>[]): ChatLanguage {
  return (packFor(speechLanguage, packs) ?? fallbackPack(packs))?.id ?? 'en';
}

/** The locale a language's voices use: its pack's, or the language itself while no pack is loaded for it. */
export function localeOf(language: ChatLanguage, packs: readonly Pick<LanguagePack, 'id' | 'locale'>[]): string {
  return packFor(language, packs)?.locale ?? language;
}

/** The primary language of a locale ("de-DE" → "de"): the key of an old config's one voice. */
export function languageOf(locale: string): ChatLanguage {
  return primaryLanguage(locale);
}
