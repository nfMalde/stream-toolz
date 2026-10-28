// The app's own settings file (config.json in the data folder). Read defensively: it may come from an
// older version or be edited by hand. Secrets never go here (secrets.ts).

import fs from 'node:fs';
import path from 'node:path';
import { normalizeSettings, type AppConfig, type Settings } from '@stream-toolz/runtime';

export function loadConfig(file: string, defaults: Settings): AppConfig {
  let raw: Partial<AppConfig> = {};
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8')) as Partial<AppConfig>;
  } catch {
    // First start or unreadable: defaults.
  }
  return {
    settings: normalizeSettings(raw.settings, defaults),
    guideDone: raw.guideDone === true,
  };
}

/** Written to a temporary file first, so a crash never leaves a half-written config. */
export function saveConfig(file: string, config: AppConfig): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const temp = `${file}.tmp`;
  fs.writeFileSync(temp, JSON.stringify(config, null, 2));
  fs.renameSync(temp, file);
}
