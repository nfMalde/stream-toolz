// The module's sounds folder (<dataDir>/sounds): the files the user picked are copied in here and never referenced
// where they were (the user may move or delete the originals). Every path stays below that folder: names are
// checked against SOUND_NAME and the joined path is verified again. Buffers are cached by name and re-read when
// the file's size or modification time changed.

import fs from 'node:fs';
import path from 'node:path';
import type { PickSoundsResult, SoundRejection } from '../src/api';
import { MAX_SOUND_BYTES, SOUND_EXTENSIONS, SOUND_NAME } from '../src/settings';

interface Cached {
  size: number;
  mtimeMs: number;
  data: Buffer;
}

const MAX_BASE_NAME = 100;

export class SoundLibrary {
  private readonly cache = new Map<string, Cached>();

  constructor(readonly dir: string) {
    fs.mkdirSync(dir, { recursive: true });
  }

  /** The sound files in the folder, sorted by name (other files are left out). */
  async list(): Promise<string[]> {
    const names = await fs.promises.readdir(this.dir).catch(() => [] as string[]);
    return names.filter((name) => SOUND_NAME.test(name) && hasSoundExtension(name)).sort((a, b) => a.localeCompare(b));
  }

  /** The file's data, or undefined when it is gone or its name is not allowed. */
  async get(name: string): Promise<Buffer | undefined> {
    const file = this.pathOf(name);
    if (!file) return undefined;
    try {
      const stat = await fs.promises.stat(file);
      if (!stat.isFile() || stat.size > MAX_SOUND_BYTES) return undefined;
      const cached = this.cache.get(name);
      if (cached && cached.size === stat.size && cached.mtimeMs === stat.mtimeMs) return cached.data;
      const data = await fs.promises.readFile(file);
      this.cache.set(name, { size: stat.size, mtimeMs: stat.mtimeMs, data });
      return data;
    } catch {
      this.cache.delete(name);
      return undefined;
    }
  }

  /** Copies the picked files in, under cleaned names; an existing name gets a suffix, never overwritten. */
  async add(files: string[]): Promise<PickSoundsResult> {
    const result: PickSoundsResult = { added: [], rejected: [] };
    for (const file of files) {
      const original = path.basename(file);
      const reject = (reason: SoundRejection) => result.rejected.push({ name: original.slice(0, 120), reason });
      if (!hasSoundExtension(original)) {
        reject('type');
        continue;
      }
      try {
        const stat = await fs.promises.stat(file);
        if (!stat.isFile()) {
          reject('failed');
          continue;
        }
        if (stat.size > MAX_SOUND_BYTES) {
          reject('too-large');
          continue;
        }
        const name = await this.freeName(cleanName(original));
        await fs.promises.copyFile(file, path.join(this.dir, name), fs.constants.COPYFILE_EXCL);
        result.added.push(name);
      } catch {
        reject('failed');
      }
    }
    return result;
  }

  async remove(name: string): Promise<void> {
    const file = this.pathOf(name);
    if (!file) return;
    this.cache.delete(name);
    await fs.promises.rm(file, { force: true });
  }

  /** The file's path, only when the name is allowed (a sound file, as list() shows it) and the path stays in the folder. */
  private pathOf(name: string): string | undefined {
    if (!SOUND_NAME.test(name) || !hasSoundExtension(name)) return undefined;
    const file = path.resolve(this.dir, name);
    return path.dirname(file) === path.resolve(this.dir) ? file : undefined;
  }

  private async freeName(name: string): Promise<string> {
    const extension = path.extname(name);
    const base = name.slice(0, -extension.length);
    let candidate = name;
    for (let n = 2; await exists(path.join(this.dir, candidate)); n++) candidate = `${base}-${n}${extension}`;
    return candidate;
  }
}

function hasSoundExtension(name: string): boolean {
  const extension = path.extname(name).slice(1).toLowerCase();
  return (SOUND_EXTENSIONS as readonly string[]).includes(extension);
}

/** "Mein Sound (final).WAV" → "Mein-Sound-final.wav": only letters, digits, "_", "-" and "." stay; the extension in lower case. */
export function cleanName(original: string): string {
  const extension = path.extname(original).toLowerCase();
  const base = original
    .slice(0, -extension.length)
    .normalize('NFKD')
    // "Ä" → "A": the accents are separate marks after NFKD.
    .replace(/\p{M}+/gu, '')
    .replace(/[^\w.-]+/g, '-')
    .replace(/^[.-]+|[.-]+$/g, '')
    .slice(0, MAX_BASE_NAME);
  return `${base || 'sound'}${extension}`;
}

async function exists(file: string): Promise<boolean> {
  return fs.promises
    .access(file)
    .then(() => true)
    .catch(() => false);
}
