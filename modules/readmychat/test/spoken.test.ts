import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILT_IN_PACKS } from '../src/built-in-packs';
import type { LanguagePack } from '../src/language-pack';
import { defaultEventText, readingPack, spokenTexts } from '../src/spoken';

const packs = BUILT_IN_PACKS;

test('the texts come from the pack of the id or locale; English for a language without a pack', () => {
  assert.equal(spokenTexts('de', packs).says, '{name} sagt: {message}');
  assert.equal(spokenTexts('de-DE', packs).says, '{name} sagt: {message}');
  assert.equal(spokenTexts('de-CH', packs).link, 'Link');
  assert.equal(spokenTexts('en-GB', packs).says, '{name} says: {message}');
  assert.equal(spokenTexts('fr-FR', packs).says, '{name} says: {message}');
  assert.equal(spokenTexts('', packs).says, '{name} says: {message}');
});

test('a third pack brings its own texts and pronunciations', () => {
  const en = packs.find((p) => p.id === 'en')!;
  const fr: LanguagePack = { ...en, id: 'fr', name: 'Français', locale: 'fr-FR', builtIn: false, texts: { ...en.texts, says: '{name} dit : {message}', link: 'lien' }, pronounce: { gg: 'bien joué' } };
  const three = [...packs, fr];
  assert.equal(spokenTexts('fr', three).says, '{name} dit : {message}');
  assert.equal(readingPack('fr-CA', three).pronounce['gg'], 'bien joué');
  assert.deepEqual(readingPack('de', three).pronounce, {});
});

test('event texts: the form for one where the words change', () => {
  assert.equal(defaultEventText('raid', 'de-DE', 1, packs), '{name} raidet den Kanal mit einem Zuschauer. Willkommen!');
  assert.equal(defaultEventText('raid', 'de-DE', 12, packs), '{name} raidet den Kanal mit {count} Zuschauern. Willkommen!');
  assert.equal(defaultEventText('follow', 'en', 1, packs), '{name} just followed. Welcome!');
  assert.equal(defaultEventText('communityGift', 'en-US', 1, packs), '{name} is gifting a sub to the community. Thank you!');
});

test('without any pack there is still something to say (never in the app)', () => {
  assert.equal(spokenTexts('de', []).says, '{name}: {message}');
  assert.equal(readingPack('de', []).texts.link, 'link');
});
