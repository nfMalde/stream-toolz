// The default texts of the alerts per app language, written for the screen: short, one line. Taken from
// ReadMyChat's spoken texts (its src/spoken.ts), cut down for an overlay. No Node imports: the UI shows them as
// placeholders of the text fields.

import type { ChannelEventKind } from '@stream-toolz/twitch/api';

export interface AlertTexts {
  /** {name}, {count}, {months}, {recipient}, {tier}. */
  events: Record<ChannelEventKind, string>;
  /** The same with a count of one, where the words change. */
  eventsOne: Partial<Record<ChannelEventKind, string>>;
  /** Below a follow alert that stands for more follows than the limit allows: {count} more. */
  followMore: string;
  /** {name} of an anonymous gift. */
  anonymous: string;
  /** {tier}: a Prime sub, or the tier ({n} = 1, 2, 3). */
  prime: string;
  tier: string;
  /** The sample resub message of the test button. */
  testMessage: string;
}

const TEXTS: Record<string, AlertTexts> = {
  de: {
    events: {
      follow: '{name} folgt jetzt!',
      sub: '{name} hat abonniert!',
      prime: '{name} hat mit Prime abonniert!',
      resub: '{name} ist seit {months} Monaten dabei!',
      gift: '{name} verschenkt ein Abo an {recipient}!',
      communityGift: '{name} verschenkt {count} Abos!',
      raid: '{name} raidet mit {count} Zuschauern!',
    },
    eventsOne: {
      resub: '{name} ist seit einem Monat dabei!',
      communityGift: '{name} verschenkt ein Abo!',
      raid: '{name} raidet mit einem Zuschauer!',
    },
    followMore: '… und {count} weitere',
    anonymous: 'Jemand',
    prime: 'Prime',
    tier: 'Stufe {n}',
    testMessage: 'Bester Stream!',
  },
  en: {
    events: {
      follow: '{name} just followed!',
      sub: '{name} just subscribed!',
      prime: '{name} subscribed with Prime!',
      resub: '{name} has been subscribed for {months} months!',
      gift: '{name} gifted a sub to {recipient}!',
      communityGift: '{name} gifted {count} subs!',
      raid: '{name} is raiding with {count} viewers!',
    },
    eventsOne: {
      resub: '{name} has been subscribed for one month!',
      communityGift: '{name} gifted a sub!',
      raid: '{name} is raiding with one viewer!',
    },
    followMore: '… and {count} more',
    anonymous: 'Someone',
    prime: 'Prime',
    tier: 'Tier {n}',
    testMessage: 'Best stream!',
  },
};

/** The texts for an app language ("de", "de-DE"); other languages get English. */
export function alertTexts(language: string): AlertTexts {
  return TEXTS[language.split('-')[0]!.toLowerCase()] ?? TEXTS['en']!;
}

/** The language's own text for an event (the UI shows it as the placeholder of the event's text field). */
export function defaultAlertText(kind: ChannelEventKind, language: string, count = 0): string {
  const texts = alertTexts(language);
  return (count === 1 ? texts.eventsOne[kind] : undefined) ?? texts.events[kind];
}

export type AlertValues = Record<'name' | 'count' | 'months' | 'recipient' | 'tier', string>;

/** An alert text filled in; unknown placeholders stay as they are. */
export function fillAlertText(template: string, values: AlertValues): string {
  return template.replace(/\{(name|count|months|recipient|tier)\}/g, (_, key: keyof AlertValues) => values[key]);
}
