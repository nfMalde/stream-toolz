import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ChannelEvent, ChannelEventKind } from '@stream-toolz/twitch';
import { renderAlert, sampleEvent } from '../src/queue';
import { DEFAULT_SETTINGS, normalizeSettings } from '../src/settings';
import { alertTexts, defaultAlertText, fillAlertText } from '../src/texts';

function event(kind: ChannelEventKind, change: Partial<ChannelEvent> = {}): ChannelEvent {
  return { id: `id-${kind}`, kind, userId: '1', login: 'anna', name: 'Anna', count: 0, months: 0, tier: '', prime: false, receivedAt: 0, ...change };
}

test('every kind has a German and an English text; the forms for one change the words', () => {
  const de = alertTexts('de-DE');
  const en = alertTexts('en');
  for (const kind of ['follow', 'sub', 'prime', 'resub', 'gift', 'communityGift', 'raid'] as const) {
    assert.ok(de.events[kind].includes('{name}'), kind);
    assert.ok(en.events[kind].includes('{name}'), kind);
    assert.notEqual(de.events[kind], en.events[kind], kind);
  }
  assert.equal(defaultAlertText('raid', 'de', 1), '{name} raidet mit einem Zuschauer!');
  assert.equal(defaultAlertText('raid', 'de', 2), '{name} raidet mit {count} Zuschauern!');
  assert.equal(defaultAlertText('communityGift', 'en', 1), '{name} gifted a sub!');
  assert.equal(defaultAlertText('communityGift', 'en', 5), '{name} gifted {count} subs!');
  assert.equal(defaultAlertText('follow', 'fr'), defaultAlertText('follow', 'en'));
});

test('placeholders are filled; unknown ones and braces in values stay', () => {
  assert.equal(fillAlertText('{name} → {recipient} ({tier}, {count}, {months}) {x}', { name: 'A{b}', count: '3', months: '12', recipient: 'Ben', tier: 'Stufe 2' }), 'A{b} → Ben (Stufe 2, 3, 12) {x}');
});

test('alerts are rendered in both languages, with the count forms', () => {
  const s = DEFAULT_SETTINGS;
  assert.equal(renderAlert(event('follow'), s, 'de').title, 'Anna folgt jetzt!');
  assert.equal(renderAlert(event('follow'), s, 'en').title, 'Anna just followed!');
  assert.equal(renderAlert(event('sub'), s, 'de').title, 'Anna hat abonniert!');
  assert.equal(renderAlert(event('prime', { prime: true }), s, 'en').title, 'Anna subscribed with Prime!');
  assert.equal(renderAlert(event('resub', { months: 7 }), s, 'de').title, 'Anna ist seit 7 Monaten dabei!');
  assert.equal(renderAlert(event('resub', { months: 1 }), s, 'en').title, 'Anna has been subscribed for one month!');
  assert.equal(renderAlert(event('gift', { count: 1, recipient: { login: 'ben', name: 'Ben' } }), s, 'de').title, 'Anna verschenkt ein Abo an Ben!');
  assert.equal(renderAlert(event('communityGift', { count: 1 }), s, 'de').title, 'Anna verschenkt ein Abo!');
  assert.equal(renderAlert(event('communityGift', { count: 10 }), s, 'en').title, 'Anna gifted 10 subs!');
  assert.equal(renderAlert(event('raid', { count: 1 }), s, 'en').title, 'Anna is raiding with one viewer!');
  assert.equal(renderAlert(event('raid', { count: 42 }), s, 'de').title, 'Anna raidet mit 42 Zuschauern!');
});

test('own texts win; the tier, an anonymous gifter and the resub message', () => {
  const s = normalizeSettings({ events: { sub: { text: '{name} ist dabei ({tier})' }, communityGift: { text: '{tier}: {count} von {name}' } } });
  assert.equal(renderAlert(event('sub', { tier: '2000' }), s, 'de').title, 'Anna ist dabei (Stufe 2)');
  assert.equal(renderAlert(event('sub', { tier: '2000' }), s, 'en').title, 'Anna ist dabei (Tier 2)');
  assert.equal(renderAlert(event('sub', { prime: true }), s, 'en').title, 'Anna ist dabei (Prime)');
  assert.equal(renderAlert(event('sub', { tier: 'weird' }), s, 'en').title, 'Anna ist dabei ()');
  assert.equal(renderAlert(event('communityGift', { count: 3, tier: '1000', name: '', login: '' }), s, 'de').title, 'Stufe 1: 3 von Jemand');
  assert.equal(renderAlert(event('communityGift', { count: 3, name: '', login: '' }), DEFAULT_SETTINGS, 'en').title, 'Someone gifted 3 subs!');

  const message = { id: 'm', userId: '1', login: 'anna', name: 'Anna', text: '  Bester Stream! '.padEnd(400, 'x'), fragments: [], roles: { broadcaster: false, moderator: false, vip: false, subscriber: true }, bits: 0, fromOtherChannel: false, receivedAt: 0 };
  const resub = renderAlert(event('resub', { months: 2, message }), DEFAULT_SETTINGS, 'de');
  assert.ok(resub.message?.startsWith('Bester Stream!'));
  assert.equal(resub.message?.length, 200);
  const hidden = renderAlert(event('resub', { months: 2, message }), normalizeSettings({ style: { showMessage: false } }), 'de');
  assert.equal(hidden.message, undefined);
  const empty = renderAlert(event('resub', { months: 2, message: { ...message, text: '   ' } }), DEFAULT_SETTINGS, 'de');
  assert.equal(empty.message, undefined);
});

test('the sample events of the test buttons', () => {
  const s = DEFAULT_SETTINGS;
  assert.equal(renderAlert(sampleEvent('follow', 'de', 't1'), s, 'de').title, 'Maldö folgt jetzt!');
  assert.equal(renderAlert(sampleEvent('prime', 'en', 't2'), s, 'en').title, 'Maldö subscribed with Prime!');
  const resub = renderAlert(sampleEvent('resub', 'en', 't3'), s, 'en');
  assert.equal(resub.title, 'Maldö has been subscribed for 12 months!');
  assert.equal(resub.message, 'Best stream!');
  assert.equal(resub.test, true);
  assert.equal(renderAlert(sampleEvent('gift', 'de', 't4'), s, 'de').title, 'Maldö verschenkt ein Abo an Chat!');
  assert.equal(renderAlert(sampleEvent('communityGift', 'de', 't5'), s, 'de').title, 'Maldö verschenkt 5 Abos!');
  assert.equal(renderAlert(sampleEvent('raid', 'en', 't6'), s, 'en').title, 'Maldö is raiding with 42 viewers!');
});
