// The module's glue with a fake host: settings in memory, a fake server collecting the SSE writes, a temp folder for
// the text files. No Electron, no real clock.

import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import type { IncomingMessage, ServerResponse } from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { AppSettings, LocalRequestHandler, ModuleHost } from '@stream-toolz/core';
import type { CountdownStatus, StartResult } from '../src/api';
import { normalizeSettings, type Settings } from '../src/settings';
import type { Timer } from '../src/timer';
import { startCountdown, type CountdownInstance } from '../main/module';

const MIN = 60_000;
const URL = 'http://127.0.0.1:47392/countdown/key/';

interface Fake {
  host: ModuleHost<Settings>;
  settings: () => Settings;
  events: { event: string; value: unknown }[];
  log: string[];
  copied: string[];
  opened: string[];
  call<T = unknown>(name: string, ...args: unknown[]): Promise<T>;
  handler: () => LocalRequestHandler;
  dir: string;
  app: AppSettings;
  /** Set by the test once the module runs, so updateSettings can tell it like the shell does. */
  instance?: CountdownInstance;
  pick?: string;
}

function fakeHost(initial: Partial<Settings> = {}): Fake {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-countdown-'));
  let settings = normalizeSettings(initial);
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  let handler: LocalRequestHandler | undefined;
  const fake: Fake = {
    settings: () => settings,
    events: [],
    log: [],
    copied: [],
    opened: [],
    call: async <T>(name: string, ...args: unknown[]) => (await handlers.get(name)!(...args)) as T,
    handler: () => handler!,
    dir,
    app: { language: 'de', streamerMode: false, channel: '', serverPort: 47392 },
    host: undefined as unknown as ModuleHost<Settings>,
  };
  fake.host = {
    id: 'countdown',
    dev: true,
    log: (line) => fake.log.push(line),
    settings: () => settings,
    updateSettings: async (change) => {
      const before = settings;
      settings = normalizeSettings({ ...before, ...change }, before);
      fake.instance?.settingsChanged?.(settings, before);
      return settings;
    },
    app: () => fake.app,
    twitch: { on: () => undefined, ownUserId: undefined, connected: false, customRewards: async () => [], sendMessage: async () => undefined },
    audio: {
      device: () => ({ ready: false, play: async () => undefined, stop: () => undefined }),
      obs: { ready: false, play: async () => undefined, stop: () => undefined },
      status: { obsClients: 0, portInUse: false },
    },
    speech: { voicesDir: dir, workDir: dir },
    hotkeys: { set: () => undefined },
    server: { handle: (h) => (handler = h), url: () => URL },
    desktop: {
      copyText: (text) => fake.copied.push(text),
      openLocalPage: async (url) => void fake.opened.push(url),
      openFolder: async (folder) => void fake.opened.push(folder),
      pickFolder: async () => fake.pick,
      pickFiles: async () => [],
    },
    bridge: { handle: (name, h) => void handlers.set(name, h), send: (event, value) => fake.events.push({ event, value }) },
    dataDir: dir,
  };
  return fake;
}

/** Starts the module with a clock the test moves. */
function running(initial: Partial<Settings> = {}, start = 1_700_000_000_000) {
  const fake = fakeHost(initial);
  let now = start;
  const instance = startCountdown(fake.host, { now: () => now, autoTick: false });
  fake.instance = instance;
  return {
    fake,
    instance,
    advance(ms: number) {
      now += ms;
      instance.tick();
    },
    now: () => now,
    read: (name: string) => fs.readFileSync(path.join(fake.dir, name), 'utf8'),
    exists: (name: string) => fs.existsSync(path.join(fake.dir, name)),
    stop() {
      instance.stop();
      fs.rmSync(fake.dir, { recursive: true, force: true });
    },
  };
}

/** A fake SSE connection: the events written to it. */
function connect(handler: LocalRequestHandler) {
  const req = new EventEmitter() as IncomingMessage;
  (req as { method?: string }).method = 'GET';
  const chunks: string[] = [];
  let ended = false;
  const res = {
    writeHead: () => res,
    write: (chunk: string) => {
      chunks.push(String(chunk));
      return true;
    },
    end: () => void (ended = true),
    destroy: () => void (ended = true),
    writableLength: 0,
  } as unknown as ServerResponse;
  void handler(req, res, 'events');
  const events = () =>
    chunks
      .join('')
      .split('\n\n')
      .filter((block) => block.startsWith('event: '))
      .map((block) => {
        const [first, ...rest] = block.split('\n');
        return { event: first!.slice(7), data: JSON.parse(rest.map((line) => line.replace(/^data: /, '')).join('\n')) as unknown };
      });
  return { req, events, ended: () => ended, close: () => req.emit('close') };
}

test('a phrase starts a timer: saved, announced, written to the files', async () => {
  const run = running({ output: 'both' });
  const { fake } = run;
  const timer = await fake.call<Timer>('start', 'in 15 Minuten: Pause');
  assert.equal(timer.label, 'Pause');
  assert.equal(timer.endsAt, run.now() + 15 * MIN);
  assert.deepEqual(fake.settings().timers, [timer]);
  const status = fake.events.filter((e) => e.event === 'status').at(-1)!.value as CountdownStatus;
  assert.equal(status.timers.length, 1);
  assert.equal(status.texts[timer.id], '15:00');
  assert.equal(status.url, URL);
  assert.equal(status.folder, fake.dir);
  assert.equal(status.clients, 0);
  assert.equal(run.read('countdown.txt'), '15:00');
  assert.equal(run.read('countdown-1.txt'), '15:00');
  assert.equal(run.read('countdown-pause.txt'), '15:00');
  assert.ok(!run.exists('countdown.txt.tmp'), 'written atomically');
  assert.ok(!fake.log.some((line) => line.includes('Pause')), 'the label is not logged');
  run.stop();
});

test('not understood and too many timers are answered, not thrown', async () => {
  const run = running();
  assert.deepEqual(await run.fake.call<StartResult>('start', 'Giveaway'), { error: 'not-understood' });
  for (let i = 0; i < 10; i++) await run.fake.call('start', `${i + 1} min`);
  assert.deepEqual(await run.fake.call<StartResult>('start', '5 min'), { error: 'too-many' });
  assert.equal(run.fake.settings().timers.length, 10);
  await assert.rejects(run.fake.call('start', 42));
  run.stop();
});

test('files are rewritten only when their text changed', async () => {
  const run = running({ output: 'file' });
  await run.fake.call('start', '15 min');
  // Someone else changes the file: an unchanged text must not overwrite it.
  fs.writeFileSync(path.join(run.fake.dir, 'countdown.txt'), 'touched');
  run.advance(300);
  assert.equal(run.read('countdown.txt'), 'touched');
  run.advance(700);
  assert.equal(run.read('countdown.txt'), '14:59');
  run.stop();
});

test('output overlay writes no files; switching to file writes, switching back empties', async () => {
  const run = running({ output: 'overlay' });
  await run.fake.call('start', '15 min');
  assert.ok(!run.exists('countdown.txt'));
  await run.fake.host.updateSettings({ output: 'file' });
  assert.equal(run.read('countdown.txt'), '15:00');
  await run.fake.host.updateSettings({ output: 'overlay' });
  assert.equal(run.read('countdown.txt'), '');
  assert.ok(run.exists('countdown-1.txt'), 'emptied, not deleted');
  run.stop();
});

test('the overlay gets the look and the timers on connect and then only changes', async () => {
  const run = running({ color: '#ff730f', fontSize: 120 });
  const client = connect(run.fake.handler());
  let events = client.events();
  assert.deepEqual(
    events.map((e) => e.event),
    ['hello', 'style', 'timers'],
  );
  assert.equal((events[1]!.data as Record<string, string>)['--color'], '#ff730f');
  assert.equal((events[1]!.data as Record<string, string>)['--size'], '120px');
  assert.deepEqual(events[2]!.data, []);
  assert.equal((run.fake.events.at(-1)!.value as CountdownStatus).clients, 1);

  await run.fake.call('start', '2 min Pause');
  await run.fake.call('start', '5 min');
  events = client.events();
  const timers = events.at(-1)!.data as { label: string; text: string; done: boolean }[];
  assert.deepEqual(
    timers.map((t) => [t.label, t.text, t.done]),
    [
      ['', '5:00', false],
      ['Pause', '2:00', false],
    ],
    'newest on top',
  );
  const count = events.length;
  run.advance(200);
  assert.equal(client.events().length, count, 'same second, nothing sent');
  run.advance(800);
  assert.equal(client.events().length, count + 1);
  assert.equal((client.events().at(-1)!.data as { text: string }[])[0]!.text, '4:59');

  await run.fake.host.updateSettings({ align: 'left' });
  const style = client.events().filter((e) => e.event === 'style').at(-1)!.data as Record<string, string>;
  assert.equal(style['--items'], 'flex-start');
  await run.fake.host.updateSettings({ doneSeconds: 60 });
  assert.equal(client.events().filter((e) => e.event === 'style').length, 2, 'no style event without a style change');

  client.close();
  assert.equal((run.fake.events.at(-1)!.value as CountdownStatus).clients, 0);
  run.stop();
});

test('pause, resume, adjust, remove, clear', async () => {
  const run = running();
  const { fake } = run;
  const timer = await fake.call<Timer>('start', '10 min');
  run.advance(MIN);
  await fake.call('pause', timer.id);
  assert.equal(fake.settings().timers[0]!.pausedRemainingMs, 9 * MIN);
  run.advance(5 * MIN);
  await fake.call('resume', timer.id);
  assert.equal(fake.settings().timers[0]!.endsAt, run.now() + 9 * MIN);
  await fake.call('adjust', timer.id, MIN);
  assert.equal(fake.settings().timers[0]!.endsAt, run.now() + 10 * MIN);
  await fake.call('adjust', timer.id, -MIN);
  assert.equal(fake.settings().timers[0]!.endsAt, run.now() + 9 * MIN);
  await fake.call('adjust', timer.id, 'lots');
  assert.equal(fake.settings().timers[0]!.endsAt, run.now() + 9 * MIN);
  await fake.call('pause', 'unknown');
  const other = await fake.call<Timer>('start', '3 min');
  await fake.call('remove', timer.id);
  assert.deepEqual(
    fake.settings().timers.map((t) => t.id),
    [other.id],
  );
  await fake.call('clear');
  assert.deepEqual(fake.settings().timers, []);
  run.stop();
});

test('at zero the done text shows, after the done time the timer goes and its files are emptied', async () => {
  const run = running({ output: 'file', showDoneText: true, doneText: 'Los!', doneSeconds: 5 });
  await run.fake.call('start', '1 min Start');
  run.advance(MIN - 1000);
  assert.equal(run.read('countdown.txt'), '0:01');
  run.advance(1000);
  assert.equal(run.read('countdown.txt'), 'Los!');
  assert.equal(run.read('countdown-start.txt'), 'Los!');
  run.advance(4000);
  assert.equal(run.fake.settings().timers.length, 1);
  run.advance(1000);
  assert.equal(run.fake.settings().timers.length, 0);
  assert.equal(run.read('countdown.txt'), '');
  assert.equal(run.read('countdown-1.txt'), '');
  assert.equal(run.read('countdown-start.txt'), '');
  run.stop();
});

test('with the done time off a finished countdown stays until it is removed', async () => {
  const run = running({ output: 'file', showDoneText: true, doneText: 'Los!' });
  const timer = await run.fake.call<Timer>('start', '1 min');
  run.advance(MIN + 60 * 60 * 1000);
  assert.equal(run.fake.settings().timers.length, 1, 'still there an hour later');
  assert.equal(run.read('countdown.txt'), 'Los!');
  await run.fake.call('remove', timer.id);
  assert.equal(run.fake.settings().timers.length, 0);
  assert.equal(run.read('countdown.txt'), '');
  run.stop();
});

test('without a done text the overlay shows 0:00', async () => {
  const run = running();
  const client = connect(run.fake.handler());
  await run.fake.call('start', '1 min');
  run.advance(MIN);
  const last = client.events().at(-1)!.data as { text: string; done: boolean }[];
  assert.deepEqual([last[0]!.text, last[0]!.done], ['0:00', true]);
  run.stop();
});

test('timers from the settings run on after a restart', () => {
  const start = 1_700_000_000_000;
  const run = running({ output: 'file', timers: [{ id: 'kept', label: '', endsAt: start + 5 * MIN, createdAt: start - MIN }] }, start);
  assert.equal(run.read('countdown.txt'), '5:00');
  run.stop();
});

test('a folder that cannot be created is reported; the module keeps running', async () => {
  const run = running({ output: 'file' });
  const blocker = path.join(run.fake.dir, 'blocker');
  fs.writeFileSync(blocker, 'a file, not a folder');
  await run.fake.host.updateSettings({ folder: path.join(blocker, 'sub') });
  await run.fake.call('start', '5 min');
  const status = await run.fake.call<CountdownStatus>('status');
  assert.ok(status.folderError, 'reported');
  assert.equal(status.folder, path.join(blocker, 'sub'));
  assert.ok(run.fake.log.some((line) => line.includes('folder not usable')));
  // Back to the data folder: written there.
  await run.fake.host.updateSettings({ folder: '' });
  assert.equal(run.read('countdown.txt'), '5:00');
  assert.equal((await run.fake.call<CountdownStatus>('status')).folderError, undefined);
  run.stop();
});

test('url, folder and the desktop calls', async () => {
  const run = running();
  await run.fake.call('copyUrl');
  assert.deepEqual(run.fake.copied, [URL]);
  await run.fake.call('openUrl');
  await run.fake.call('openFolder');
  assert.deepEqual(run.fake.opened, [URL, run.fake.dir]);
  assert.equal(await run.fake.call('pickFolder'), undefined);
  assert.equal(run.fake.settings().folder, '');
  run.fake.pick = 'C:\\Stream\\Countdown';
  assert.equal(await run.fake.call('pickFolder'), 'C:\\Stream\\Countdown');
  assert.equal(run.fake.settings().folder, 'C:\\Stream\\Countdown');
  run.stop();
});

test('stop empties the files and ends the overlay connections', async () => {
  const run = running({ output: 'both' });
  const client = connect(run.fake.handler());
  await run.fake.call('start', '5 min');
  assert.equal(run.read('countdown.txt'), '5:00');
  run.instance.stop();
  assert.equal(run.read('countdown.txt'), '');
  assert.equal(client.ended(), true);
  fs.rmSync(run.fake.dir, { recursive: true, force: true });
});

test('only GET and known paths are served', () => {
  const run = running();
  const answers: number[] = [];
  const res = { writeHead: (status: number) => void answers.push(status), end: () => undefined, write: () => true } as unknown as ServerResponse;
  const get = (rest: string, method = 'GET') => run.fake.handler()({ method } as IncomingMessage, res, rest);
  void get('');
  void get('page.js');
  void get('style.css');
  void get('../secret');
  void get('', 'POST');
  assert.deepEqual(answers, [200, 200, 200, 404, 405]);
  run.stop();
});
