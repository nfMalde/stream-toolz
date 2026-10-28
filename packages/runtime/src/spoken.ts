// The few words the app itself speaks, per chat language. Everything else is the chat's own text.

import type { ChannelEventKind } from './chat/event-kind';

export interface SpokenTexts {
  /** Default template around a message. */
  says: string;
  /** Said instead of a link. */
  link: string;
  /** Name of the app's test messages. */
  testName: string;
  /** Test of the output (setup, settings). */
  outputTest: string;
  /** Voice preview. */
  preview: string;
  /** Channel events: {name}, {count}, {months}, {recipient}, {tier}. */
  events: Record<ChannelEventKind, string>;
  /** The same with a count of one, where the words change. */
  eventsOne: Partial<Record<ChannelEventKind, string>>;
  /** {name} of an anonymous gift. */
  anonymous: string;
  /** {tier}: a Prime sub, or the tier ({n} = 1, 2, 3). */
  prime: string;
  tier: string;
}

const SPOKEN: Record<string, SpokenTexts> = {
  de: {
    says: '{name} sagt: {message}',
    link: 'Link',
    testName: 'Read My Chat',
    outputTest: 'Hallo! So klingt der Chat auf diesem Ausgang.',
    preview: 'Hallo Chat! So klinge ich, wenn ich eure Nachrichten vorlese.',
    events: {
      follow: '{name} folgt jetzt dem Kanal. Willkommen!',
      sub: '{name} hat den Kanal abonniert. Danke!',
      prime: '{name} hat mit Prime abonniert. Danke!',
      resub: '{name} ist jetzt {months} Monate dabei. Danke!',
      gift: '{name} verschenkt ein Abo an {recipient}. Danke!',
      communityGift: '{name} verschenkt {count} Abos an die Community. Danke!',
      raid: '{name} raidet den Kanal mit {count} Zuschauern. Willkommen!',
    },
    eventsOne: {
      communityGift: '{name} verschenkt ein Abo an die Community. Danke!',
      raid: '{name} raidet den Kanal mit einem Zuschauer. Willkommen!',
    },
    anonymous: 'Jemand',
    prime: 'Prime',
    tier: 'Stufe {n}',
  },
  en: {
    says: '{name} says: {message}',
    link: 'link',
    testName: 'Read My Chat',
    outputTest: 'Hello! This is how the chat sounds on this output.',
    preview: 'Hello chat! This is how I sound when I read your messages.',
    events: {
      follow: '{name} just followed. Welcome!',
      sub: '{name} just subscribed. Thank you!',
      prime: '{name} subscribed with Prime. Thank you!',
      resub: '{name} has been subscribed for {months} months. Thank you!',
      gift: '{name} gifted a sub to {recipient}. Thank you!',
      communityGift: '{name} is gifting {count} subs to the community. Thank you!',
      raid: '{name} is raiding with {count} viewers. Welcome!',
    },
    eventsOne: {
      communityGift: '{name} is gifting a sub to the community. Thank you!',
      raid: '{name} is raiding with one viewer. Welcome!',
    },
    anonymous: 'Someone',
    prime: 'Prime',
    tier: 'Tier {n}',
  },
};

/** The texts for a speech language ("de-DE"); other languages get English. */
export function spokenTexts(language: string): SpokenTexts {
  return SPOKEN[language.split('-')[0]!.toLowerCase()] ?? SPOKEN['en']!;
}

/** "{name} sagt: {message}" filled in; braces in the values stay as they are. */
export function fillTemplate(template: string, name: string, message: string): string {
  return template.replace(/\{(name|message)\}/g, (_, key: string) => (key === 'name' ? name : message));
}

/** The language's own text for an event (the UI shows it as the placeholder of the event's text field). */
export function defaultEventText(kind: ChannelEventKind, language: string, count = 0): string {
  const texts = spokenTexts(language);
  return (count === 1 ? texts.eventsOne[kind] : undefined) ?? texts.events[kind];
}

export type EventValues = Record<'name' | 'count' | 'months' | 'recipient' | 'tier', string>;

/** An event text filled in; unknown placeholders stay as they are. */
export function fillEventText(template: string, values: EventValues): string {
  return template.replace(/\{(name|count|months|recipient|tier)\}/g, (_, key: keyof EventValues) => values[key]);
}
