// Language packs from disk: <dataDir>/language-packs/*.json, read at start and on "Reload". An own pack with the
// id of a built-in one replaces it (GT Toolz does the same); a file that is not a valid pack is logged with the
// reason and skipped, the others still load. Only the file names reach the log, never a path with the user name.

import fs from 'node:fs';
import path from 'node:path';
import { validateLanguagePack, type LanguagePack } from '../src/language-pack';

/** A pack is a few kilobytes; anything bigger is not one. */
const MAX_FILE_BYTES = 1_000_000;

export function languagePacksDir(dataDir: string): string {
  return path.join(dataDir, 'language-packs');
}

/** The built-in packs with the folder's packs on top, built-ins first; the folder is created when missing. */
export function loadLanguagePacks(dir: string, builtIn: readonly LanguagePack[], log: (line: string) => void): LanguagePack[] {
  const packs = new Map<string, LanguagePack>(builtIn.map((pack) => [pack.id, pack]));
  let names: string[] = [];
  try {
    fs.mkdirSync(dir, { recursive: true });
    names = fs
      .readdirSync(dir)
      .filter((name) => name.toLowerCase().endsWith('.json'))
      .sort((a, b) => a.localeCompare(b, 'en'));
  } catch (err) {
    log(`READMYCHAT language packs folder could not be read: ${(err as Error).message}`);
  }
  for (const name of names) {
    const file = path.join(dir, name);
    try {
      if (fs.statSync(file).size > MAX_FILE_BYTES) throw new Error(`larger than ${MAX_FILE_BYTES / 1_000_000} MB`);
      const { pack, error } = validateLanguagePack(JSON.parse(fs.readFileSync(file, 'utf8')));
      if (!pack) throw new Error(error);
      packs.set(pack.id, pack);
    } catch (err) {
      log(`READMYCHAT language pack ${name}: ${(err as Error).message}`);
    }
  }
  const loaded = [...packs.values()];
  log(`READMYCHAT language packs: ${loaded.map((pack) => `${pack.id} (${pack.builtIn ? 'built in' : 'own'})`).join(', ')}`);
  return loaded;
}
