import type { ChatMessage } from '@stream-toolz/twitch';

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
