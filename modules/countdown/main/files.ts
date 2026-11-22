// The text files an OBS text source reads ("Read from file"): written only when their content changed, atomically
// (a temp file in the same folder, then renamed), so OBS never reads half a text. A file whose timer is gone is
// emptied, not deleted: OBS keeps pointing at it (2026-10-30).

import fs from 'node:fs';
import path from 'node:path';

/** A failing file is logged once a minute, not every second. */
const LOG_AGAIN_MS = 60_000;
/** Only names src/files.ts plans: nothing else is ever written into the folder. */
const FILE_NAME = /^countdown(?:-[a-z0-9-]{1,40})?\.txt$/;

export class TextFiles {
  /** Full path → the content on disk (as far as this process wrote it). */
  private readonly last = new Map<string, string>();
  private readonly logged = new Map<string, number>();
  private readyFolder: string | undefined;

  constructor(
    private readonly log: (line: string) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /**
   * Brings the folder in line with the wanted files (name → content): changed ones are written, files written
   * before but not wanted now (a removed timer, another folder, output switched to the overlay) are emptied.
   * Returns why the folder is not usable, if it is not (the module keeps running).
   */
  apply(folder: string, wanted: Record<string, string>): string | undefined {
    const targets = new Map<string, string>();
    let error: string | undefined;
    const names = Object.keys(wanted).filter((name) => FILE_NAME.test(name));
    if (names.length) {
      error = this.ensureFolder(folder);
      if (!error) for (const name of names) targets.set(path.join(folder, name), wanted[name]!);
    }
    for (const [file, content] of this.last) if (!targets.has(file) && content !== '') targets.set(file, '');
    for (const [file, content] of targets) if (this.last.get(file) !== content) this.write(file, content);
    return error;
  }

  /** Every file written so far is emptied (the module stops: no countdown runs while it is off). */
  clear(): void {
    for (const [file, content] of this.last) if (content !== '') this.write(file, '');
  }

  private ensureFolder(folder: string): string | undefined {
    if (this.readyFolder === folder) return undefined;
    try {
      fs.mkdirSync(folder, { recursive: true });
      this.readyFolder = folder;
      return undefined;
    } catch (err) {
      const reason = (err as NodeJS.ErrnoException).code ?? (err as Error).message;
      this.note(folder, `folder not usable (${reason})`);
      return reason;
    }
  }

  private write(file: string, content: string): void {
    const tmp = `${file}.tmp`;
    try {
      fs.writeFileSync(tmp, content, 'utf8');
      fs.renameSync(tmp, file);
      this.last.set(file, content);
      this.logged.delete(file);
    } catch (err) {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // The temp file was never written.
      }
      const reason = (err as NodeJS.ErrnoException).code ?? (err as Error).message;
      // Emptying a file that is gone (its folder was deleted) is done.
      if (content === '' && reason === 'ENOENT') return void this.last.delete(file);
      if (reason === 'ENOENT') this.readyFolder = undefined;
      this.note(file, `could not write ${path.basename(file)} (${reason})`);
    }
  }

  private note(key: string, line: string): void {
    const at = this.logged.get(key);
    if (at !== undefined && this.now() - at < LOG_AGAIN_MS) return;
    this.logged.set(key, this.now());
    this.log(`COUNTDOWN ${line}`);
  }
}
