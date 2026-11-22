import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_APP_SETTINGS } from '@stream-toolz/core';
import { DEFAULT_SETTINGS, normalizeSettings } from '@stream-toolz/readmychat';
import { loadConfig, parseConfig } from '../src/config';

/** A config.json from before the modules: the app's and the reader's settings in one object. */
const VERSION_1 = {
  settings: {
    language: 'en',
    streamerMode: true,
    channel: 'SomeChannel',
    serverPort: 47500,
    output: 'obs',
    volume: 55,
    readNames: 'changed',
    hotkeys: { pause: 'F13', skip: 'F14', clear: '' },
    nicknames: { xx_dark_lord_xx: 'Lord' },
  },
  guideDone: true,
};

test('version 1: the app keys become the shell settings, the rest ReadMyChat settings', () => {
  const config = parseConfig(VERSION_1, 'de-DE');
  assert.equal(config.version, 2);
  assert.deepEqual(config.app, { language: 'en', streamerMode: true, channel: 'somechannel', serverPort: 47500 });
  assert.equal(config.guideDone, true);
  assert.equal(config.modules.readmychat?.enabled, true);
  const reader = normalizeSettings(config.modules.readmychat?.settings, DEFAULT_SETTINGS);
  assert.equal(reader.output, 'obs');
  assert.equal(reader.volume, 55);
  assert.equal(reader.readNames, 'changed');
  assert.deepEqual(reader.hotkeys, { pause: 'F13', skip: 'F14', clear: '' });
  assert.deepEqual(reader.nicknames, { xx_dark_lord_xx: 'Lord' });
  assert.ok(!('language' in reader) && !('serverPort' in reader));
});

test('version 2 is read as it is; unknown modules are kept, a missing switch stays open', () => {
  const config = parseConfig(
    {
      version: 2,
      app: { language: 'de', channel: '@Maldoe', serverPort: 'x' },
      modules: { readmychat: { enabled: false, settings: { volume: 20 } }, later: { enabled: true, settings: { a: 1 } }, odd: { enabled: 'yes' } },
      guideDone: false,
    },
    'en-US',
  );
  assert.deepEqual(config.app, { ...DEFAULT_APP_SETTINGS, language: 'de', channel: 'maldoe' });
  assert.deepEqual(config.modules.readmychat, { enabled: false, settings: { volume: 20 } });
  assert.deepEqual(config.modules.later, { enabled: true, settings: { a: 1 } });
  assert.deepEqual(config.modules.odd, { enabled: undefined, settings: undefined });
});

test('nothing or garbage: defaults in the system language', () => {
  for (const raw of [undefined, null, 42, 'text', [], { settings: 'no' }]) {
    const config = parseConfig(raw, 'en-GB');
    assert.deepEqual(config.app, { ...DEFAULT_APP_SETTINGS, language: 'en' }, JSON.stringify(raw));
    assert.deepEqual(config.modules, {});
    assert.equal(config.guideDone, false);
  }
});

test('a version 1 file is moved over once and kept as config.v1.json', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stream-toolz-config-'));
  try {
    const file = path.join(dir, 'config.json');
    const original = JSON.stringify(VERSION_1, null, 2);
    fs.writeFileSync(file, original);
    const lines: string[] = [];
    loadConfig(file, 'de-DE', (line) => lines.push(line));
    assert.equal(fs.readFileSync(path.join(dir, 'config.v1.json'), 'utf8'), original);
    const written = JSON.parse(fs.readFileSync(file, 'utf8')) as { version: number; app: unknown };
    assert.equal(written.version, 2);
    assert.equal(lines.length, 1);
    // Read again: already version 2, nothing moves and the backup stays as it was.
    loadConfig(file, 'de-DE', (line) => lines.push(line));
    assert.equal(lines.length, 1);
    assert.equal(fs.readFileSync(path.join(dir, 'config.v1.json'), 'utf8'), original);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
