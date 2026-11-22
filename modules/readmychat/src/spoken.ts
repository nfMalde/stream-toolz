// The few words the app itself speaks, from the language packs. Everything else is the chat's own text.

import type { ChannelEventKind } from '@stream-toolz/twitch/api';
import { fallbackPack, packFor, type LanguagePack, type SpokenTexts } from './language-pack';

export type { SpokenTexts } from './language-pack';

type TextPack = Pick<LanguagePack, 'id' | 'locale' | 'texts'>;

/** Spoken while no pack is loaded at all (never in the app: the built-in packs always are). */
const NONE: SpokenTexts = {
  says: '{name}: {message}',
  link: 'link',
  testName: 'Read My Chat',
  outputTest: 'Test',
  preview: 'Test',
  anonymous: 'Someone',
  prime: 'Prime',
  tier: '{n}',
  events: { follow: '{name}', sub: '{name}', prime: '{name}', resub: '{name}', gift: '{name}', communityGift: '{name}', raid: '{name}' },
  eventsOne: {},
};

/** The texts for a pack id or locale ("de", "de-DE"); a language without a pack gets English (or the first pack). */
export function spokenTexts(languageOrLocale: string, packs: readonly TextPack[]): SpokenTexts {
  return (packFor(languageOrLocale, packs) ?? fallbackPack(packs))?.texts ?? NONE;
}

/** What reading a message in a language needs from its pack: the texts and the pack's pronunciations. */
export type ReadingPack = Pick<LanguagePack, 'texts' | 'pronounce'>;

export function readingPack(languageOrLocale: string, packs: readonly (TextPack & Pick<LanguagePack, 'pronounce'>)[]): ReadingPack {
  return packFor(languageOrLocale, packs) ?? fallbackPack(packs) ?? { texts: NONE, pronounce: {} };
}

/** "{name} sagt: {message}" filled in; braces in the values stay as they are. */
export function fillTemplate(template: string, name: string, message: string): string {
  return template.replace(/\{(name|message)\}/g, (_, key: string) => (key === 'name' ? name : message));
}

/** The language's own text for an event (the UI shows it as the placeholder of the event's text field). */
export function defaultEventText(kind: ChannelEventKind, languageOrLocale: string, count: number, packs: readonly TextPack[]): string {
  const texts = spokenTexts(languageOrLocale, packs);
  return (count === 1 ? texts.eventsOne[kind] : undefined) ?? texts.events[kind];
}

export type EventValues = Record<'name' | 'count' | 'months' | 'recipient' | 'tier', string>;

/** An event text filled in; unknown placeholders stay as they are. */
export function fillEventText(template: string, values: EventValues): string {
  return template.replace(/\{(name|count|months|recipient|tier)\}/g, (_, key: keyof EventValues) => values[key]);
}
