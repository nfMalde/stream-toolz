// Channel events that are read aloud: follows (EventSub channel.follow v2) and the chat notices for subs,
// gifted subs and raids (channel.chat.notification v1). Read defensively like chat messages: unknown notices
// and events from other channels of a shared chat are ignored.

import type { ChannelEventKind } from './event-kind';
import { chatMessageFromEvent, type ChatMessage } from './message';

export interface ChannelEvent {
  id: string;
  kind: ChannelEventKind;
  /** Who did it; all empty for an anonymous gift. */
  userId: string;
  login: string;
  name: string;
  /** Gifted subs, or the viewers a raid brought. */
  count: number;
  /** Resub: months subscribed in total. */
  months: number;
  /** "1000", "2000", "3000"; '' when Twitch does not say. */
  tier: string;
  prime: boolean;
  /** A single gifted sub: who got it. */
  recipient?: { login: string; name: string };
  /** The text a resub came with; read after the event. */
  message?: ChatMessage;
  receivedAt: number;
  /** From the test buttons. */
  test?: boolean;
}

const str = (value: unknown): string => (typeof value === 'string' ? value : '');
const num = (value: unknown): number => (typeof value === 'number' && Number.isFinite(value) && value > 0 ? Math.floor(value) : 0);
const obj = (value: unknown): Record<string, unknown> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, unknown>) : {});

/** A channel.follow event (it has no id of its own: the follower and the time make one). */
export function eventFromFollow(event: unknown, now = Date.now()): ChannelEvent | undefined {
  const e = obj(event);
  const userId = str(e.user_id);
  if (!userId) return undefined;
  const login = str(e.user_login).toLowerCase();
  return { id: `follow-${userId}-${str(e.followed_at)}`, kind: 'follow', userId, login, name: str(e.user_name) || login, count: 0, months: 0, tier: '', prime: false, receivedAt: now };
}

/** A channel.chat.notification event, if it is one of the events that are read. */
export function eventFromNotification(event: unknown, now = Date.now()): ChannelEvent | undefined {
  const e = obj(event);
  const notice = str(e.notice_type);
  const source = str(e.source_broadcaster_user_id);
  if (notice.startsWith('shared_chat_') || (source && source !== str(e.broadcaster_user_id))) return undefined;
  const id = str(e.message_id);
  if (!id) return undefined;
  const anonymous = e.chatter_is_anonymous === true;
  const login = anonymous ? '' : str(e.chatter_user_login).toLowerCase();
  const base = {
    id,
    userId: anonymous ? '' : str(e.chatter_user_id),
    login,
    name: anonymous ? '' : str(e.chatter_user_name) || login,
    count: 0,
    months: 0,
    tier: '',
    prime: false,
    receivedAt: now,
  };

  switch (notice) {
    case 'sub': {
      const sub = obj(e.sub);
      const prime = sub.is_prime === true;
      return { ...base, kind: prime ? 'prime' : 'sub', tier: str(sub.sub_tier), prime };
    }
    case 'resub': {
      const resub = obj(e.resub);
      const months = num(resub.cumulative_months);
      const prime = resub.is_prime === true;
      const message = chatMessageFromEvent(event, now);
      return { ...base, kind: months > 1 ? 'resub' : prime ? 'prime' : 'sub', months, tier: str(resub.sub_tier), prime, message: message?.text.trim() ? message : undefined };
    }
    case 'sub_gift': {
      const gift = obj(e.sub_gift);
      // Part of a community gift: that one is read, once, with the number.
      if (str(gift.community_gift_id)) return undefined;
      const recipient = str(gift.recipient_user_login).toLowerCase();
      return { ...base, kind: 'gift', count: 1, tier: str(gift.sub_tier), recipient: { login: recipient, name: str(gift.recipient_user_name) || recipient } };
    }
    case 'community_sub_gift': {
      const gift = obj(e.community_sub_gift);
      return { ...base, kind: 'communityGift', count: Math.max(1, num(gift.total)), tier: str(gift.sub_tier) };
    }
    case 'gift_paid_upgrade':
      return { ...base, kind: 'sub' };
    case 'prime_paid_upgrade':
      return { ...base, kind: 'sub', tier: str(obj(e.prime_paid_upgrade).sub_tier) };
    case 'raid': {
      const raid = obj(e.raid);
      const raider = str(raid.user_login).toLowerCase() || login;
      return { ...base, kind: 'raid', userId: str(raid.user_id) || base.userId, login: raider, name: str(raid.user_name) || base.name || raider, count: num(raid.viewer_count) };
    }
    default:
      return undefined;
  }
}
