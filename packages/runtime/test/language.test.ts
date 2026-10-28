import assert from 'node:assert/strict';
import { test } from 'node:test';
import { detectLanguage } from '../src/chat/language';

test('typical German chat lines', () => {
  for (const line of ['Hallo zusammen, wie geht es euch?', 'Das ist echt krass', 'Grüße aus München', 'Was geht ab?', 'Ich bin müde', 'moin moin', 'danke für den Stream!', 'Hast du schon gegessen', 'gute Nacht', 'toll gemacht', 'stimmt', 'passt schon', 'Das ist great'])
    assert.equal(detectLanguage(line), 'de', line);
});

test('typical English chat lines', () => {
  for (const line of ['Hello everyone, how are you doing?', "I don't know what to do", 'What is going on?', 'this game is so good', "let's go guys", 'hello Maldö how are you', "that's crazy", 'ok great', 'great stream', 'awesome', 'welcome back', 'good morning everyone', 'sounds good', 'well played'])
    assert.equal(detectLanguage(line), 'en', line);
});

test('short or mixed lines stay undecided (the main language reads them)', () => {
  for (const line of ['gg', 'lol', 'nice', 'KEKW', 'o7', '', 'stream', 'hey bro', 'ok', 'okay', 'super', 'cool', 'sorry']) assert.equal(detectLanguage(line), undefined, line);
});
