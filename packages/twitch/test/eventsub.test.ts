import assert from 'node:assert/strict';
import { test } from 'node:test';
import { chatMessageFromEvent } from '../src/message';
import { EventSubSocket } from '../src/eventsub';

// Shapes from https://dev.twitch.tv/docs/eventsub/eventsub-subscription-types/#channelchatmessage
const EVENT = {
  broadcaster_user_id: '1971641',
  broadcaster_user_login: 'streamer',
  broadcaster_user_name: 'streamer',
  chatter_user_id: '4145994',
  chatter_user_login: 'viewer32',
  chatter_user_name: 'viewer32',
  message_id: 'cc106a89-1814-919d-454c-f4f2f970aae7',
  message: {
    text: 'Hi chat @streamer Kappa',
    fragments: [
      { type: 'text', text: 'Hi chat ', cheermote: null, emote: null, mention: null },
      { type: 'mention', text: '@streamer', mention: { user_id: '1971641', user_name: 'streamer', user_login: 'streamer' } },
      { type: 'text', text: ' ' },
      { type: 'emote', text: 'Kappa', emote: { id: '25' } },
    ],
  },
  color: '#00FF7F',
  badges: [{ set_id: 'moderator', id: '1', info: '' }, { set_id: 'subscriber', id: '12', info: '16' }],
  message_type: 'text',
  cheer: null,
  reply: null,
  channel_points_custom_reward_id: null,
  source_broadcaster_user_id: null,
};

test('a channel.chat.message event becomes a chat message', () => {
  const m = chatMessageFromEvent(EVENT, 5)!;
  assert.equal(m.id, EVENT.message_id);
  assert.equal(m.login, 'viewer32');
  assert.deepEqual(m.roles, { broadcaster: false, moderator: true, vip: false, subscriber: true });
  assert.deepEqual(
    m.fragments.map((f) => f.kind),
    ['text', 'mention', 'text', 'emote'],
  );
  assert.equal(m.fromOtherChannel, false);
  assert.equal(m.rewardId, undefined);
  assert.equal(m.receivedAt, 5);
  // For the chat overlay: the chatter's colour and the emote's id, only when they look like Twitch's.
  assert.equal(m.color, '#00FF7F');
  assert.equal(m.fragments[3]!.emoteId, '25');
  assert.equal(m.fragments[0]!.emoteId, undefined);
  const odd = chatMessageFromEvent({ ...EVENT, color: 'red', message: { text: 'x', fragments: [{ type: 'emote', text: 'x', emote: { id: 'bad id!' } }] } })!;
  assert.equal(odd.color, undefined);
  assert.equal(odd.fragments[0]!.emoteId, undefined);
});

test('shared chat and rewards are recognised; unknown fragments count as decoration', () => {
  const m = chatMessageFromEvent({
    ...EVENT,
    source_broadcaster_user_id: '999',
    channel_points_custom_reward_id: 'abc-1',
    message: { text: 'x', fragments: [{ type: 'gif', text: 'party' }] },
  })!;
  assert.equal(m.fromOtherChannel, true);
  assert.equal(m.rewardId, 'abc-1');
  assert.equal(m.fragments[0]!.kind, 'other');
  assert.equal(chatMessageFromEvent({ message: {} }), undefined);
});

test('welcome, notifications, repeats and revocations', () => {
  const sessions: string[] = [];
  const notes: string[] = [];
  const revoked: string[] = [];
  const socket = new EventSubSocket({
    onSession: (id) => sessions.push(id),
    onNotification: (type) => notes.push(type),
    onRevocation: (type, status) => revoked.push(`${type}:${status}`),
    onClosed: () => undefined,
  });
  const envelope = (id: string, type: string, payload: unknown) => JSON.stringify({ metadata: { message_id: id, message_type: type }, payload });
  socket.feed(envelope('1', 'session_welcome', { session: { id: 'S1', keepalive_timeout_seconds: 10 } }));
  socket.feed(envelope('2', 'notification', { subscription: { type: 'channel.chat.message' }, event: EVENT }));
  socket.feed(envelope('2', 'notification', { subscription: { type: 'channel.chat.message' }, event: EVENT }));
  socket.feed(envelope('3', 'session_keepalive', {}));
  socket.feed(envelope('4', 'revocation', { subscription: { type: 'channel.chat.message', status: 'authorization_revoked' } }));
  socket.feed('not json');
  socket.close();
  assert.deepEqual(sessions, ['S1']);
  assert.deepEqual(notes, ['channel.chat.message']);
  assert.deepEqual(revoked, ['channel.chat.message:authorization_revoked']);
});
