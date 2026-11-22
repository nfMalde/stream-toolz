import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { AudioSink } from '@stream-toolz/core';
import type { Speech } from '@stream-toolz/speech';
import { eventFromFollow, eventFromNotification, type ChannelEvent } from '@stream-toolz/twitch';
import { ReadQueue } from '../src/queue';
import { ChatReader } from '../src/reader';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from '../src/settings';
import { BUILT_IN_PACKS } from '../src/built-in-packs';
import { message } from './helpers';

// --- Twitch's events (shapes as in the EventSub reference) ---

function notice(type: string, fields: Record<string, unknown>, change: Record<string, unknown> = {}) {
  return {
    broadcaster_user_id: '100',
    broadcaster_user_login: 'maldoe',
    broadcaster_user_name: 'Maldoe',
    chatter_user_id: '200',
    chatter_user_login: 'anna_99',
    chatter_user_name: 'Anna_99',
    chatter_is_anonymous: false,
    message_id: `id-${type}-${Math.random()}`,
    message: { text: '', fragments: [] },
    notice_type: type,
    source_broadcaster_user_id: null,
    [type]: fields,
    ...change,
  };
}

test('a sub, a Prime sub and a resub are told apart', () => {
  assert.equal(eventFromNotification(notice('sub', { sub_tier: '1000', is_prime: false, duration_months: 1 }))?.kind, 'sub');
  const prime = eventFromNotification(notice('sub', { sub_tier: '1000', is_prime: true, duration_months: 1 }));
  assert.equal(prime?.kind, 'prime');
  assert.equal(prime?.prime, true);
  const resub = eventFromNotification(
    notice('resub', { cumulative_months: 7, duration_months: 1, streak_months: 7, sub_tier: '2000', is_prime: false, is_gift: false }, { message: { text: 'Bester Stream!', fragments: [{ type: 'text', text: 'Bester Stream!' }] } }),
  );
  assert.equal(resub?.kind, 'resub');
  assert.equal(resub?.months, 7);
  assert.equal(resub?.tier, '2000');
  assert.equal(resub?.message?.text, 'Bester Stream!');
});

test('a community gift is one event; its single gifts are not read again', () => {
  const community = eventFromNotification(notice('community_sub_gift', { id: 'cg1', total: 5, sub_tier: '1000' }));
  assert.equal(community?.kind, 'communityGift');
  assert.equal(community?.count, 5);
  assert.equal(eventFromNotification(notice('sub_gift', { duration_months: 1, recipient_user_id: '3', recipient_user_name: 'Ben', recipient_user_login: 'ben', sub_tier: '1000', community_gift_id: 'cg1' })), undefined);
  const single = eventFromNotification(notice('sub_gift', { duration_months: 1, recipient_user_id: '3', recipient_user_name: 'Ben', recipient_user_login: 'ben', sub_tier: '1000', community_gift_id: null }));
  assert.equal(single?.kind, 'gift');
  assert.deepEqual(single?.recipient, { login: 'ben', name: 'Ben' });
});

test('an anonymous gift has no name; a raid names the raider and the viewers', () => {
  const anonymous = eventFromNotification(notice('community_sub_gift', { id: 'cg2', total: 1, sub_tier: '1000' }, { chatter_is_anonymous: true, chatter_user_login: 'ananonymousgifter' }));
  assert.equal(anonymous?.name, '');
  assert.equal(anonymous?.login, '');
  const raid = eventFromNotification(notice('raid', { user_id: '300', user_name: 'CoolStreamer', user_login: 'coolstreamer', viewer_count: 42, profile_image_url: '' }));
  assert.equal(raid?.kind, 'raid');
  assert.equal(raid?.name, 'CoolStreamer');
  assert.equal(raid?.count, 42);
});

test('other notices and events of other channels in a shared chat are ignored', () => {
  assert.equal(eventFromNotification(notice('announcement', { color: 'BLUE' })), undefined);
  assert.equal(eventFromNotification(notice('shared_chat_sub', { sub_tier: '1000', is_prime: false })), undefined);
  assert.equal(eventFromNotification(notice('sub', { sub_tier: '1000', is_prime: false }, { source_broadcaster_user_id: '999' })), undefined);
  assert.equal(eventFromNotification({}), undefined);
});

test('a follow', () => {
  const follow = eventFromFollow({ user_id: '400', user_login: 'Neu_Hier', user_name: 'Neu_Hier', broadcaster_user_id: '100', followed_at: '2026-10-22T18:00:00Z' });
  assert.equal(follow?.kind, 'follow');
  assert.equal(follow?.login, 'neu_hier');
  assert.equal(eventFromFollow({ user_login: 'x' }), undefined);
});

// --- Reading ---

class FakeSink implements AudioSink {
  ready = true;
  played: string[] = [];
  private finish: (() => void) | undefined;
  constructor(private readonly hold = false) {}
  play(wav: Buffer): Promise<void> {
    this.played.push(wav.toString('utf8'));
    if (!this.hold) return Promise.resolve();
    return new Promise((resolve) => (this.finish = resolve));
  }
  stop(): void {
    this.end();
  }
  end(): void {
    this.finish?.();
    this.finish = undefined;
  }
}

const speech = { synthesize: async (text: string) => Buffer.from(text, 'utf8'), alive: true } as unknown as Speech;
const tick = () => new Promise((resolve) => setTimeout(resolve, 10));

function reader(sink: FakeSink, change: Partial<Settings> = {}) {
  const settings: Settings = { ...DEFAULT_SETTINGS, pauseBetween: 0, duplicateSeconds: 0, userLimit: 0, ...change };
  const r = new ChatReader({ settings: () => settings, packs: () => BUILT_IN_PACKS, sink: () => sink, speech: async () => speech, ownUserId: () => 'me', onRewardLearned: () => undefined, log: () => undefined });
  r.start();
  return r;
}

let counter = 0;
function channelEvent(kind: ChannelEvent['kind'], change: Partial<ChannelEvent> = {}): ChannelEvent {
  counter++;
  return { id: `e${counter}`, kind, userId: `u${counter}`, login: 'anna_99', name: 'Anna_99', count: 0, months: 0, tier: '1000', prime: kind === 'prime', receivedAt: Date.now(), ...change };
}

test('events are read before the waiting chat, with the main language\'s words', async () => {
  const sink = new FakeSink(true);
  const r = reader(sink);
  r.receive(message('eins', { receivedAt: Date.now() }));
  r.receive(message('zwei', { receivedAt: Date.now() }));
  await tick();
  r.event(channelEvent('prime'));
  r.event(channelEvent('raid', { name: 'CoolStreamer', login: 'coolstreamer', count: 42 }));
  for (let i = 0; i < 4; i++) {
    await tick();
    sink.end();
  }
  await tick();
  r.stop();
  assert.deepEqual(sink.played, [
    'Viewer sagt: eins',
    'Anna hat mit Prime abonniert. Danke!',
    'Cool Streamer raidet den Kanal mit 42 Zuschauern. Willkommen!',
    'Viewer sagt: zwei',
  ]);
});

test('subs, gifts and raids in their words; one of something is said as one; anonymous is "Jemand"', async () => {
  const sink = new FakeSink();
  const r = reader(sink);
  r.event(channelEvent('sub'));
  r.event(channelEvent('resub', { months: 7 }));
  r.event(channelEvent('gift', { count: 1, recipient: { login: 'ben', name: 'Ben' } }));
  r.event(channelEvent('communityGift', { count: 1, userId: '', login: '', name: '' }));
  r.event(channelEvent('communityGift', { count: 10 }));
  r.event(channelEvent('raid', { count: 1 }));
  await tick();
  r.stop();
  assert.deepEqual(sink.played, [
    'Anna hat den Kanal abonniert. Danke!',
    'Anna ist jetzt 7 Monate dabei. Danke!',
    'Anna verschenkt ein Abo an Ben. Danke!',
    'Jemand verschenkt ein Abo an die Community. Danke!',
    'Anna verschenkt 10 Abos an die Community. Danke!',
    'Anna raidet den Kanal mit einem Zuschauer. Willkommen!',
  ]);
});

test('own texts with placeholders, English words for an English chat', async () => {
  const sink = new FakeSink();
  const r = reader(sink, { speechLanguage: 'en-US', eventTexts: { ...DEFAULT_SETTINGS.eventTexts, raid: 'Raid! {name} brings {count} people' } });
  r.event(channelEvent('raid', { count: 3 }));
  r.event(channelEvent('sub', { tier: '3000' }));
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Raid! Anna brings 3 people', 'Anna just subscribed. Thank you!']);
});

test('a resub\'s message is read after it, cleaned like chat; a blocked word drops only the message', async () => {
  const sink = new FakeSink();
  const r = reader(sink, { blockedWords: ['doof'] });
  r.event(channelEvent('resub', { months: 3, message: message('Bester Stream! https://x.y', { receivedAt: Date.now() }) }));
  r.event(channelEvent('resub', { months: 4, message: message('du bist doof', { receivedAt: Date.now() }) }));
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Anna ist jetzt 3 Monate dabei. Danke! Bester Stream! Link', 'Anna ist jetzt 4 Monate dabei. Danke!']);
});

test('switched off, ignored or with a blocked name: not read; the test button still reads', async () => {
  const sink = new FakeSink();
  const r = reader(sink, { events: { ...DEFAULT_SETTINGS.events, raid: false }, ignoredUsers: ['bot_raider'], blockedWords: ['hass'] });
  r.event(channelEvent('raid', { count: 5 }));
  r.event(channelEvent('sub', { login: 'bot_raider', name: 'Bot_Raider' }));
  r.event(channelEvent('follow', { login: 'ich_hass_dich', name: 'ich_hass_dich' }));
  r.testEvent('raid');
  await tick();
  r.stop();
  assert.deepEqual(sink.played, ['Read My Chat raidet den Kanal mit 12 Zuschauern. Willkommen!']);
  assert.deepEqual(
    r.log.filter((e) => e.outcome === 'skipped').map((e) => `${e.event}:${e.reason}`),
    ['raid:event-off', 'sub:ignored-user', 'follow:blocked-word'],
  );
});

test('follows: each person once, at most five a minute (follow bots)', async () => {
  const sink = new FakeSink();
  const r = reader(sink);
  r.event(channelEvent('follow', { userId: 'same', name: 'Anna' }));
  r.event(channelEvent('follow', { userId: 'same', name: 'Anna' }));
  for (let i = 0; i < 6; i++) r.event(channelEvent('follow', { userId: `bot${i}`, login: `bot${i}`, name: `Bot${i}` }));
  await tick();
  r.stop();
  assert.equal(sink.played.length, 5);
  assert.deepEqual(
    r.log.filter((e) => e.outcome === 'skipped').map((e) => e.reason),
    ['duplicate', 'follow-limit', 'follow-limit'],
  );
});

test('a full queue drops chat before events', () => {
  const queue = new ReadQueue();
  const entry = (text: string, event?: ChannelEvent['kind']) => ({ message: message(text, { event }), body: text, language: 'de' as const, readyAt: 0 });
  queue.push(entry('chat 1'), 3);
  queue.push(entry('raid', 'raid'), 3);
  queue.push(entry('chat 2'), 3);
  const dropped = queue.push(entry('sub', 'sub'), 3);
  assert.deepEqual(dropped.map((e) => e.body), ['chat 1']);
  assert.deepEqual(queue.list().map((e) => e.body), ['raid', 'sub', 'chat 2']);
});

test('event settings are checked like the others', () => {
  const s = normalizeSettings({ events: { follow: false, sub: 'yes' }, eventTexts: { raid: '  Raid von {name}\n!  ', sub: 5, unknown: 'x' } });
  assert.deepEqual(s.events, { follow: false, sub: true, gift: true, raid: true });
  assert.equal(s.eventTexts.raid, 'Raid von {name} !');
  assert.equal(s.eventTexts.sub, '');
  assert.equal('unknown' in s.eventTexts, false);
});
