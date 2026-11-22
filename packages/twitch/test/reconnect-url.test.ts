import assert from 'node:assert/strict';
import { test } from 'node:test';
import { reconnectUrl } from '../src/eventsub';

test('a reconnect goes only to Twitch EventSub over wss', () => {
  assert.equal(reconnectUrl('wss://eventsub.wss.twitch.tv/ws?challenge=abc'), 'wss://eventsub.wss.twitch.tv/ws?challenge=abc');
  assert.equal(reconnectUrl('wss://cell-a.eventsub.wss.twitch.tv/ws'), 'wss://cell-a.eventsub.wss.twitch.tv/ws');
  assert.equal(reconnectUrl('wss://evil.example/ws'), undefined);
  assert.equal(reconnectUrl('wss://eventsub.wss.twitch.tv.evil.example/ws'), undefined);
  assert.equal(reconnectUrl('ws://eventsub.wss.twitch.tv/ws'), undefined);
  assert.equal(reconnectUrl('https://eventsub.wss.twitch.tv/ws'), undefined);
  assert.equal(reconnectUrl('wss://'), undefined);
  assert.equal(reconnectUrl({ href: 'wss://eventsub.wss.twitch.tv/ws' }), undefined);
  assert.equal(reconnectUrl(undefined), undefined);
});
