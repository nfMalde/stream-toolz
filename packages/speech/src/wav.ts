// WAV files as the voices write them: 16-bit PCM, mono. No dependencies. (From GT Toolz.)

export interface Wav {
  /** 1 = PCM. */
  format: number;
  sampleRate: number;
  channels: number;
  bitsPerSample: number;
  dataStart: number;
  dataLength: number;
}

/** A 16-bit PCM mono WAV file around the samples. */
export function wavFile(data: Buffer, sampleRate: number): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + data.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}

export function parseWav(buffer: Buffer): Wav {
  if (buffer.length < 12 || buffer.toString('ascii', 0, 4) !== 'RIFF' || buffer.toString('ascii', 8, 12) !== 'WAVE') throw new Error('Not a WAV file');
  let pos = 12;
  let fmt: Omit<Wav, 'dataStart' | 'dataLength'> | undefined;
  while (pos + 8 <= buffer.length) {
    const id = buffer.toString('ascii', pos, pos + 4);
    const size = buffer.readUInt32LE(pos + 4);
    if (id === 'fmt ' && pos + 24 <= buffer.length) {
      fmt = { format: buffer.readUInt16LE(pos + 8), channels: buffer.readUInt16LE(pos + 10), sampleRate: buffer.readUInt32LE(pos + 12), bitsPerSample: buffer.readUInt16LE(pos + 22) };
    } else if (id === 'data' && fmt) {
      return { ...fmt, dataStart: pos + 8, dataLength: Math.min(size, buffer.length - pos - 8) };
    }
    pos += 8 + size + (size % 2);
  }
  throw new Error('WAV without fmt/data chunk');
}

export function wavDuration(buffer: Buffer): number {
  const wav = parseWav(buffer);
  return wav.dataLength / (wav.sampleRate * wav.channels * (wav.bitsPerSample / 8));
}

/** Joins mono 16-bit clips with silence between them; undefined if the formats do not match. */
export function joinWithPauses(clips: Buffer[], pauses: number[]): Buffer | undefined {
  if (clips.length === 1) return clips[0];
  const wavs = clips.map(parseWav);
  const rate = wavs[0]!.sampleRate;
  if (wavs.some((w) => w.sampleRate !== rate || w.channels !== 1 || w.bitsPerSample !== 16)) return undefined;
  const chunks: Buffer[] = [];
  wavs.forEach((wav, i) => {
    chunks.push(clips[i]!.subarray(wav.dataStart, wav.dataStart + wav.dataLength));
    if (i < wavs.length - 1) chunks.push(Buffer.alloc(Math.round(rate * (pauses[i] ?? 0)) * 2));
  });
  return wavFile(Buffer.concat(chunks), rate);
}

/**
 * Cuts leading and trailing silence, keeping soft starts ("M", "F", "S") and the fading end; short fades
 * in and out, so a clip never clicks. Thresholds are relative to the clip's peak.
 */
export function trimSilence(buffer: Buffer, minThreshold = 200, startThreshold = 0.015, endThreshold = 0.015): Buffer {
  const wav = parseWav(buffer);
  if (wav.bitsPerSample !== 16 || wav.channels !== 1) return buffer;
  const samples = wav.dataLength / 2;
  const at = (i: number) => Math.abs(buffer.readInt16LE(wav.dataStart + i * 2));
  let peak = 0;
  for (let i = 0; i < samples; i++) peak = Math.max(peak, at(i));
  const threshold = Math.max(minThreshold, peak * startThreshold);
  let first = 0;
  while (first < samples && at(first) < threshold) first++;
  const endLevel = Math.max(minThreshold / 2, peak * endThreshold);
  let last = samples - 1;
  while (last > first && at(last) < endLevel) last--;
  const start = Math.max(0, first - Math.round(wav.sampleRate * 0.03));
  const end = Math.min(samples, last + Math.round(wav.sampleRate * 0.06));
  const data = Buffer.from(buffer.subarray(wav.dataStart + start * 2, wav.dataStart + end * 2));
  // Short fade in (5 ms) and out (30 ms).
  const count = data.length / 2;
  const fadeIn = Math.min(count, Math.round(wav.sampleRate * 0.005));
  const fadeOut = Math.min(count, Math.round(wav.sampleRate * 0.03));
  for (let i = 0; i < fadeIn; i++) data.writeInt16LE(Math.round(data.readInt16LE(i * 2) * (i / fadeIn)), i * 2);
  for (let i = 0; i < fadeOut; i++) {
    const at = count - 1 - i;
    data.writeInt16LE(Math.round(data.readInt16LE(at * 2) * (i / fadeOut)), at * 2);
  }
  return wavFile(data, wav.sampleRate);
}
