// The module's sounds: files the user picked, copied into the module's own folder in the profile (never referenced
// where they were picked: the overlay and the device player must find them later, also from a USB stick that is
// gone). Only names, never paths, leave this file.

import fs from 'node:fs';
import path from 'node:path';
import { isSoundName } from '../src/settings';

/** Larger files are not copied: an alert sound is a few seconds, not a song. */
export const MAX_SOUND_BYTES = 10 * 1024 * 1024;

const CONTENT_TYPES: Record<string, string> = {
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
};

export const SOUND_EXTENSIONS = Object.keys(CONTENT_TYPES).map((ext) => ext.slice(1));

export class SoundFolder {
  constructor(
    readonly dir: string,
    private readonly log: (line: string) => void,
  ) {}

  /** The sounds in the folder, by name (files of other kinds or with odd names are left out). */
  list(): string[] {
    try {
      return fs
        .readdirSync(this.dir, { withFileTypes: true })
        .filter((entry) => entry.isFile() && isSoundName(entry.name) && contentType(entry.name))
        .map((entry) => entry.name)
        .sort((a, b) => a.localeCompare(b));
    } catch {
      return [];
    }
  }

  /** The file's path, if the name is a sound of this folder; undefined for anything else (a path, "..", unknown). */
  resolve(name: string): string | undefined {
    if (!isSoundName(name) || !contentType(name)) return undefined;
    const file = path.join(this.dir, name);
    if (path.dirname(file) !== this.dir) return undefined;
    return fs.existsSync(file) ? file : undefined;
  }

  read(name: string): Buffer | undefined {
    const file = this.resolve(name);
    if (!file) return undefined;
    try {
      return fs.readFileSync(file);
    } catch {
      return undefined;
    }
  }

  /**
   * Copies picked files in. The name is cleaned; a different file of the same name gets a suffix ("beep-2.wav"),
   * the same file again is not copied twice. Returns the names that are in the folder now.
   */
  add(files: string[]): string[] {
    fs.mkdirSync(this.dir, { recursive: true });
    for (const source of files) {
      const name = cleanName(path.basename(source));
      if (!name) continue;
      let data: Buffer;
      try {
        if (fs.statSync(source).size > MAX_SOUND_BYTES) {
          this.log(`ALERTS    sound not copied, larger than ${MAX_SOUND_BYTES / 1024 / 1024} MB`);
          continue;
        }
        data = fs.readFileSync(source);
      } catch {
        this.log(`ALERTS    sound could not be read`);
        continue;
      }
      const target = this.freeName(name, data);
      if (target) fs.writeFileSync(path.join(this.dir, target), data);
    }
    return this.list();
  }

  remove(name: string): string[] {
    const file = this.resolve(name);
    if (file) fs.rmSync(file, { force: true });
    return this.list();
  }

  /** The name to write to: the given one, or with a suffix when another file has it; undefined when it is there already. */
  private freeName(name: string, data: Buffer): string | undefined {
    const ext = path.extname(name);
    const stem = name.slice(0, -ext.length);
    for (let n = 1; n < 1000; n++) {
      const candidate = n === 1 ? name : `${stem}-${n}${ext}`;
      const file = path.join(this.dir, candidate);
      if (!fs.existsSync(file)) return candidate;
      if (fs.readFileSync(file).equals(data)) return undefined;
    }
    return undefined;
  }
}

export function contentType(name: string): string | undefined {
  return CONTENT_TYPES[path.extname(name).toLowerCase()];
}

/** A picked file's name as it is stored: letters, digits, dot, dash, underscore; the extension in lower case. */
export function cleanName(basename: string): string | undefined {
  const ext = path.extname(basename).toLowerCase();
  if (!CONTENT_TYPES[ext]) return undefined;
  const stem = basename
    .slice(0, -ext.length)
    .replace(/[^\w.-]+/g, '_')
    .replace(/^[._-]+|[._-]+$/g, '')
    .slice(0, 100);
  const name = `${stem || 'sound'}${ext}`;
  return isSoundName(name) ? name : undefined;
}
