import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { readFreshFile, Speech, speechParts, withFinalMark, type Renderer } from '../src/speech';
import { wavDuration, wavFile } from '../src/wav';

const RATE = 16000;

/** A renderer that writes a tenth of a second of tone per text and remembers what it got. */
class FakeRenderer implements Renderer {
  readonly texts: string[] = [];
  alive = true;
  async render(text: string, outputFile: string): Promise<void> {
    this.texts.push(text);
    if (text.includes('FAIL')) throw new Error('engine failed');
    const data = Buffer.alloc(RATE * 0.1 * 2);
    for (let i = 0; i < data.length / 2; i++) data.writeInt16LE(Math.round(Math.sin(i / 10) * 8000), i * 2);
    await fs.promises.writeFile(outputFile, wavFile(data, RATE));
  }
  close(): void {
    this.alive = false;
  }
}

test('withFinalMark adds a period when the text does not end', () => {
  assert.equal(withFinalMark('Hallo Welt'), 'Hallo Welt.');
  assert.equal(withFinalMark('  Hallo Welt!  '), 'Hallo Welt!');
  assert.equal(withFinalMark('eins,'), 'eins,');
});

test('speechParts splits after sentences and commas, keeping short pieces together', () => {
  assert.deepEqual(speechParts('Hallo Welt, wie geht es dir? Gut'), [
    { text: 'Hallo Welt, wie geht es dir?', end: 'sentence' },
    { text: 'Gut.', end: 'none' },
  ]);
  assert.deepEqual(speechParts('Das ist ein Satz, und das ist noch einer.'), [
    { text: 'Das ist ein Satz,', end: 'comma' },
    { text: 'und das ist noch einer.', end: 'none' },
  ]);
  // "1,7" has no space after the comma and stays one piece.
  assert.deepEqual(speechParts('Es sind 1,7 Grad'), [{ text: 'Es sind 1,7 Grad.', end: 'none' }]);
  // Sentences always split; only a comma waits for enough words on both sides.
  assert.deepEqual(speechParts('Ja? Nein! Vielleicht.'), [
    { text: 'Ja?', end: 'sentence' },
    { text: 'Nein!', end: 'sentence' },
    { text: 'Vielleicht.', end: 'none' },
  ]);
  assert.deepEqual(speechParts('Ja, nein, vielleicht'), [{ text: 'Ja, nein, vielleicht.', end: 'none' }]);
});

test('Speech renders the parts one after another, joins them and cleans up', async () => {
  const workDir = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'stz-speech-')), 'work');
  const renderer = new FakeRenderer();
  const speech = new Speech(renderer, 'piper', 'piper:test', workDir, { comma: 0.3, sentence: 0.6 });
  try {
    const [first, second] = await Promise.all([speech.synthesize('Erster Satz hier. Zweiter Satz da, mit einem Nebensatz dran'), speech.synthesize('Kurz')]);
    assert.deepEqual(renderer.texts, ['Erster Satz hier.', 'Zweiter Satz da,', 'mit einem Nebensatz dran.', 'Kurz.']);
    // Three parts of 0.1 s (trimmed a little) plus a sentence pause and a comma pause.
    const seconds = wavDuration(first);
    assert.ok(seconds > 1.1 && seconds < 1.3, `${seconds} s`);
    assert.ok(wavDuration(second) < 0.15);
    assert.deepEqual(fs.readdirSync(workDir), [], 'no part files left behind');
    assert.equal(speech.voiceId, 'piper:test');
    assert.equal(speech.alive, true);

    await assert.rejects(speech.synthesize('FAIL'), /engine failed/);
    // The queue keeps going after a failure.
    assert.ok(wavDuration(await speech.synthesize('Weiter')) > 0);
    speech.close();
    assert.equal(speech.alive, false);
  } finally {
    fs.rmSync(path.dirname(workDir), { recursive: true, force: true });
  }
});

test('readFreshFile reads a file and gives up at once on a missing one', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-fresh-'));
  try {
    fs.writeFileSync(path.join(dir, 'a.wav'), 'RIFF');
    assert.equal((await readFreshFile(path.join(dir, 'a.wav'))).toString(), 'RIFF');
    const started = Date.now();
    await assert.rejects(readFreshFile(path.join(dir, 'missing.wav')), { code: 'ENOENT' });
    assert.ok(Date.now() - started < 1000, 'no retries for a missing file');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a sherpa-onnx voice gets the whole text at once', async () => {
  const workDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-speech-'));
  const renderer = new FakeRenderer();
  const speech = new Speech(renderer, 'sherpa', 'kokoro:x', workDir, { comma: 0.3, sentence: 0.6 });
  try {
    await speech.synthesize('Erster Satz. Zweiter Satz, mit Komma');
    assert.deepEqual(renderer.texts, ['Erster Satz. Zweiter Satz, mit Komma.']);
  } finally {
    fs.rmSync(workDir, { recursive: true, force: true });
  }
});
