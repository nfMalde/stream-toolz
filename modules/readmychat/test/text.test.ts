import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collapseRepeats, pronounce, shorten, spokenMessage, spokenName, type TextOptions } from '../src/text';
import { message } from './helpers';

const options: TextOptions = { links: 'word', linkWord: 'Link', collapseRepeats: true, maxLength: 200, cleanNames: true, nicknames: {}, pronunciations: {} };

test('pronunciations replace whole words in any case, punctuation stays', () => {
  const words = { gg: 'good game', o7: 'Salut', ':)': 'Smiley' };
  assert.equal(pronounce('GG! Das war knapp, gg', words), 'good game! Das war knapp, good game');
  assert.equal(pronounce('o7 Chat :)', words), 'Salut Chat Smiley');
  assert.equal(pronounce('eggs bleiben', words), 'eggs bleiben');
  assert.equal(spokenMessage(message('gg wp'), { ...options, pronunciations: { gg: 'good game' } }).text, 'good game wp');
});

test('a nickname is used for mentions', () => {
  const m = message('@Xx_Dark_Lord_xX hi', { fragments: [{ kind: 'mention', text: '@Xx_Dark_Lord_xX' }, { kind: 'text', text: ' hi' }] });
  assert.equal(spokenMessage(m, { ...options, nicknames: { xx_dark_lord_xx: 'Lord' } }).text, 'Lord hi');
});

test('emotes are left out, an emote-only message has nothing to read', () => {
  const m = message('Kappa Kappa', { fragments: [{ kind: 'emote', text: 'Kappa' }, { kind: 'text', text: ' ' }, { kind: 'emote', text: 'Kappa' }] });
  assert.deepEqual(spokenMessage(m, options), { text: '', emoteOnly: true, hasLink: false });
  const mixed = message('hallo Kappa', { fragments: [{ kind: 'text', text: 'hallo ' }, { kind: 'emote', text: 'Kappa' }] });
  assert.equal(spokenMessage(mixed, options).text, 'hallo');
});

test('emoji are left out', () => {
  assert.equal(spokenMessage(message('gg 👍🏽🔥 wp'), options).text, 'gg wp');
  assert.equal(spokenMessage(message('😂😂😂'), options).emoteOnly, true);
});

test('links become a word, or are removed', () => {
  assert.equal(spokenMessage(message('schau mal https://example.com/x?y=1 an'), options).text, 'schau mal Link an');
  assert.equal(spokenMessage(message('auf twitch.tv/maldoe'), options).text, 'auf Link');
  assert.equal(spokenMessage(message('www.test.org'), { ...options, links: 'remove' }).text, '');
  assert.equal(spokenMessage(message('www.test.org'), options).hasLink, true);
  // Not links: an abbreviation, a typo without a space, a decimal number.
  assert.equal(spokenMessage(message('z.B. ok.wie geht 1.5'), options).hasLink, false);
});

test('mentions are read as names', () => {
  const m = message('@Gamer_Max_99 hi', { fragments: [{ kind: 'mention', text: '@Gamer_Max_99' }, { kind: 'text', text: ' hi' }] });
  assert.equal(spokenMessage(m, options).text, 'Gamer Max hi');
});

test('repeats are shortened, numbers stay', () => {
  assert.equal(collapseRepeats('neeeeeein!!!!!!'), 'neeein!!!');
  assert.equal(collapseRepeats('lol lol lol lol lol'), 'lol lol lol');
  assert.equal(collapseRepeats('1000000 Punkte'), '1000000 Punkte');
});

test('only punctuation is nothing to read', () => {
  assert.equal(spokenMessage(message('?!?'), options).text, '');
});

test('long messages are cut at a word', () => {
  assert.equal(shorten('eins zwei drei vier fünf', 15), 'eins zwei drei …');
  assert.equal(shorten('kurz', 15), 'kurz');
});

test('names are read as words', () => {
  assert.equal(spokenName('Gamer_Max_1234', 'gamer_max_1234', true), 'Gamer Max');
  assert.equal(spokenName('MaldoeTV', 'maldoetv', true), 'Maldoe TV');
  assert.equal(spokenName('Maldö', 'maldoe', true), 'Maldö');
  assert.equal(spokenName('12345', '12345', true), '12345');
  assert.equal(spokenName('Gamer_Max_1234', 'gamer_max_1234', false), 'Gamer_Max_1234');
  // Another script: the login is read instead.
  assert.equal(spokenName('配信者', 'haishin_sha', true), 'haishin sha');
});
