// Understands what the streamer typed ("in 15 Minuten", "bis 20:30 Pause", "1h30", "until 8:30 pm – back soon"):
// a duration or a time of day, German or English, and whatever is left as the label. Understood on this PC with a
// small grammar: no service, no model (docs/04, the user 2026-10-30: "Ich will sagen können zb 'in 15 Minuten'").
// No Node imports: the UI may use it to show what would be understood.

export type CountdownLanguage = 'de' | 'en';

export interface ParsedCountdown {
  /** Epoch milliseconds. */
  endsAt: number;
  /** The rest of the phrase without the time words ('' when there is none). */
  label: string;
}

export const MAX_LABEL = 60;
/** Longer than a week is a typo, not a countdown: the parser answers "not understood". */
export const MAX_DURATION_MS = 7 * 24 * 3_600_000;
/** More than this is not a phrase. */
const MAX_PHRASE = 200;

/** Numbers as words, up to twenty, both languages (the articles count as one: "in an hour", "in einer Stunde"). */
const NUMBER_WORDS: Record<string, number> = {
  ein: 1, eine: 1, einer: 1, einem: 1, einen: 1, eins: 1,
  zwei: 2, drei: 3, vier: 4, fünf: 5, fuenf: 5, sechs: 6, sieben: 7, acht: 8, neun: 9, zehn: 10, elf: 11, zwölf: 12, zwoelf: 12,
  dreizehn: 13, vierzehn: 14, fünfzehn: 15, fuenfzehn: 15, sechzehn: 16, siebzehn: 17, achtzehn: 18, neunzehn: 19, zwanzig: 20,
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19, twenty: 20,
};

/** Longest first, so "dreizehn" is not read as "drei" + "zehn". */
const WORDS = Object.keys(NUMBER_WORDS)
  .sort((a, b) => b.length - a.length)
  .join('|');
/** A match may not end inside a word ("15 minx" is not "15 min"). */
const END = '(?![\\p{L}\\p{N}])';
/** \b knows only ASCII: a match may not start inside a word either ("Tee trinken" holds no "ein"). */
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

// All of these are sticky (y): they are tried at one position, never searched.
const UNIT = new RegExp(`(?:(?<hour>hours?|hrs?|stunden?|stdn?|std|h)|(?<minute>minutes?|minuten?|mins?|min|m)|(?<second>seconds?|sekunden?|secs?|sec|sek|s))\\.?${END}`, 'iuy');
/** "1h30", "1h 30m", "2h15min": hours and minutes in one go. */
const COMPACT = new RegExp(`(\\d{1,3})\\s*h\\s*(\\d{1,2})(?:\\s*(?:minutes?|minuten?|mins?|min|m)\\.?)?${END}`, 'iuy');
const QUARTER_HOUR = new RegExp(`(?:eine?\\s+)?viertelstunde${END}|(?:a\\s+)?quarter\\s+(?:of\\s+)?(?:an?\\s+)?hours?${END}`, 'iuy');
/**
 * How many, followed by the whitespace before the unit. The order matters: a sticky regex does not try the next
 * alternative once the unit (a separate regex) fails, so the longer forms come first ("one and a half" before "one",
 * "eine halbe" before "eine").
 */
const QUANTITY = new RegExp(
  `(?<andHalf>${WORDS}|\\d+)\\s+and\\s+a\\s+half\\s+` +
    `|(?<wordHalf>${WORDS})einhalb\\s+` +
    `|(?<anderthalb>anderthalb)\\s+` +
    `|(?:eine?[rmn]?\\s+|'?ne[rm]?\\s+)?(?<halbe>halbe[nrs]?)\\s+` +
    `|(?<half>half)\\s+(?:an?\\s+)?` +
    `|(?<digits>\\d+(?:[.,]\\d+)?)\\s*` +
    `|(?<word>${WORDS})\\s+`,
  'iuy',
);
const AND_A_HALF = new RegExp(`\\s+and\\s+a\\s+half${END}`, 'iuy');
const PREFIX = /(?:in|für|fuer|for|noch|nochmal|another|weitere)\s+/iuy;
const SEPARATOR = /\s*,\s*|\s+(?:und|and)\s+|\s+/iuy;

/**
 * A time of day. A bare number ("20") counts only after a keyword ("bis 20"); "20:30" always; the German dot form
 * ("20.30") only with "Uhr" or a keyword, so "1.5" stays a number.
 */
const TIME = new RegExp(
  `(?<keyword>(?:bis|um|until|till|at|by|ab)\\s+)?(?:` +
    `(?<hour>\\d{1,2})(?:(?<colon>[:.])(?<minute>\\d{2}))?\\s*(?<suffix>uhr|a\\.?m\\.?|p\\.?m\\.?)?` +
    `|halb\\s+(?<halb>\\d{1,2}|${WORDS})` +
    `|(?:(?<dreiviertel>dreiviertel)|viertel\\s+(?<viertel>vor|nach))\\s+(?<viertelHour>\\d{1,2}|${WORDS})` +
    `|(?<fraction>half|quarter)\\s+(?<direction>past|to)\\s+(?<enHour>\\d{1,2}|${WORDS})\\s*(?<enSuffix>a\\.?m\\.?|p\\.?m\\.?)?` +
    `|(?<named>noon|midnight|mittag|mitternacht)` +
    `)${END}`,
  'iuy',
);

interface Span {
  end: number;
}
interface Duration extends Span {
  ms: number;
}
interface Clock extends Span {
  hour: number;
  minute: number;
  /** "bis 8" at 15:00 means 20:00 rather than tomorrow morning; am/pm or a 24-hour value leave no doubt. */
  guessTwelveHours: boolean;
}

/**
 * The phrase as a countdown: when it ends and its label. A duration wins over a time of day ("5 Minuten Pause bis
 * 20:30" is five minutes). The language is not needed today (both grammars are always on: a German streamer types
 * English too); it is there so a later preference, e.g. for an ambiguous form, has it. undefined: not understood.
 */
export function parseCountdown(phrase: string, now: Date, language: CountdownLanguage): ParsedCountdown | undefined {
  void language;
  const text = phrase.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!text || text.length > MAX_PHRASE) return undefined;
  for (let i = 0; i < text.length; i++) {
    if (!atWordStart(text, i)) continue;
    const duration = durationAt(text, i);
    if (!duration) continue;
    if (duration.ms <= 0 || duration.ms > MAX_DURATION_MS) return undefined;
    return { endsAt: now.getTime() + duration.ms, label: labelOf(text, i, duration.end) };
  }
  for (let i = 0; i < text.length; i++) {
    if (!atWordStart(text, i)) continue;
    const clock = clockAt(text, i);
    if (!clock) continue;
    return { endsAt: atClock(now, clock), label: labelOf(text, i, clock.end) };
  }
  return undefined;
}

function atWordStart(text: string, i: number): boolean {
  const char = text[i]!;
  if (!LETTER_OR_DIGIT.test(char) && char !== "'") return false;
  return i === 0 || !LETTER_OR_DIGIT.test(text[i - 1]!);
}

/** An optional prefix ("in", "für", "for", "noch") and one or more parts ("2 Stunden 15 Minuten", "1h 30m"). */
function durationAt(text: string, start: number): Duration | undefined {
  PREFIX.lastIndex = start;
  const prefixed = PREFIX.exec(text) ? PREFIX.lastIndex : start;
  let part = partAt(text, prefixed);
  if (!part && prefixed !== start) part = partAt(text, start);
  if (!part) return undefined;
  let { ms, end } = part;
  for (;;) {
    SEPARATOR.lastIndex = end;
    if (!SEPARATOR.exec(text)) break;
    const next = partAt(text, SEPARATOR.lastIndex);
    if (!next) break;
    ms += next.ms;
    end = next.end;
  }
  return { ms, end };
}

/** One number with its unit. */
function partAt(text: string, pos: number): Duration | undefined {
  COMPACT.lastIndex = pos;
  const compact = COMPACT.exec(text);
  if (compact) return { ms: (Number(compact[1]) * 60 + Number(compact[2])) * 60_000, end: COMPACT.lastIndex };
  QUARTER_HOUR.lastIndex = pos;
  if (QUARTER_HOUR.exec(text)) return { ms: 15 * 60_000, end: QUARTER_HOUR.lastIndex };
  QUANTITY.lastIndex = pos;
  const quantity = QUANTITY.exec(text);
  if (!quantity?.groups) return undefined;
  UNIT.lastIndex = QUANTITY.lastIndex;
  const unit = UNIT.exec(text);
  if (!unit?.groups) return undefined;
  let count = quantityOf(quantity.groups);
  if (!Number.isFinite(count)) return undefined;
  let end = UNIT.lastIndex;
  AND_A_HALF.lastIndex = end;
  if (AND_A_HALF.exec(text)) {
    count += 0.5;
    end = AND_A_HALF.lastIndex;
  }
  const perUnit = unit.groups['hour'] ? 3_600_000 : unit.groups['minute'] ? 60_000 : 1_000;
  return { ms: Math.round(count * perUnit), end };
}

function quantityOf(g: Record<string, string | undefined>): number {
  if (g['andHalf']) return numberOf(g['andHalf']) + 0.5;
  if (g['wordHalf']) return numberOf(g['wordHalf']) + 0.5;
  if (g['anderthalb']) return 1.5;
  if (g['halbe'] || g['half']) return 0.5;
  if (g['digits']) return Number(g['digits'].replace(',', '.'));
  return numberOf(g['word'] ?? '');
}

function numberOf(word: string): number {
  return /^\d+$/.test(word) ? Number(word) : (NUMBER_WORDS[word.toLowerCase()] ?? NaN);
}

function clockAt(text: string, start: number): Clock | undefined {
  TIME.lastIndex = start;
  const m = TIME.exec(text);
  const g = m?.groups;
  if (!g) return undefined;
  const end = TIME.lastIndex;
  const keyword = !!g['keyword'];
  if (g['hour'] !== undefined) {
    const suffix = g['suffix']?.toLowerCase().replace(/\./g, '');
    const minute = g['minute'] !== undefined ? Number(g['minute']) : 0;
    // "1.5" is a number, "20.30 Uhr" a time; a bare "20" is a time only after "bis"/"um"/"until"/"at".
    const understood = (g['minute'] !== undefined && g['colon'] === ':') || !!suffix || keyword;
    if (!understood || minute > 59) return undefined;
    return withSuffix(Number(g['hour']), minute, suffix, end);
  }
  if (g['halb'] !== undefined) return twelveHour(numberOf(g['halb']) - 1, 30, end);
  if (g['viertelHour'] !== undefined) {
    const hour = numberOf(g['viertelHour']);
    return g['viertel']?.toLowerCase() === 'nach' ? twelveHour(hour, 15, end) : twelveHour(hour - 1, 45, end);
  }
  if (g['enHour'] !== undefined) {
    const hour = numberOf(g['enHour']);
    const past = g['direction']?.toLowerCase() === 'past';
    const minutes = g['fraction']?.toLowerCase() === 'half' ? 30 : 15;
    const suffix = g['enSuffix']?.toLowerCase().replace(/\./g, '');
    return past ? withSuffix(hour, minutes, suffix, end) : withSuffix(hour - 1, 60 - minutes, suffix, end);
  }
  const named = g['named']?.toLowerCase();
  return { hour: named === 'noon' || named === 'mittag' ? 12 : 0, minute: 0, guessTwelveHours: false, end };
}

function withSuffix(hour: number, minute: number, suffix: string | undefined, end: number): Clock | undefined {
  if (suffix === 'am' || suffix === 'pm') {
    if (hour < 1 || hour > 12) return undefined;
    const h = suffix === 'am' ? hour % 12 : (hour % 12) + 12;
    return { hour: h, minute, guessTwelveHours: false, end };
  }
  if (hour < 0 || hour > 24 || (hour === 24 && minute !== 0)) return undefined;
  return twelveHour(hour, minute, end);
}

/** Hours 1..11 without am/pm may mean the evening (see Clock.guessTwelveHours). */
function twelveHour(hour: number, minute: number, end: number): Clock | undefined {
  if (!Number.isFinite(hour) || hour < 0 || hour > 24) return undefined;
  return { hour, minute, guessTwelveHours: hour >= 1 && hour <= 11, end };
}

/** The next moment that clock shows: today, twelve hours later today if that fits, else tomorrow. */
function atClock(now: Date, clock: Clock): number {
  const today = new Date(now);
  today.setHours(clock.hour, clock.minute, 0, 0);
  if (today.getTime() > now.getTime()) return today.getTime();
  if (clock.guessTwelveHours) {
    const evening = new Date(now);
    evening.setHours(clock.hour + 12, clock.minute, 0, 0);
    if (evening.getTime() > now.getTime()) return evening.getTime();
  }
  today.setDate(today.getDate() + 1);
  return today.getTime();
}

/** What is left around the time words, without separators ("in 10 Minuten: Giveaway" → "Giveaway"). */
function labelOf(text: string, start: number, end: number): string {
  const trim = (s: string) => s.replace(/^[\s:;,.\-–—|/]+|[\s:;,.\-–—|/]+$/gu, '');
  const parts = [trim(text.slice(0, start)), trim(text.slice(end))].filter(Boolean);
  return parts.join(' ').slice(0, MAX_LABEL).trim();
}
