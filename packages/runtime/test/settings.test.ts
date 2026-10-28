import assert from 'node:assert/strict';
import { test } from 'node:test';
import { DEFAULT_SETTINGS, isValidHotkey, normalizeSettings } from '../src/settings';

test('hotkeys: modifiers with a key, function and number pad keys alone, nothing that breaks typing', () => {
  for (const ok of ['', 'Control+Shift+F9', 'F13', 'F24', 'Alt+num1', 'num5', 'Control+Alt+S', 'Shift+Space', 'Super+PageDown']) assert.ok(isValidHotkey(ok), ok);
  for (const bad of ['S', 'Space', 'Enter', 'Control+', 'Control+Shift', 'Ctrl+F9', 'F25', 'Control+ü', 'Alt+F4; rm']) assert.ok(!isValidHotkey(bad), bad);
});

test('invalid hotkeys keep the previous value, others are taken', () => {
  const s = normalizeSettings({ hotkeys: { pause: 'F13', skip: 'S', clear: 'Control+Shift+F11', other: 'F1' } });
  assert.deepEqual(s.hotkeys, { pause: 'F13', skip: DEFAULT_SETTINGS.hotkeys.skip, clear: 'Control+Shift+F11' });
});

test('a config from before keeps its voice, for its main language', () => {
  const old = normalizeSettings({ voiceId: 'Microsoft Stefan', speechLanguage: 'de-DE' });
  assert.deepEqual(old.voices, { de: 'Microsoft Stefan', en: '' });
  const now = normalizeSettings({ voices: { de: 'piper:de_DE-ramona-low', en: 'kokoro:af_heart', fr: 'x' } });
  assert.deepEqual(now.voices, { de: 'piper:de_DE-ramona-low', en: 'kokoro:af_heart' });
  assert.equal(DEFAULT_SETTINGS.readNames, 'always');
});

test('nicknames and pronunciations are cleaned', () => {
  const s = normalizeSettings({
    nicknames: { '@Xx_Dark_Lord_xX': ' Lord ', 'no spaces allowed': 'x', empty: '', bad: 42 },
    pronunciations: { GG: 'good game', 'two words': 'x', o7: 'Salut\u0007' },
  });
  assert.deepEqual(s.nicknames, { xx_dark_lord_xx: 'Lord' });
  assert.deepEqual(s.pronunciations, { gg: 'good game', o7: 'Salut' });
});
