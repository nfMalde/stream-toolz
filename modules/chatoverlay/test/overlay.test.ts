import assert from 'node:assert/strict';
import { test } from 'node:test';
import { ChatOverlay, type OverlayChange } from '../src/overlay';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { event, message } from './helpers';

function setup(change: Partial<Settings> = {}, language = 'de') {
  const settings: Settings = { ...DEFAULT_SETTINGS, ...change };
  const changes: OverlayChange[] = [];
  const overlay = new ChatOverlay({ settings: () => settings, language: () => language, onChange: (c) => changes.push(c), now: () => 5_000 });
  return { overlay, changes, settings };
}

test('messages are kept up to maxMessages, the oldest leave', () => {
  const { overlay, changes } = setup({ maxMessages: 2 });
  overlay.receive(message('one', { id: 'a' }));
  overlay.receive(message('two', { id: 'b' }));
  overlay.receive(message('three', { id: 'c' }));
  assert.deepEqual(
    overlay.items.map((i) => i.id),
    ['b', 'c'],
  );
  assert.deepEqual(
    changes.map((c) => c.type),
    ['item', 'item', 'item', 'remove'],
  );
  assert.deepEqual(changes[3], { type: 'remove', ids: ['a'] });
});

test('bots and commands are hidden; test messages always pass', () => {
  const { overlay } = setup();
  overlay.receive(message('!so maldoe'));
  overlay.receive(message('   !lurk'));
  overlay.receive(message('hello', { login: 'nightbot' }));
  overlay.receive(message('hello', { login: 'NightBot' }));
  assert.equal(overlay.items.length, 0);
  overlay.receive(message('!test', { test: true, login: 'nightbot' }));
  assert.equal(overlay.items.length, 1);
  const { overlay: lenient } = setup({ hideCommands: false, hideBots: [] });
  lenient.receive(message('!so maldoe'));
  lenient.receive(message('hi', { login: 'nightbot' }));
  assert.equal(lenient.items.length, 2);
});

test('empty messages (only invisible characters) are not shown', () => {
  const { overlay, changes } = setup();
  overlay.receive(message('​  '));
  assert.equal(overlay.items.length, 0);
  assert.equal(changes.length, 0);
});

test('a deleted message, a cleared user and a cleared chat leave', () => {
  const { overlay, changes } = setup();
  overlay.receive(message('a', { id: 'a', userId: 'u1' }));
  overlay.receive(message('b', { id: 'b', userId: 'u2' }));
  overlay.receive(message('c', { id: 'c', userId: 'u1' }));
  overlay.deleted('b');
  assert.deepEqual(changes.at(-1), { type: 'remove', ids: ['b'] });
  overlay.deleted('unknown');
  assert.equal(changes.length, 4);
  overlay.userCleared('u1');
  assert.deepEqual(changes.at(-1), { type: 'remove', ids: ['a', 'c'] });
  assert.equal(overlay.items.length, 0);
  overlay.userCleared('');
  overlay.chatCleared();
  assert.equal(changes.length, 5);
  overlay.receive(message('d'));
  overlay.chatCleared();
  assert.deepEqual(changes.at(-1), { type: 'clear' });
  assert.equal(overlay.items.length, 0);
});

test('events are one-line notices, off with showEvents false (tests still show)', () => {
  const { overlay, changes } = setup({}, 'en');
  overlay.event(event('follow', { name: 'Fan' }));
  const item = overlay.items[0]!;
  assert.equal(item.kind, 'event');
  assert.equal(item.parts[0]!.text, 'Fan just followed');
  assert.equal(changes[0]!.type, 'item');
  const { overlay: quiet } = setup({ showEvents: false });
  quiet.event(event('raid', { count: 3 }));
  assert.equal(quiet.items.length, 0);
  quiet.event(event('raid', { count: 3, test: true }));
  assert.equal(quiet.items.length, 1);
});

test('fewer messages allowed after a settings change drops the oldest', () => {
  const settings: Settings = { ...DEFAULT_SETTINGS, maxMessages: 5 };
  const changes: OverlayChange[] = [];
  const overlay = new ChatOverlay({ settings: () => settings, language: () => 'de', onChange: (c) => changes.push(c) });
  for (let i = 0; i < 5; i++) overlay.receive(message(`m${i}`, { id: `m${i}` }));
  settings.maxMessages = 2;
  overlay.settingsChanged();
  assert.deepEqual(changes.at(-1), { type: 'remove', ids: ['m0', 'm1', 'm2'] });
  assert.equal(overlay.items.length, 2);
});

test('the test messages carry emotes, a mention, every role and a follow, all marked as tests', () => {
  const { overlay } = setup({ maxMessages: 50 });
  overlay.test();
  const items = overlay.items;
  assert.equal(items.length, 5);
  assert.ok(items.every((i) => i.test));
  assert.ok(items.some((i) => i.parts.some((p) => p.kind === 'emote' && p.emoteId)));
  assert.ok(items.some((i) => i.parts.some((p) => p.kind === 'mention')));
  const roles = new Set(items.flatMap((i) => i.roles));
  assert.deepEqual([...roles].sort(), ['broadcaster', 'mod', 'sub', 'vip']);
  assert.equal(items.at(-1)!.kind, 'event');
  assert.ok(items.every((i) => i.at >= 5_000));
  // A second round gets new ids: nothing is replaced.
  overlay.test();
  assert.equal(overlay.items.length, 10);
});
