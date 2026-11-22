import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventLine, itemFromEvent, itemFromMessage, MAX_TEXT, partsOf } from '../src/overlay-item';
import { overlayTexts } from '../src/texts';
import { event, message } from './helpers';

test('a message becomes an item with name, colour, roles and parts', () => {
  const item = itemFromMessage(
    message('Hi @Maldoe Kappa', {
      id: 'abc-123',
      name: 'ModMax',
      color: '#1E90FF',
      roles: { broadcaster: false, moderator: true, vip: false, subscriber: true },
      fragments: [
        { kind: 'text', text: 'Hi ' },
        { kind: 'mention', text: '@Maldoe' },
        { kind: 'text', text: ' ' },
        { kind: 'emote', text: 'Kappa', emoteId: '25' },
      ],
    }),
  );
  assert.equal(item.id, 'abc-123');
  assert.equal(item.kind, 'message');
  assert.equal(item.name, 'ModMax');
  assert.equal(item.color, '#1e90ff');
  assert.deepEqual(item.roles, ['mod', 'sub']);
  assert.deepEqual(item.parts, [
    { kind: 'text', text: 'Hi ' },
    { kind: 'mention', text: '@Maldoe' },
    { kind: 'text', text: ' ' },
    { kind: 'emote', text: 'Kappa', emoteId: '25' },
  ]);
  assert.equal(item.at, 1_000_000);
  assert.equal(item.test, undefined);
});

test('no colour, a bad colour, an emote without id, cheermotes and unknown fragments', () => {
  const plain = itemFromMessage(message('x', { color: undefined }));
  assert.equal(plain.color, '');
  assert.equal(itemFromMessage(message('x', { color: 'red; background: url(x)' })).color, '');
  const parts = partsOf(
    message('cheer100 Kappa party', {
      fragments: [
        { kind: 'cheermote', text: 'cheer100' },
        { kind: 'text', text: ' ' },
        { kind: 'emote', text: 'Kappa' },
        { kind: 'other', text: ' party' },
      ],
    }),
  );
  assert.deepEqual(parts, [
    { kind: 'text', text: 'cheer100 ' },
    { kind: 'emote', text: 'Kappa' },
    { kind: 'text', text: ' party' },
  ]);
  const badId = partsOf(message('K', { fragments: [{ kind: 'emote', text: 'K', emoteId: 'bad id!' }] }));
  assert.equal(badId[0]!.emoteId, undefined);
});

test('text is bounded at 500 characters, also across fragments; emotes are never cut', () => {
  const long = 'a'.repeat(700);
  assert.equal(itemFromMessage(message(long)).parts[0]!.text.length, MAX_TEXT);
  const parts = partsOf(
    message('x', {
      fragments: [
        { kind: 'text', text: 'b'.repeat(498) },
        { kind: 'emote', text: 'Kappa', emoteId: '25' },
        { kind: 'text', text: 'after' },
      ],
    }),
  );
  // 498 letters, then no room for the five-letter emote: it is left out, the rest cut to the limit.
  assert.deepEqual(
    parts.map((p) => [p.kind, p.text.length]),
    [['text', 500]],
  );
  const total = parts.reduce((sum, p) => sum + p.text.length, 0);
  assert.ok(total <= MAX_TEXT);
});

test('control characters, zero-width marks and Zalgo are removed; blanks collapse; empty messages give no parts', () => {
  const item = itemFromMessage(message('a\u0000b​c d   e'));
  assert.equal(item.parts[0]!.text, 'a b c d e');
  const zalgo = itemFromMessage(message('h́̂̃̄i'));
  assert.equal(zalgo.parts[0]!.text, 'h́̂i');
  assert.deepEqual(itemFromMessage(message('   ')).parts, []);
  assert.deepEqual(itemFromMessage(message('​')).parts, []);
});

test('names fall back to the login, are bounded and cleaned; ids are kept as they are when sane', () => {
  assert.equal(itemFromMessage(message('x', { name: '', login: 'someone' })).name, 'someone');
  assert.equal(itemFromMessage(message('x', { name: 'A'.repeat(100) })).name.length, 64);
  assert.equal(itemFromMessage(message('x', { name: 'Evil\u0000<b>' })).name, 'Evil <b>');
  assert.equal(itemFromMessage(message('x', { id: 'follow-1-2026-10-30T10:00:00.000Z' })).id, 'follow-1-2026-10-30T10:00:00.000Z');
  assert.equal(itemFromMessage(message('x', { id: 'a b<c>' })).id, 'a_b_c_');
  assert.equal(itemFromMessage(message('x', { id: '', receivedAt: 7 })).id, 'm-7');
  assert.equal(itemFromMessage(message('x', { test: true })).test, true);
});

test('events become one-line notices in the app language', () => {
  const de = overlayTexts('de-DE');
  const en = overlayTexts('en');
  assert.equal(eventLine(event('follow', { name: 'Fan' }), de), 'Fan folgt jetzt');
  assert.equal(eventLine(event('follow', { name: 'Fan' }), en), 'Fan just followed');
  assert.equal(eventLine(event('sub'), en), 'Fan just subscribed');
  assert.equal(eventLine(event('prime'), de), 'Fan hat mit Prime abonniert');
  assert.equal(eventLine(event('resub', { months: 7 }), de), 'Fan ist seit 7 Monaten dabei');
  assert.equal(eventLine(event('gift', { count: 1, recipient: { login: 'lucky', name: 'Lucky' } }), en), 'Fan gifted a sub to Lucky');
  assert.equal(eventLine(event('communityGift', { count: 5 }), de), 'Fan verschenkt 5 Abos');
  assert.equal(eventLine(event('communityGift', { count: 1 }), en), 'Fan is gifting a sub');
  assert.equal(eventLine(event('raid', { count: 1 }), de), 'Fan raidet mit einem Zuschauer');
  assert.equal(eventLine(event('raid', { count: 42 }), en), 'Fan is raiding with 42 viewers');
  // Anonymous gifts have no name.
  assert.equal(eventLine(event('communityGift', { count: 3, name: '', login: '' }), de), 'Jemand verschenkt 3 Abos');
  assert.equal(overlayTexts('fr'), en);

  const item = itemFromEvent(event('raid', { id: 'r1', count: 3, test: true }), en);
  assert.equal(item.kind, 'event');
  assert.equal(item.event, 'raid');
  assert.deepEqual(item.parts, [{ kind: 'text', text: 'Fan is raiding with 3 viewers' }]);
  assert.deepEqual(item.roles, []);
  assert.equal(item.color, '');
  assert.equal(item.test, true);
});
