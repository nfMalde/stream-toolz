// A voice that turns a text into one WAV (in memory). Texts are split after commas and sentence ends;
// every part is rendered on its own and the parts are joined with fixed pauses: the engines' own pauses
// vary a lot (120 to 470 ms after the same comma, measured in GT Toolz).

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { VoiceEngine } from './api';
import { joinWithPauses, trimSilence } from './wav';

/** An engine that writes a WAV file per text. */
export interface Renderer {
  render(text: string, outputFile: string): Promise<void>;
  /** False once its program ended: the voice must be opened again. */
  readonly alive: boolean;
  close(): void;
}

export interface SpeechPauses {
  /** Seconds after a comma and after a sentence. */
  comma: number;
  sentence: number;
}

/** A comma gets its own pause only between parts of at least this many words. */
const MIN_WORDS_FOR_COMMA_PAUSE = 3;
/** A render that takes longer has hung: the engine is closed (the voice opens again) and the text is skipped. */
const RENDER_TIMEOUT_MS = 60_000;
/** Reading a file the engine just wrote: Windows' virus scanner or indexer may hold it for a moment. */
const FRESH_FILE_ATTEMPTS = 6;
const FRESH_FILE_WAIT_MS = 50;

export class Speech {
  private queue: Promise<unknown> = Promise.resolve();
  private counter = 0;
  private readonly id = crypto.randomBytes(3).toString('hex');

  constructor(
    private readonly renderer: Renderer,
    readonly engine: VoiceEngine,
    /** Voice id as in the settings ("piper:de_DE-ramona-low", "Microsoft Katja"). */
    readonly voiceId: string,
    private readonly workDir: string,
    private readonly pauses: SpeechPauses,
  ) {
    fs.mkdirSync(workDir, { recursive: true });
  }

  get alive(): boolean {
    return this.renderer.alive;
  }

  /** The text spoken, as one WAV. Renders run one after another. */
  synthesize(text: string): Promise<Buffer> {
    const run = this.queue.then(() => this.render(wellFormed(text)));
    this.queue = run.catch(() => undefined);
    return run;
  }

  close(): void {
    this.renderer.close();
  }

  private async render(text: string): Promise<Buffer> {
    // Kokoro starts a program per text and keeps its own pauses.
    const parts = this.engine === 'sherpa' ? [{ text: withFinalMark(text), end: 'none' as const }] : speechParts(text);
    const clips: Buffer[] = [];
    for (const part of parts) clips.push(trimSilence(await this.renderPart(part.text)));
    const pauses = parts.map((p) => (p.end === 'comma' ? this.pauses.comma : p.end === 'sentence' ? this.pauses.sentence : 0));
    return joinWithPauses(clips, pauses) ?? trimSilence(await this.renderPart(withFinalMark(text)));
  }

  private async renderPart(text: string): Promise<Buffer> {
    // Unique across voices, previews and tests, which share the folder.
    const file = path.join(this.workDir, `part-${process.pid}-${this.id}-${this.counter++}.wav`);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const timeout = new Promise<never>((_resolve, reject) => {
      timer = setTimeout(() => {
        this.renderer.close();
        reject(new Error(`${this.voiceId}: no answer within ${RENDER_TIMEOUT_MS / 1000} s`));
      }, RENDER_TIMEOUT_MS);
    });
    try {
      await Promise.race([this.renderer.render(text, file), timeout]);
      return await readFreshFile(file);
    } finally {
      clearTimeout(timer);
      // Never at the clip's cost (GT Toolz alpha 0.0.5, the user's PC: "EPERM" on a fresh file lost the message):
      // retried a moment, else the part file stays in the work folder, which does no harm.
      try {
        await fs.promises.rm(file, { force: true, maxRetries: 5, retryDelay: 50 });
      } catch {
        // Still held; cleared by a later run.
      }
    }
  }
}

/** A file another program may still hold for a moment (a scanner): read again after a growing wait. */
export async function readFreshFile(file: string): Promise<Buffer> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fs.promises.readFile(file);
    } catch (err) {
      const code = (err as NodeJS.ErrnoException).code;
      if (attempt >= FRESH_FILE_ATTEMPTS || (code !== 'EPERM' && code !== 'EBUSY' && code !== 'EACCES')) throw err;
      await new Promise((resolve) => setTimeout(resolve, FRESH_FILE_WAIT_MS * attempt));
    }
  }
}

/** A text cut inside a surrogate pair (text.ts shortens by UTF-16 units) would break the engines' JSON or UTF-8. */
export function wellFormed(text: string): string {
  return text.replace(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/g, '');
}

/** A text without a final mark gets a period, so it sounds finished. */
export function withFinalMark(text: string): string {
  const trimmed = text.trim();
  return /[.!?,;:…]$/.test(trimmed) ? trimmed : `${trimmed}.`;
}

/**
 * Splits a text after sentence ends and commas; the mark stays with its part, so the intonation fits.
 * "1,7" has no space and stays together. Short pieces stay with their neighbours: a name or "ja?"
 * spoken alone came out clipped or oddly stressed. (From GT Toolz.)
 */
export function speechParts(text: string): { text: string; end: 'comma' | 'sentence' | 'none' }[] {
  const pieces = withFinalMark(text)
    .split(/(?<=[,;:.!?])\s+/)
    .map((piece) => piece.trim())
    .filter(Boolean);
  const words = (piece: string) => piece.split(/\s+/).length;
  const parts: { text: string; end: 'comma' | 'sentence' | 'none' }[] = [];
  let current = '';
  for (const [i, piece] of pieces.entries()) {
    current = current ? `${current} ${piece}` : piece;
    const next = pieces[i + 1];
    if (next === undefined) parts.push({ text: current, end: 'none' });
    else if (/[.!?]$/.test(piece)) parts.push({ text: current, end: 'sentence' });
    else if (words(current) >= MIN_WORDS_FOR_COMMA_PAUSE && words(next) >= MIN_WORDS_FOR_COMMA_PAUSE) parts.push({ text: current, end: 'comma' });
    else continue;
    current = '';
  }
  return parts;
}
