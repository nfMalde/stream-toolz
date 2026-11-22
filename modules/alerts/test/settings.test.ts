import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, defaultSettings, isSoundName, normalizeSettings } from '../src/settings';

test('the defaults are complete and valid as they are', () => {
  assert.deepEqual(normalizeSettings(DEFAULT_SETTINGS), DEFAULT_SETTINGS);
  assert.deepEqual(defaultSettings('de-DE'), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings('nonsense'), DEFAULT_SETTINGS);
  assert.deepEqual(normalizeSettings({ events: [] }), DEFAULT_SETTINGS);
});

test('sound names are file names only: no paths, no "..", nothing odd', () => {
  for (const bad of ['../x.wav', '..', '.', 'a/b.wav', 'C:\\x.wav', 'a b.wav', 'ü.wav', 'x'.repeat(121), 'a\nb.wav', 42, null]) {
    assert.equal(isSoundName(bad), false, String(bad));
    assert.equal(normalizeSettings({ events: { follow: { sound: bad } } }).events.follow.sound, '', String(bad));
  }
  const base = normalizeSettings({ events: { follow: { sound: 'beep.wav' } } });
  assert.equal(base.events.follow.sound, 'beep.wav');
  // An invalid new name keeps the old one; '' means no sound.
  assert.equal(normalizeSettings({ events: { follow: { sound: '../x' } } }, base).events.follow.sound, 'beep.wav');
  assert.equal(normalizeSettings({ events: { follow: { sound: '' } } }, base).events.follow.sound, '');
  for (const good of ['a.wav', 'My_Sound-2.MP3', 'a..b.ogg', '.hidden.wav']) assert.equal(isSoundName(good), true, good);
});

test('every event keeps its own values within the ranges', () => {
  const s = normalizeSettings({
    events: {
      follow: { enabled: false, text: ' Hallo\u0007 {name} ', durationSeconds: 99, volume: -5 },
      raid: { durationSeconds: 1, volume: '50', text: 'x'.repeat(200) },
      bogus: { enabled: false },
    },
  });
  assert.deepEqual(s.events.follow, { enabled: false, text: 'Hallo  {name}', sound: '', durationSeconds: 60, volume: 0 });
  assert.equal(s.events.raid.durationSeconds, 2);
  assert.equal(s.events.raid.volume, 50);
  assert.equal(s.events.raid.text.length, 160);
  assert.deepEqual(s.events.sub, DEFAULT_SETTINGS.events.sub);
  assert.equal('bogus' in s.events, false);
});

test('limits, style and the device are checked', () => {
  const s = normalizeSettings({
    followLimitPerMinute: 1000,
    minRaidViewers: -3,
    style: { fontSize: 8, fontFamily: 'comic', textColor: '#ABC', accentColor: 'red', background: 'transparent', position: 'left', animation: 'pop', showMessage: 'yes' },
    deviceOutput: true,
    deviceId: 'abc/def',
  });
  assert.equal(s.followLimitPerMinute, 60);
  assert.equal(s.minRaidViewers, 0);
  assert.deepEqual(s.style, { ...DEFAULT_SETTINGS.style, fontSize: 16, textColor: '#abc', background: 'transparent', animation: 'pop' });
  assert.equal(s.deviceOutput, true);
  assert.equal(s.deviceId, '');
  assert.equal(normalizeSettings({ style: { background: '#0D0A07CC' } }).style.background, '#0d0a07cc');
  assert.equal(normalizeSettings({ deviceId: 'default' }).deviceId, 'default');
});
