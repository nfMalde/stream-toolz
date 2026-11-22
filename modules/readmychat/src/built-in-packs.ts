// The two language packs that ship with the app (language-packs/de.json, en.json), checked like any other pack, so
// a broken built-in file fails at start instead of in the chat. Not imported by the UI (it gets the loaded packs
// from the main process); the JSON import works like packages/speech/src/voice-packages.ts.

import dePack from '../language-packs/de.json' with { type: 'json' };
import enPack from '../language-packs/en.json' with { type: 'json' };
import { validateLanguagePack, type LanguagePack } from './language-pack';

function builtIn(value: unknown): LanguagePack {
  const { pack, error } = validateLanguagePack(value, true);
  if (!pack) throw new Error(`Built-in language pack is broken: ${error}`);
  return pack;
}

export const BUILT_IN_PACKS: readonly LanguagePack[] = [builtIn(dePack), builtIn(enPack)];
