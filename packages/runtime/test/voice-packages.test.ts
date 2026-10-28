import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sherpaArgs } from '../src/speech/sherpa';
import { allowedVoiceIds, readVoicePackages } from '../src/speech/voice-packages';
import { isExternalVoice } from '../src/speech/voices';

test('chat text reaches sherpa-onnx only as text, never as an option', () => {
  for (const format of ['kokoro', 'vits'] as const) {
    const args = sherpaArgs(format, 'C:/voices/model', { sid: 0, language: 'en-US', lengthScale: 1, outputFile: 'C:/work/clip.wav' }, '--output-filename=C:/Users/x/evil.wav');
    assert.equal(args.at(-1), '--output-filename=C:/Users/x/evil.wav');
    assert.equal(args.at(-2), '--');
    assert.equal(args.filter((a) => a.startsWith('--output-filename=')).length, 2);
    assert.equal(args.indexOf('--output-filename=C:/work/clip.wav') < args.indexOf('--'), true);
  }
});

test('the voice catalogue downloads only pinned files with a checksum, from the original sources', () => {
  const all = readVoicePackages('win32-x64').packages.concat(readVoicePackages('linux-x64').packages);
  for (const pkg of all) {
    assert.ok(pkg.license.trim(), `${pkg.id}: license`);
    assert.ok(pkg.source.startsWith('https://'), `${pkg.id}: source`);
    for (const file of pkg.files) {
      const url = new URL(file.url);
      assert.equal(url.protocol, 'https:', file.url);
      assert.match(file.sha256, /^[0-9a-f]{64}$/, file.url);
      assert.ok(file.size > 0, file.url);
      if (url.hostname === 'huggingface.co') assert.match(url.pathname, /\/resolve\/[0-9a-f]{40}\//, `${file.url}: pinned revision`);
      else assert.ok(url.hostname === 'github.com' && url.pathname.includes('/releases/download/'), `${file.url}: a release download`);
      // Targets stay inside the voices folder.
      for (const target of [file.to, file.extract?.to, file.extract?.from].filter((t): t is string => !!t)) {
        assert.ok(!target.split('/').includes('..') && !/^([a-z]:|\/)/i.test(target), `${pkg.id}: ${target}`);
      }
      for (const name of file.extract?.keep ?? []) assert.match(name, /^[\w-][\w.-]*$/, `${pkg.id}: keep ${name}`);
    }
  }
  const ids = allowedVoiceIds().map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, 'voice ids are unique');
  for (const id of ids) assert.ok(isExternalVoice(id), `${id} is recognised as an optional voice`);
});

test('the new voices are in the catalogue: English Piper voices from scratch and CSS10 German', () => {
  const ids = allowedVoiceIds().map((v) => v.id);
  for (const id of ['piper:en_GB-cori-high', 'piper:en_US-ljspeech-high', 'piper:en_US-kristin-medium', 'piper:en_US-norman-medium', 'piper:en_US-john-medium', 'vits:css10-de']) {
    assert.ok(ids.includes(id), id);
  }
  const css10 = readVoicePackages('win32-x64').packages.find((p) => p.id === 'vits-css10-de');
  assert.deepEqual(css10?.files[0]?.extract?.keep, ['model.onnx', 'tokens.txt']);
});
