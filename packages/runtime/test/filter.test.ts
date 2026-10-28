import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatFilter, containsBlockedWord } from '../src/chat/filter';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { message } from './helpers';

const settings = (change: Partial<Settings> = {}): Settings => ({ ...DEFAULT_SETTINGS, ...change });
const reason = (verdict: ReturnType<ChatFilter['check']>) => (verdict.read ? 'read' : verdict.reason);

test('a normal message is read', () => {
  assert.deepEqual(new ChatFilter().check(message('Hallo zusammen'), settings(), 'me'), { read: true, body: 'Hallo zusammen' });
});

test('commands, bots and own messages', () => {
  const filter = new ChatFilter();
  assert.equal(reason(filter.check(message('!song'), settings(), 'me')), 'command');
  assert.equal(reason(filter.check(message('!song'), settings({ skipCommands: false }), 'me')), 'read');
  assert.equal(reason(filter.check(message('Follow!', { login: 'nightbot' }), settings(), 'me')), 'ignored-user');
  assert.equal(reason(filter.check(message('meins', { userId: 'me' }), settings({ readOwn: false }), 'me')), 'own-message');
  assert.equal(reason(filter.check(message('meins 2', { userId: 'me' }), settings(), 'me')), 'read');
});

test('audience: privileged and reward', () => {
  const filter = new ChatFilter();
  const privileged = settings({ audience: 'privileged' });
  assert.equal(reason(filter.check(message('a'), privileged, 'me')), 'audience');
  assert.equal(reason(filter.check(message('b', { roles: { broadcaster: false, moderator: false, vip: true, subscriber: false } }), privileged, 'me')), 'read');
  const reward = settings({ audience: 'reward', rewardId: 'r-1' });
  assert.equal(reason(filter.check(message('c'), reward, 'me')), 'reward');
  assert.equal(reason(filter.check(message('d', { rewardId: 'r-2' }), reward, 'me')), 'reward');
  assert.equal(reason(filter.check(message('e', { rewardId: 'r-1' }), reward, 'me')), 'read');
});

test('duplicates within the window, from anyone', () => {
  const filter = new ChatFilter();
  const s = settings({ duplicateSeconds: 30 });
  assert.equal(reason(filter.check(message('GG!', { receivedAt: 0 }), s, 'me', 0)), 'read');
  assert.equal(reason(filter.check(message('gg', { userId: 'u2', receivedAt: 5_000 }), s, 'me', 5_000)), 'duplicate');
  assert.equal(reason(filter.check(message('gg', { userId: 'u3', receivedAt: 31_000 }), s, 'me', 31_000)), 'read');
});

test('limit per person and minute', () => {
  const filter = new ChatFilter();
  const s = settings({ userLimit: 2, duplicateSeconds: 0 });
  assert.equal(reason(filter.check(message('eins'), s, 'me', 0)), 'read');
  assert.equal(reason(filter.check(message('zwei'), s, 'me', 1_000)), 'read');
  assert.equal(reason(filter.check(message('drei'), s, 'me', 2_000)), 'user-limit');
  assert.equal(reason(filter.check(message('vier', { userId: 'u2' }), s, 'me', 2_000)), 'read');
  assert.equal(reason(filter.check(message('fünf'), s, 'me', 61_000)), 'read');
});

test('test messages skip duplicate and limit checks', () => {
  const filter = new ChatFilter();
  const s = settings({ userLimit: 1 });
  assert.equal(reason(filter.check(message('Test', { test: true }), s, 'me', 0)), 'read');
  assert.equal(reason(filter.check(message('Test', { test: true }), s, 'me', 1)), 'read');
});

test('blocked words match whole words only', () => {
  assert.equal(containsBlockedWord('Du Arsch!', ['arsch']), true);
  assert.equal(containsBlockedWord('Barschbecken', ['arsch']), false);
  assert.equal(containsBlockedWord('so ein mist hier', ['so ein mist']), true);
  assert.equal(reason(new ChatFilter().check(message('Du Arsch'), settings({ blockedWords: ['arsch'] }), 'me')), 'blocked-word');
});

test('links can skip the whole message', () => {
  assert.equal(reason(new ChatFilter().check(message('free followers at bit.ly/x'), settings({ links: 'skip-message' }), 'me')), 'link');
});

test('shared chat from other channels is off by default', () => {
  assert.equal(reason(new ChatFilter().check(message('hi', { fromOtherChannel: true }), settings(), 'me')), 'shared-chat');
});
