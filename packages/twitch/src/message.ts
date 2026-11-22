// A chat message as the reader needs it, taken from Twitch's EventSub event (channel.chat.message v1).
// The event is read defensively: unknown fields are ignored, unknown fragment types count as decoration.

import type { ChannelEventKind } from './event-kind';

export type FragmentKind = 'text' | 'emote' | 'mention' | 'cheermote' | 'other';

export interface Fragment {
  kind: FragmentKind;
  text: string;
  /** Emotes: Twitch's id of the emote (the overlay shows its picture from Twitch's CDN when the streamer wants that). */
  emoteId?: string;
}

export interface ChatMessage {
  id: string;
  userId: string;
  /** Login name (lower case). */
  login: string;
  /** Display name as shown in chat. */
  name: string;
  text: string;
  fragments: Fragment[];
  roles: { broadcaster: boolean; moderator: boolean; vip: boolean; subscriber: boolean };
  /** The chatter's name colour as Twitch shows it ("#RRGGBB"); missing when they never picked one. */
  color?: string;
  bits: number;
  /** The channel points reward the message came with (rewards that ask for text). */
  rewardId?: string;
  /** Shared chat: written in another channel of the session. */
  fromOtherChannel: boolean;
  receivedAt: number;
  /** A test message from the app itself. */
  test?: boolean;
  /** A channel event (follow, sub, raid, …), shown and read like a message; its text is what the voice says. */
  event?: ChannelEventKind;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

const FRAGMENT_KINDS: readonly FragmentKind[] = ['text', 'emote', 'mention', 'cheermote'];

/** The notification's event, or undefined if it is not a usable chat message. */
/** Fragments and badges of one message, at most (Twitch sends a few dozen). */
const MAX_PARTS = 500;
/** Logins are 25 characters; display names about the same. */
const MAX_NAME = 64;
/** The name colour Twitch sends ("#00FF7F"; '' when the chatter never picked one). */
const COLOR = /^#[0-9A-Fa-f]{6}$/;
/** Emote ids: numbers for the classic ones, otherwise a short token like "emotesv2_a1b2…". */
const EMOTE_ID = /^[A-Za-z0-9_-]{1,64}$/;

export function chatMessageFromEvent(event: unknown, now = Date.now()): ChatMessage | undefined {
  const e = obj(event);
  const id = str(e.message_id);
  const userId = str(e.chatter_user_id);
  const message = obj(e.message);
  const text = str(message.text);
  if (!id || !userId) return undefined;

  const fragments: Fragment[] = Array.isArray(message.fragments)
    ? message.fragments.slice(0, MAX_PARTS).map((f) => {
        const fragment = obj(f);
        const type = str(fragment.type);
        const kind = FRAGMENT_KINDS.includes(type as FragmentKind) ? (type as FragmentKind) : 'other';
        const emoteId = kind === 'emote' ? str(obj(fragment.emote).id) : '';
        return { kind, text: str(fragment.text), ...(EMOTE_ID.test(emoteId) ? { emoteId } : {}) };
      })
    : [{ kind: 'text', text }];

  const badges = new Set(Array.isArray(e.badges) ? e.badges.slice(0, MAX_PARTS).map((b) => str(obj(b).set_id)) : []);
  const broadcaster = badges.has('broadcaster') || userId === str(e.broadcaster_user_id);
  const source = str(e.source_broadcaster_user_id);

  return {
    id,
    userId,
    login: str(e.chatter_user_login).toLowerCase().slice(0, MAX_NAME),
    name: (str(e.chatter_user_name) || str(e.chatter_user_login)).slice(0, MAX_NAME),
    text,
    fragments,
    roles: {
      broadcaster,
      moderator: badges.has('moderator') || badges.has('lead_moderator'),
      vip: badges.has('vip'),
      subscriber: badges.has('subscriber') || badges.has('founder'),
    },
    ...(COLOR.test(str(e.color)) ? { color: str(e.color) } : {}),
    bits: Math.max(0, Math.floor(Number(obj(e.cheer).bits) || 0)),
    rewardId: str(e.channel_points_custom_reward_id) || undefined,
    fromOtherChannel: !!source && source !== str(e.broadcaster_user_id),
    receivedAt: now,
  };
}
