import assert from 'node:assert/strict';
import { test } from 'node:test';
import { joinWithPauses, parseWav, trimSilence, wavDuration, wavFile } from '../src/wav';

const RATE = 16000;

/** Mono 16-bit samples: silence, then a tone, then silence (seconds each). */
function clip(before: number, tone: number, after: number, amplitude = 8000): Buffer {
  const data = Buffer.alloc((before + tone + after) * RATE * 2);
  for (let i = 0; i < tone * RATE; i++) data.writeInt16LE(Math.round(Math.sin(i / 10) * amplitude), (before * RATE + i) * 2);
  return wavFile(data, RATE);
}

test('wavFile writes a header parseWav reads back', () => {
  const wav = parseWav(wavFile(Buffer.alloc(RATE * 2), RATE));
  assert.deepEqual(wav, { format: 1, channels: 1, sampleRate: RATE, bitsPerSample: 16, dataStart: 44, dataLength: RATE * 2 });
  assert.equal(wavDuration(wavFile(Buffer.alloc(RATE * 2), RATE)), 1);
});

test('parseWav skips unknown chunks and refuses other files', () => {
  const plain = wavFile(Buffer.alloc(100), RATE);
  const list = Buffer.alloc(8 + 5 + 1); // odd-sized chunk plus its pad byte
  list.write('LIST', 0, 'ascii');
  list.writeUInt32LE(5, 4);
  const withList = Buffer.concat([plain.subarray(0, 36), list, plain.subarray(36)]);
  assert.equal(parseWav(withList).dataLength, 100);
  assert.equal(parseWav(withList).dataStart, 44 + list.length);
  // A data chunk claiming more than the file has is cut to the file.
  const truncated = plain.subarray(0, 44 + 60);
  assert.equal(parseWav(truncated).dataLength, 60);

  assert.throws(() => parseWav(Buffer.from('not a wav file at all')), /Not a WAV/);
  assert.throws(() => parseWav(Buffer.from('RIFF\0\0\0\0WAVE')), /without fmt/);
  assert.throws(() => wavDuration(Buffer.alloc(0)), /Not a WAV/);
});

test('joinWithPauses puts silence between clips of one format', () => {
  const one = wavFile(Buffer.alloc(RATE * 2), RATE);
  assert.equal(joinWithPauses([one], [0.5]), one);
  const joined = joinWithPauses([one, one, one], [0.5, 0.25])!;
  assert.equal(wavDuration(joined), 3.75);
  assert.equal(joinWithPauses([one, wavFile(Buffer.alloc(100), 22050)], [0.5]), undefined);
});

test('trimSilence cuts the quiet start and end and keeps the sound', () => {
  const trimmed = trimSilence(clip(0.5, 0.2, 0.5));
  const seconds = wavDuration(trimmed);
  assert.ok(seconds >= 0.2 && seconds < 0.35, `kept ${seconds} s`);
  // Fades: the first and last samples are near zero, the middle is not.
  const wav = parseWav(trimmed);
  assert.ok(Math.abs(trimmed.readInt16LE(wav.dataStart)) < 100);
  assert.ok(Math.abs(trimmed.readInt16LE(wav.dataStart + wav.dataLength - 2)) < 100);
  let peak = 0;
  for (let i = 0; i < wav.dataLength / 2; i++) peak = Math.max(peak, Math.abs(trimmed.readInt16LE(wav.dataStart + i * 2)));
  assert.ok(peak > 7000);
});

test('trimSilence leaves other formats alone', () => {
  const stereo = wavFile(Buffer.alloc(100), RATE);
  stereo.writeUInt16LE(2, 22);
  assert.equal(trimSilence(stereo), stereo);
});
