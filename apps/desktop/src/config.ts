// The app's settings file (config.json in the data folder): the shell's settings, and per module whether it is on
// and its settings (checked by the module itself, see modules.ts). Read defensively: it may come from an older
// version or be edited by hand. Secrets never go here (secrets.ts).
//
// Version 1 (until 2026-10-28, before the modules) had one flat settings object: the app's and the reader's. It moves
// over once: the app's keys become the shell's settings, the rest ReadMyChat's; the old file stays as config.v1.json.

import fs from 'node:fs';
import path from 'node:path';
import { asObject, defaultAppSettings, normalizeAppSettings, type AppSettings } from '@stream-toolz/core';
import { READMYCHAT } from '@stream-toolz/readmychat/api';
import { writeFileAtomically } from './atomic-file';

export const CONFIG_VERSION = 2;

export interface StoredModule {
  /** Missing in a new install: the module's own default. */
  enabled?: boolean;
  /** As stored; the module checks it. */
  settings?: unknown;
}

export interface ConfigFile {
  version: typeof CONFIG_VERSION;
  app: AppSettings;
  /** By module id. Modules this version does not know are kept as they are (a newer version wrote them). */
  modules: Record<string, StoredModule>;
  /** The setup assistant was finished (or closed) once. */
  guideDone: boolean;
}

/** The settings of version 1 belonged to the reader, which is now this module. */
const V1_MODULE = READMYCHAT;

export function loadConfig(file: string, locale: string, log: (line: string) => void): ConfigFile {
  let raw: unknown;
  try {
    raw = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    // First start or unreadable: defaults.
  }
  const config = parseConfig(raw, locale);
  if (isVersion1(raw)) {
    const backup = file.replace(/\.json$/, '.v1.json');
    if (!fs.existsSync(backup)) fs.copyFileSync(file, backup);
    saveConfig(file, config);
    log(`CONFIG    moved to version ${CONFIG_VERSION} (the old file is ${path.basename(backup)})`);
  }
  return config;
}

/** Any content (a file of this or an older version, a hand-edited one, nothing) as a version 2 config. */
export function parseConfig(raw: unknown, locale: string): ConfigFile {
  const value = asObject(raw);
  const defaults = defaultAppSettings(locale);
  const guideDone = value.guideDone === true;
  if (isVersion1(raw)) {
    const { language, streamerMode, channel, serverPort, ...reader } = asObject(value.settings);
    return {
      version: CONFIG_VERSION,
      app: normalizeAppSettings({ language, streamerMode, channel, serverPort }, defaults),
      modules: { [V1_MODULE]: { enabled: true, settings: reader } },
      guideDone,
    };
  }
  const modules: Record<string, StoredModule> = {};
  for (const [id, stored] of Object.entries(asObject(value.modules))) {
    // Module ids are lower case letters (module.ts); anything else ("__proto__") is not a module.
    if (!/^[a-z][a-z0-9-]*$/.test(id)) continue;
    const entry = asObject(stored);
    modules[id] = { enabled: typeof entry.enabled === 'boolean' ? entry.enabled : undefined, settings: entry.settings };
  }
  return { version: CONFIG_VERSION, app: normalizeAppSettings(value.app, defaults), modules, guideDone };
}

function isVersion1(raw: unknown): boolean {
  const value = asObject(raw);
  return value.version === undefined && value.settings !== null && typeof value.settings === 'object';
}

export function saveConfig(file: string, config: ConfigFile): void {
  writeFileAtomically(file, JSON.stringify(config, null, 2));
}
