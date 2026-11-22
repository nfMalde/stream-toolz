import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILT_IN_PACKS } from '../src/built-in-packs';
import { DEFAULT_SETTINGS, defaultSettings, normalizeSettings } from '../src/settings';

test('invalid hotkeys keep the previous value, others are taken', () => {
  const s = normalizeSettings({ hotkeys: { pause: 'F13', skip: 'S', clear: 'Control+Shift+F11', other: 'F1' } });
  assert.deepEqual(s.hotkeys, { pause: 'F13', skip: DEFAULT_SETTINGS.hotkeys.skip, clear: 'Control+Shift+F11' });
});

test('a config from before keeps its voice, for its main language', () => {
  const old = normalizeSettings({ voiceId: 'Microsoft Stefan', speechLanguage: 'de-DE' });
  assert.deepEqual(old.voices, { de: 'Microsoft Stefan', en: '' });
  assert.equal(DEFAULT_SETTINGS.readNames, 'always');
});

test('voices are kept per pack id, also for a pack that is not loaded right now', () => {
  const now = normalizeSettings({ voices: { de: 'piper:de_DE-ramona-low', en: 'kokoro:af_heart', fr: 'Microsoft Hortense', 'pt-br': 'x', DE: 'y', 'bad id': 'z', es: 'a|b' } });
  assert.deepEqual(now.voices, { de: 'piper:de_DE-ramona-low', en: 'kokoro:af_heart', fr: 'Microsoft Hortense', 'pt-br': 'x' });
  // An unknown key in the base stays when the change does not name it.
  const kept = normalizeSettings({ voices: { de: 'Microsoft Stefan' } }, now);
  assert.equal(kept.voices['fr'], 'Microsoft Hortense');
});

test('the main language is any locale; first start takes the system language if a pack covers it', () => {
  assert.equal(normalizeSettings({ speechLanguage: 'pt-BR' }).speechLanguage, 'pt-BR');
  assert.equal(normalizeSettings({ speechLanguage: 'zh-Hant-TW' }).speechLanguage, 'zh-Hant-TW');
  assert.equal(normalizeSettings({ speechLanguage: 'nope!' }).speechLanguage, DEFAULT_SETTINGS.speechLanguage);
  assert.equal(defaultSettings('de-AT', BUILT_IN_PACKS).speechLanguage, 'de-DE');
  assert.equal(defaultSettings('en-GB', BUILT_IN_PACKS).speechLanguage, 'en-US');
  assert.equal(defaultSettings('fr-FR', BUILT_IN_PACKS).speechLanguage, 'en-US');
});

test('nicknames and pronunciations are cleaned', () => {
  const s = normalizeSettings({
    nicknames: { '@Xx_Dark_Lord_xX': ' Lord ', 'no spaces allowed': 'x', empty: '', bad: 42 },
    pronunciations: { GG: 'good game', 'two words': 'x', o7: 'Salut\u0007' },
  });
  assert.deepEqual(s.nicknames, { xx_dark_lord_xx: 'Lord' });
  assert.deepEqual(s.pronunciations, { gg: 'good game', o7: 'Salut' });
});
