import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChannelEvent, ChannelEventKind } from '@stream-toolz/twitch';
import { AlertQueue, MAX_WAITING } from '../src/queue';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from '../src/settings';

let counter = 0;
const NOW = 1_000_000;

function event(kind: ChannelEventKind, change: Partial<ChannelEvent> = {}): ChannelEvent {
  counter++;
  return { id: `e${counter}`, kind, userId: `u${counter}`, login: `user${counter}`, name: `User${counter}`, count: kind === 'raid' ? 20 : 0, months: 0, tier: '1000', prime: false, receivedAt: NOW, ...change };
}

/** change: a partial config as the UI would send it (normalize fills the rest). */
function queue(change: unknown = {}, language = 'de'): { q: AlertQueue; settings: Settings } {
  const settings = normalizeSettings(change, DEFAULT_SETTINGS);
  return { q: new AlertQueue({ settings: () => settings, language: () => language }), settings };
}

test('one alert at a time, in order, each for its duration', () => {
  const { q } = queue({ events: { sub: { durationSeconds: 5 }, raid: { durationSeconds: 3 } } });
  assert.equal(q.push(event('sub', { name: 'Anna' })), 'queued');
  assert.equal(q.push(event('raid', { name: 'Ben' })), 'queued');
  assert.equal(q.waitingCount, 2);
  const first = q.advance(NOW);
  assert.equal(first?.title, 'Anna hat abonniert!');
  assert.equal(first?.durationMs, 5000);
  assert.equal(q.waitingCount, 1);
  assert.equal(q.advance(NOW + 4999), undefined);
  assert.equal(q.showing(NOW + 4999)?.id, first?.id);
  assert.equal(q.currentEndsAt, NOW + 5000);
  const second = q.advance(NOW + 5000);
  assert.equal(second?.title, 'Ben raidet mit 20 Zuschauern!');
  assert.equal(second?.durationMs, 3000);
  assert.equal(q.advance(NOW + 8000), undefined);
  assert.equal(q.showing(NOW + 8000), undefined);
  assert.equal(q.currentEndsAt, 0);
});

test('follows beyond the limit are collapsed into the last waiting follow', () => {
  const { q } = queue({ followLimitPerMinute: 2 });
  assert.equal(q.push(event('follow', { name: 'Anna' })), 'queued');
  assert.equal(q.push(event('follow', { name: 'Ben' })), 'queued');
  assert.equal(q.push(event('follow', { name: 'Cara' })), 'merged');
  assert.equal(q.push(event('follow', { name: 'Dan' })), 'merged');
  assert.equal(q.push(event('follow', { name: 'Eve' })), 'merged');
  assert.equal(q.waitingCount, 2);
  const first = q.advance(NOW);
  assert.equal(first?.title, 'Anna folgt jetzt!');
  assert.equal(first?.message, undefined);
  const second = q.advance(NOW + 8000);
  assert.equal(second?.title, 'Ben folgt jetzt!');
  assert.equal(second?.message, '… und 3 weitere');
  // Nothing waits any more: the next one beyond the limit starts a new line, the ones after it join.
  assert.equal(q.push(event('follow', { name: 'Finn' }), NOW + 9000), 'queued');
  assert.equal(q.push(event('follow', { name: 'Gus' }), NOW + 9000), 'merged');
  const third = q.advance(NOW + 16_000);
  assert.equal(third?.title, 'Finn folgt jetzt!');
  assert.equal(third?.message, '… und 1 weitere');
});

test('the follow limit counts a minute, in English too, and 0 means no limit', () => {
  const { q } = queue({ followLimitPerMinute: 1 }, 'en');
  assert.equal(q.push(event('follow'), NOW), 'queued');
  assert.equal(q.push(event('follow'), NOW + 59_999), 'merged');
  assert.equal(q.push(event('follow'), NOW + 60_000), 'queued');
  assert.equal(q.advance(NOW + 60_000)?.message, '… and 1 more');
  const { q: unlimited } = queue({ followLimitPerMinute: 0 });
  for (let i = 0; i < 20; i++) assert.equal(unlimited.push(event('follow')), 'queued');
  assert.equal(unlimited.waitingCount, 20);
});

test('raids under the minimum, duplicates and switched-off events are dropped; tests never are', () => {
  const { q } = queue({ minRaidViewers: 10, events: { sub: { enabled: false } } });
  assert.equal(q.push(event('raid', { count: 9 })), 'raid-too-small');
  assert.equal(q.push(event('raid', { count: 10 })), 'queued');
  assert.equal(q.push(event('sub')), 'disabled');
  const twice = event('gift', { recipient: { login: 'ben', name: 'Ben' } });
  assert.equal(q.push(twice), 'queued');
  assert.equal(q.push(twice), 'duplicate');
  assert.equal(q.push(event('sub', { test: true })), 'queued');
  assert.equal(q.push(event('raid', { count: 1, test: true })), 'queued');
  assert.equal(q.waitingCount, 4);
});

test('at most 50 wait; the oldest go first', () => {
  const { q } = queue();
  for (let i = 1; i <= 60; i++) q.push(event('sub', { name: `User${i}` }));
  assert.equal(q.waitingCount, MAX_WAITING);
  assert.equal(q.advance(NOW)?.title, 'User11 hat abonniert!');
  q.clear();
  assert.equal(q.waitingCount, 0);
  assert.equal(q.showing(NOW), undefined);
  assert.equal(q.advance(NOW), undefined);
});

test('an alert carries the event sound and volume as the page needs them', () => {
  const { q } = queue({ events: { resub: { sound: 'tada.mp3', volume: 35 } } });
  q.push(event('resub', { months: 3 }));
  const alert = q.advance(NOW);
  assert.equal(alert?.sound, 'tada.mp3');
  assert.equal(alert?.volume, 0.35);
  assert.equal(alert?.kind, 'resub');
  const { q: silent } = queue();
  silent.push(event('resub', { months: 3 }));
  assert.equal(silent.advance(NOW)?.sound, undefined);
});
