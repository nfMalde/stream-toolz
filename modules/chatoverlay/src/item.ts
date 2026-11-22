// What the overlay page shows for one line: the types only, with no imports beyond the Twitch API types, so the UI
// (through api.ts) never pulls the Twitch connection code into its build. The mapping is in overlay-item.ts.

import type { ChannelEventKind } from '@stream-toolz/twitch/api';

export type PartKind = 'text' | 'emote' | 'mention';
export type Role = 'broadcaster' | 'mod' | 'vip' | 'sub';

export interface ItemPart {
  kind: PartKind;
  text: string;
  /** Emotes with a known id: the page shows the picture when the streamer chose that. */
  emoteId?: string;
}

export interface OverlayItem {
  id: string;
  kind: 'message' | 'event';
  /** The chatter, or who did the event ('' for an anonymous gift). */
  name: string;
  /** The chatter's Twitch colour ("#rrggbb"), '' when they have none: the page then uses the settings' colour. */
  color: string;
  roles: Role[];
  /** The message, or the whole notice of an event. */
  parts: ItemPart[];
  /** When it arrived (ms since the epoch): the page fades it from there. */
  at: number;
  /** From the "Test messages" button. */
  test?: boolean;
  /** Events: which one (the page marks the line). */
  event?: ChannelEventKind;
}
