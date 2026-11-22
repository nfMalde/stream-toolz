import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { VoiceChoice } from '../src/api';
import { defaultVoiceId, isExternalVoice, openSpeech } from '../src/voices';

const voice = (id: string, engine: VoiceChoice['engine'], language: string, installed = true): VoiceChoice => ({ id, engine, language, installed });

test('isExternalVoice knows the optional engines', () => {
  assert.equal(isExternalVoice('piper:de_DE-ramona-low'), true);
  assert.equal(isExternalVoice('kokoro:af_heart'), true);
  assert.equal(isExternalVoice('vits:css10-de'), true);
  assert.equal(isExternalVoice('Microsoft Katja'), false);
  assert.equal(isExternalVoice(''), false);
});

test('defaultVoiceId prefers an installed Piper voice, then a sherpa-onnx voice, then OneCore, for the language', () => {
  const voices = [
    voice('Microsoft Hedda', 'sapi', 'de-DE'),
    voice('Microsoft Katja', 'onecore', 'de-DE'),
    voice('kokoro:af_heart', 'sherpa', 'en-US'),
    voice('piper:de_DE-ramona-low', 'piper', 'de-DE', false),
    voice('vits:css10-de', 'sherpa', 'de-DE'),
    voice('piper:en_US-john-medium', 'piper', 'en-US'),
  ];
  assert.equal(defaultVoiceId('de-DE', voices), 'vits:css10-de');
  assert.equal(defaultVoiceId('en', voices), 'piper:en_US-john-medium');
  assert.equal(defaultVoiceId('de', voices.filter((v) => v.engine !== 'sherpa')), 'Microsoft Katja');
  assert.equal(defaultVoiceId('de', voices.filter((v) => v.engine === 'sapi')), 'Microsoft Hedda');
  assert.equal(defaultVoiceId('fr', voices), '');
});

test('openSpeech refuses optional voices that are not allowed or not installed', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-voices-'));
  try {
    const options = { locale: 'de-DE', voicesDir: dir, workDir: path.join(dir, 'work'), rate: 0, pauses: { comma: 0.3, sentence: 0.6 } };
    await assert.rejects(openSpeech({ ...options, id: 'piper:from_somewhere-else' }), /not allowed/);
    await assert.rejects(openSpeech({ ...options, id: 'piper:de_DE-ramona-low' }), /not installed/);
    // Kokoro left the catalogue on 2026-10-28 (docs/05-release-check.md): a stored id of it is "not allowed" now.
    await assert.rejects(openSpeech({ ...options, id: 'kokoro:af_heart' }), /not allowed/);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
