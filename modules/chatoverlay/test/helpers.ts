import type { ChannelEvent, ChatMessage } from '@stream-toolz/twitch';

let counter = 0;

/** A chat message with plain text; fields can be overridden. */
export function message(text: string, change: Partial<ChatMessage> = {}): ChatMessage {
  counter++;
  return {
    id: `m${counter}`,
    userId: 'u1',
    login: 'viewer',
    name: 'Viewer',
    text,
    fragments: [{ kind: 'text', text }],
    roles: { broadcaster: false, moderator: false, vip: false, subscriber: false },
    bits: 0,
    fromOtherChannel: false,
    receivedAt: 1_000_000,
    ...change,
  };
}

export function event(kind: ChannelEvent['kind'], change: Partial<ChannelEvent> = {}): ChannelEvent {
  counter++;
  return { id: `e${counter}`, kind, userId: 'u9', login: 'fan', name: 'Fan', count: 0, months: 0, tier: '', prime: false, receivedAt: 2_000_000, ...change };
}
