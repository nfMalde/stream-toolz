// sherpa-onnx (Apache-2.0) with Kokoro models (English) and VITS models (CSS10 German). Runs as a separate
// program per clip: the engine contains espeak-ng (GPL), so the app never loads it into its own process.
// (Kokoro from GT Toolz.)

import { execFile } from 'node:child_process';
import path from 'node:path';
import { withLibraryPath } from './piper';

/** The model kinds sherpa-onnx gets from the voice catalogue. */
export type SherpaFormat = 'kokoro' | 'vits';

/**
 * The command line for one clip. The text comes from the chat, so it goes after a lone "--": sherpa-onnx
 * reads every argument starting with "--" before that as an option, and a message like
 * "--output-filename=…" would otherwise be taken as one.
 */
export function sherpaArgs(format: SherpaFormat, modelDir: string, options: { sid: number; language: string; lengthScale: number; outputFile: string }, text: string): string[] {
  const m = modelDir;
  const model =
    format === 'vits'
      ? [`--vits-model=${path.join(m, 'model.onnx')}`, `--vits-tokens=${path.join(m, 'tokens.txt')}`, `--vits-length-scale=${options.lengthScale}`]
      : [
          `--kokoro-model=${path.join(m, 'model.int8.onnx')}`,
          `--kokoro-voices=${path.join(m, 'voices.bin')}`,
          `--kokoro-tokens=${path.join(m, 'tokens.txt')}`,
          `--kokoro-data-dir=${path.join(m, 'espeak-ng-data')}`,
          `--kokoro-lexicon=${path.join(m, options.language === 'en-GB' ? 'lexicon-gb-en.txt' : 'lexicon-us-en.txt')}`,
          `--kokoro-lang=en`,
          `--kokoro-length-scale=${options.lengthScale}`,
        ];
  return [...model, `--sid=${options.sid}`, '--num-threads=4', `--output-filename=${options.outputFile}`, '--', text];
}

export class SherpaRenderer {
  private readonly exe: string;
  private readonly modelDir: string;
  readonly alive = true;

  /** lengthScale: > 1 speaks slower, < 1 faster. */
  constructor(
    exe: string,
    modelDir: string,
    private readonly format: SherpaFormat,
    private readonly sid: number,
    private readonly language: string,
    private readonly lengthScale = 1,
  ) {
    this.exe = path.resolve(exe);
    this.modelDir = path.resolve(modelDir);
  }

  render(text: string, outputFile: string): Promise<void> {
    const args = sherpaArgs(this.format, this.modelDir, { sid: this.sid, language: this.language, lengthScale: this.lengthScale, outputFile }, text);
    return new Promise((resolve, reject) => {
      execFile(this.exe, args, { cwd: path.dirname(this.exe), env: withLibraryPath(path.join(path.dirname(this.exe), '..', 'lib')), windowsHide: true }, (err) =>
        err ? reject(err) : resolve(),
      );
    });
  }

  close(): void {}
}
