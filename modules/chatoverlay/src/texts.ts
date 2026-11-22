// The few lines the overlay writes itself: the one-line notices for follows, subs and raids, per app language. The
// chat's own words are the chat's.

import type { ChannelEventKind } from '@stream-toolz/twitch/api';

export interface OverlayTexts {
  /** {name}, {count}, {months}, {recipient}, {tier}. */
  events: Record<ChannelEventKind, string>;
  /** The same with a count of one, where the words change. */
  eventsOne: Partial<Record<ChannelEventKind, string>>;
  /** {name} of an anonymous gift. */
  anonymous: string;
  /** {tier}: a Prime sub, or the tier ({n} = 1, 2, 3). */
  prime: string;
  tier: string;
  /** Names of the sample messages ("Test messages" button). */
  testName: string;
}

const TEXTS: Record<'de' | 'en', OverlayTexts> = {
  de: {
    events: {
      follow: '{name} folgt jetzt',
      sub: '{name} hat abonniert',
      prime: '{name} hat mit Prime abonniert',
      resub: '{name} ist seit {months} Monaten dabei',
      gift: '{name} verschenkt ein Abo an {recipient}',
      communityGift: '{name} verschenkt {count} Abos',
      raid: '{name} raidet mit {count} Zuschauern',
    },
    eventsOne: {
      communityGift: '{name} verschenkt ein Abo',
      raid: '{name} raidet mit einem Zuschauer',
    },
    anonymous: 'Jemand',
    prime: 'Prime',
    tier: 'Stufe {n}',
    testName: 'Testnachricht',
  },
  en: {
    events: {
      follow: '{name} just followed',
      sub: '{name} just subscribed',
      prime: '{name} subscribed with Prime',
      resub: '{name} has been subscribed for {months} months',
      gift: '{name} gifted a sub to {recipient}',
      communityGift: '{name} is gifting {count} subs',
      raid: '{name} is raiding with {count} viewers',
    },
    eventsOne: {
      communityGift: '{name} is gifting a sub',
      raid: '{name} is raiding with one viewer',
    },
    anonymous: 'Someone',
    prime: 'Prime',
    tier: 'Tier {n}',
    testName: 'Test message',
  },
};

/** The texts for an app language ("de", "de-DE", "en"); anything else gets English. */
export function overlayTexts(language: string): OverlayTexts {
  return language.toLowerCase().startsWith('de') ? TEXTS.de : TEXTS.en;
}
