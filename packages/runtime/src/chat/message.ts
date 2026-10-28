// A chat message as the reader needs it, taken from Twitch's EventSub event (channel.chat.message v1).
// The event is read defensively: unknown fields are ignored, unknown fragment types count as decoration.

import type { ChannelEventKind } from './event-kind';

export type FragmentKind = 'text' | 'emote' | 'mention' | 'cheermote' | 'other';

export interface Fragment {
  kind: FragmentKind;
  text: string;
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
export function chatMessageFromEvent(event: unknown, now = Date.now()): ChatMessage | undefined {
  const e = obj(event);
  const id = str(e.message_id);
  const userId = str(e.chatter_user_id);
  const message = obj(e.message);
  const text = str(message.text);
  if (!id || !userId) return undefined;

  const fragments: Fragment[] = Array.isArray(message.fragments)
    ? message.fragments.map((f) => {
        const fragment = obj(f);
        const type = str(fragment.type);
        return { kind: FRAGMENT_KINDS.includes(type as FragmentKind) ? (type as FragmentKind) : 'other', text: str(fragment.text) };
      })
    : [{ kind: 'text', text }];

  const badges = new Set(Array.isArray(e.badges) ? e.badges.map((b) => str(obj(b).set_id)) : []);
  const broadcaster = badges.has('broadcaster') || userId === str(e.broadcaster_user_id);
  const source = str(e.source_broadcaster_user_id);

  return {
    id,
    userId,
    login: str(e.chatter_user_login).toLowerCase(),
    name: str(e.chatter_user_name) || str(e.chatter_user_login),
    text,
    fragments,
    roles: {
      broadcaster,
      moderator: badges.has('moderator') || badges.has('lead_moderator'),
      vip: badges.has('vip'),
      subscriber: badges.has('subscriber') || badges.has('founder'),
    },
    bits: Number(obj(e.cheer).bits) || 0,
    rewardId: str(e.channel_points_custom_reward_id) || undefined,
    fromOtherChannel: !!source && source !== str(e.broadcaster_user_id),
    receivedAt: now,
  };
}
