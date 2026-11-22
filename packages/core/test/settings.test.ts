import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_APP_SETTINGS, defaultAppSettings, normalizeAppSettings } from '../src/settings';

test('app settings: the channel as typed, the port within range, invalid values keep the previous one', () => {
  const s = normalizeAppSettings({ language: 'fr', channel: 'https://www.twitch.tv/Maldoe/videos', serverPort: 80, streamerMode: 'yes' });
  assert.deepEqual(s, { ...DEFAULT_APP_SETTINGS, language: 'fr', channel: 'maldoe', serverPort: 1024 });
  const kept = normalizeAppSettings({ language: 'deutsch', channel: 'not a name!' }, { ...DEFAULT_APP_SETTINGS, language: 'en', channel: 'old' });
  assert.equal(kept.language, 'en');
  assert.equal(kept.channel, 'old');
  assert.equal(normalizeAppSettings({ channel: '' }, { ...DEFAULT_APP_SETTINGS, channel: 'old' }).channel, '');
});

test('first start: the app in the system language', () => {
  assert.equal(defaultAppSettings('de-AT').language, 'de');
  assert.equal(defaultAppSettings('en-US').language, 'en');
  assert.equal(defaultAppSettings('fr-FR').language, 'en');
});
