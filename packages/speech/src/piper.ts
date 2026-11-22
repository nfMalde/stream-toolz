// Piper: offline neural text-to-speech (https://github.com/rhasspy/piper, MIT). Installed as an optional
// voice package (voice-packages.ts) from the original source; it contains espeak-ng (GPL), so it only ever
// runs as a separate program, never inside the app's process. (From GT Toolz.)

import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import path from 'node:path';

/** Linux: the engine's shared libraries come with it (macOS and Windows find them next to the program). */
export function withLibraryPath(dir: string): NodeJS.ProcessEnv {
  if (process.platform !== 'linux') return process.env;
  const current = process.env.LD_LIBRARY_PATH;
  return { ...process.env, LD_LIBRARY_PATH: current ? `${dir}${path.delimiter}${current}` : dir };
}

/** Model settings from the voice catalogue (voice-packages.json), e.g. no random phoneme lengths for MLS. */
export interface PiperInference {
  noiseScale?: number;
  noiseW?: number;
}

/** One long-running piper.exe per voice; renders texts to WAV files one after another. */
export class PiperRenderer {
  private readonly process: ChildProcessWithoutNullStreams;
  private buffer = '';
  private readonly waiting: (() => void)[] = [];
  private ended = false;

  /** lengthScale: > 1 speaks slower, < 1 faster. speaker: for models with several speakers. */
  constructor(exe: string, model: string, lengthScale = 1, speaker?: number, inference: PiperInference = {}) {
    // Absolute paths: piper runs in its own folder (it finds espeak-ng-data there).
    const exePath = path.resolve(exe);
    // No pause of its own: texts come in parts and are joined with the configured pauses (speech.ts).
    const tuning = [
      ...(inference.noiseScale !== undefined ? ['--noise_scale', String(inference.noiseScale)] : []),
      ...(inference.noiseW !== undefined ? ['--noise_w', String(inference.noiseW)] : []),
    ];
    this.process = spawn(exePath, ['--model', path.resolve(model), '--json-input', '--length_scale', String(lengthScale), '--sentence_silence', '0', ...tuning, ...(speaker !== undefined ? ['--speaker', String(speaker)] : [])], {
      cwd: path.dirname(exePath),
      env: withLibraryPath(path.dirname(exePath)),
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });
    // Waiting renders end without a file, so the caller's read fails with a clear error.
    const ended = () => {
      this.ended = true;
      for (const resolve of this.waiting.splice(0)) resolve();
    };
    this.process.on('error', (err) => {
      console.error(`Piper could not be started: ${err.message}`);
      ended();
    });
    this.process.on('exit', ended);
    this.process.stdin.on('error', ended);
    // Piper writes its log to stderr; it must be read, or a full pipe would block it.
    this.process.stderr.resume();
    // Piper prints the path of every finished WAV file on its own line.
    this.process.stdout.on('data', (chunk: Buffer) => {
      this.buffer += chunk.toString('utf8');
      let newline: number;
      while ((newline = this.buffer.indexOf('\n')) >= 0) {
        this.buffer = this.buffer.slice(newline + 1);
        this.waiting.shift()?.();
      }
    });
  }

  /** False once the program has ended (crashed or closed): the voice is opened again. */
  get alive(): boolean {
    return !this.ended;
  }

  render(text: string, outputFile: string): Promise<void> {
    if (this.ended) return Promise.resolve();
    return new Promise((resolve) => {
      this.waiting.push(resolve);
      this.process.stdin.write(`${JSON.stringify({ text, output_file: outputFile })}\n`, 'utf8');
    });
  }

  close(): void {
    if (!this.ended) {
      this.process.stdin.end();
      // A piper that does not end on its own (hung in a render) is killed.
      setTimeout(() => this.process.kill(), 2000).unref();
    }
    this.ended = true;
  }
}
