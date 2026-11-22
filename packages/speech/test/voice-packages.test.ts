import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { sherpaArgs } from '../src/sherpa';
import { allowedDownloadUrl, allowedVoiceIds, clearLeftovers, insideDir, isInstalled, readVoicePackages, removePackages } from '../src/voice-packages';
import { isExternalVoice } from '../src/voices';

/** Where the voices live, for the target checks. */
const ROOT = path.resolve('voices');

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
      // Targets are never empty (an empty one would have meant the whole voices folder) and stay inside it.
      assert.ok(file.to || file.extract?.to, `${pkg.id}: ${file.url} has a target`);
      if (file.extract) assert.ok(file.extract.from, `${pkg.id}: ${file.url} names the archive's folder`);
      for (const target of [file.to, file.extract?.to, file.extract?.from].filter((t) => t !== undefined)) {
        assert.ok(insideDir(ROOT, target).startsWith(ROOT + path.sep) && !/[\\]/.test(target), `${pkg.id}: ${target}`);
      }
      for (const name of file.extract?.keep ?? []) assert.match(name, /^[\w-][\w.-]*$/, `${pkg.id}: keep ${name}`);
    }
  }
  const ids = allowedVoiceIds().map((v) => v.id);
  assert.equal(new Set(ids).size, ids.length, 'voice ids are unique');
  for (const id of ids) assert.ok(isExternalVoice(id), `${id} is recognised as an optional voice`);
});

test('the catalogue holds the Piper voices and no sherpa-onnx package (left 2026-10-28, docs/05-release-check.md)', () => {
  const ids = allowedVoiceIds().map((v) => v.id);
  for (const id of ['piper:de_DE-ramona-low', 'piper:en_GB-cori-high', 'piper:en_US-ljspeech-high', 'piper:en_US-kristin-medium', 'piper:en_US-norman-medium', 'piper:en_US-john-medium']) {
    assert.ok(ids.includes(id), id);
  }
  assert.ok(!ids.some((id) => /^(kokoro|vits):/.test(id)), 'no sherpa voices');
  assert.ok(!readVoicePackages('win32-x64').packages.some((p) => p.id === 'sherpa-engine'), 'no sherpa engine');
});

test('downloads come only over https from GitHub or Hugging Face, also after a redirect', () => {
  assert.equal(allowedDownloadUrl('https://github.com/rhasspy/piper/releases/download/v1/piper.zip'), true);
  assert.equal(allowedDownloadUrl('https://release-assets.githubusercontent.com/x/y'), true);
  assert.equal(allowedDownloadUrl('https://huggingface.co/rhasspy/piper-voices/resolve/abc/de.onnx'), true);
  assert.equal(allowedDownloadUrl('https://cdn-lfs.hf.co/repos/x'), true);
  assert.equal(allowedDownloadUrl('http://github.com/x'), false);
  assert.equal(allowedDownloadUrl('https://github.com.evil.example/x'), false);
  assert.equal(allowedDownloadUrl('https://example.com/piper.zip'), false);
  assert.equal(allowedDownloadUrl('not a url'), false);
});

test('insideDir refuses empty targets and paths that leave the folder', () => {
  const root = path.resolve('voices');
  assert.equal(insideDir(root, 'piper/engine'), path.join(root, 'piper', 'engine'));
  assert.throws(() => insideDir(root, ''), /not inside/);
  assert.throws(() => insideDir(root, undefined), /not inside/);
  assert.throws(() => insideDir(root, '.'), /not inside/);
  assert.throws(() => insideDir(root, '../other'), /not inside/);
  assert.throws(() => insideDir(root, 'a/../../b'), /not inside/);
  assert.throws(() => insideDir(root, path.resolve('elsewhere')), /not inside/);
});

test('removePackages moves a package out of the way first and clears leftovers of earlier runs', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-packages-'));
  try {
    const manifest = readVoicePackages('win32-x64');
    const voice = manifest.packages.find((p) => p.id === 'piper:en_US-john-medium')!;
    for (const file of voice.files) {
      fs.mkdirSync(path.dirname(path.join(dir, file.to!)), { recursive: true });
      fs.writeFileSync(path.join(dir, file.to!), 'x');
    }
    assert.equal(isInstalled(dir, voice), true);
    fs.mkdirSync(path.join(dir, 'download', 'unpacked-old'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'download', 'old.zip.part'), '');
    fs.writeFileSync(path.join(dir, 'download', 'keep.zip'), '');

    const lines: string[] = [];
    removePackages([voice.id], dir, (line) => lines.push(line), manifest);
    assert.equal(isInstalled(dir, voice), false);
    assert.deepEqual(fs.readdirSync(path.join(dir, 'download')), ['keep.zip'], 'leftovers cleared, a finished download kept');
    assert.ok(lines.some((l) => l.startsWith('removed')));
    assert.throws(() => removePackages(['nope'], dir, () => {}, manifest), /Unknown package/);
    // Nothing else to clear: no error.
    clearLeftovers(dir);
    clearLeftovers(path.join(dir, 'none'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
