import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUILT_IN_PACKS } from '../src/built-in-packs';
import { detectLanguage, localeOf, mainLanguage } from '../src/language';
import type { LanguagePack } from '../src/language-pack';

const packs = BUILT_IN_PACKS;

/** A third pack for the tests, with only what detection and the reader need. */
function pack(id: string, locale: string, words: string[], letters = ''): LanguagePack {
  const en = packs.find((p) => p.id === 'en')!;
  return { id, name: id, locale, words, letters, texts: en.texts, pronounce: {}, builtIn: false };
}

test('typical German chat lines', () => {
  for (const line of ['Hallo zusammen, wie geht es euch?', 'Das ist echt krass', 'Grüße aus München', 'Was geht ab?', 'Ich bin müde', 'moin moin', 'danke für den Stream!', 'Hast du schon gegessen', 'gute Nacht', 'toll gemacht', 'stimmt', 'passt schon', 'Das ist great'])
    assert.equal(detectLanguage(line, packs), 'de', line);
});

test('typical English chat lines', () => {
  for (const line of ['Hello everyone, how are you doing?', "I don't know what to do", 'What is going on?', 'this game is so good', "let's go guys", 'hello Maldö how are you', "that's crazy", 'ok great', 'great stream', 'awesome', 'welcome back', 'good morning everyone', 'sounds good', 'well played'])
    assert.equal(detectLanguage(line, packs), 'en', line);
});

test('short or mixed lines stay undecided (the main language reads them)', () => {
  for (const line of ['gg', 'lol', 'nice', 'KEKW', 'o7', '', 'stream', 'hey bro', 'ok', 'okay', 'super', 'cool', 'sorry']) assert.equal(detectLanguage(line, packs), undefined, line);
});

test('a third pack is detected by its words and letters; a word in two packs counts for none', () => {
  // "das" is in the German pack too: listed in both, it must count for neither; "bin" (German only) stays German.
  const es = pack('es', 'es-ES', ['hola', 'gracias', 'muy', 'bueno', 'que', 'das', 'por', 'todos'], 'ñáéíóú');
  const three = [...packs, es];
  assert.equal(detectLanguage('hola a todos, muy bueno', three), 'es');
  assert.equal(detectLanguage('¿qué tal, señor?', three), 'es');
  assert.equal(detectLanguage('Ich bin müde', three), 'de');
  assert.equal(detectLanguage('this game is so good', three), 'en');
  // "das" alone decides nothing with the Spanish pack loaded; without it, it is German.
  assert.equal(detectLanguage('das', three), undefined);
  assert.equal(detectLanguage('das', packs), 'de');
});

test('a script names its language when a pack for it is loaded', () => {
  const ru = pack('ru', 'ru-RU', []);
  const ja = pack('ja', 'ja-JP', []);
  const three = [...packs, ru, ja];
  assert.equal(detectLanguage('привет всем', three), 'ru');
  assert.equal(detectLanguage('こんにちは', three), 'ja');
  // Without a Cyrillic pack, Cyrillic text stays undecided.
  assert.equal(detectLanguage('привет всем', packs), undefined);
  // Han alone is Chinese when such a pack is loaded; with only a Japanese pack it goes there.
  const zh = pack('zh', 'zh-CN', []);
  assert.equal(detectLanguage('你好', [...packs, ja, zh]), 'zh');
  assert.equal(detectLanguage('你好', [...packs, ja]), 'ja');
});

test('the main language is the pack of the locale, else English', () => {
  assert.equal(mainLanguage('de-DE', packs), 'de');
  assert.equal(mainLanguage('de-AT', packs), 'de');
  assert.equal(mainLanguage('en-GB', packs), 'en');
  assert.equal(mainLanguage('fr-FR', packs), 'en');
  assert.equal(mainLanguage('fr-FR', [...packs, pack('fr', 'fr-FR', [])]), 'fr');
  assert.equal(localeOf('de', packs), 'de-DE');
  assert.equal(localeOf('pt-br', packs), 'pt-br');
});
