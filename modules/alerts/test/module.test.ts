import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { AudioSink, ModuleHost, ModuleInstance } from '@stream-toolz/core';
import { DEFAULT_APP_SETTINGS } from '@stream-toolz/core';
import type { ChannelEvent } from '@stream-toolz/twitch';
import { alertsModule } from '../main/module';
import { cleanName, SoundFolder } from '../main/sounds';
import type { AlertsStatus } from '../src/api';
import { DEFAULT_SETTINGS, normalizeSettings, type Settings } from '../src/settings';

// --- A fake host: every output is collected, nothing real plays ---

interface Answer {
  status: number;
  type: string;
  body: string;
  /** What was written to a stream (server-sent events). */
  chunks: string[];
  ended: boolean;
  close(): void;
}

function request(handler: (req: unknown, res: unknown, rest: string) => unknown, rest: string, method = 'GET'): Answer {
  const answer: Answer = { status: 0, type: '', body: '', chunks: [], ended: false, close: () => undefined };
  const res = {
    writeHead(status: number, headers: Record<string, string>) {
      answer.status = status;
      answer.type = headers['Content-Type'] ?? '';
    },
    write(chunk: string) {
      answer.chunks.push(chunk);
    },
    end(body?: string | Buffer) {
      answer.ended = true;
      if (body !== undefined) answer.body = body.toString();
    },
  };
  const req = {
    method,
    on(event: string, listener: () => void) {
      if (event === 'close') answer.close = listener;
    },
  };
  handler(req, res, rest);
  return answer;
}

function events(answer: Answer, name: string): unknown[] {
  return answer.chunks
    .filter((chunk) => chunk.startsWith(`event: ${name}\n`))
    .map((chunk) => JSON.parse(chunk.split('\ndata: ')[1]!.trim()) as unknown);
}

interface Fake {
  host: ModuleHost<Settings>;
  settings: Settings;
  app: typeof DEFAULT_APP_SETTINGS;
  dir: string;
  twitch: Map<string, (...args: unknown[]) => void>;
  played: { volume: number; bytes: number }[];
  stopped: number;
  calls: Map<string, (...args: unknown[]) => unknown>;
  sent: { event: string; value: unknown }[];
  copied: string[];
  opened: string[];
  pick: string[];
  log: string[];
  handler?: (req: unknown, res: unknown, rest: string) => unknown;
}

/** change: a partial config as the UI would send it (normalize fills the rest). */
function fakeHost(change: unknown = {}): Fake {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-alerts-'));
  const fake: Fake = {
    host: undefined as unknown as ModuleHost<Settings>,
    settings: normalizeSettings(change, DEFAULT_SETTINGS),
    app: { ...DEFAULT_APP_SETTINGS },
    dir,
    twitch: new Map(),
    played: [],
    stopped: 0,
    calls: new Map(),
    sent: [],
    copied: [],
    opened: [],
    pick: [],
    log: [],
  };
  const device: AudioSink = {
    ready: true,
    play: (wav, volume) => {
      fake.played.push({ volume, bytes: wav.length });
      return Promise.resolve();
    },
    stop: () => void fake.stopped++,
  };
  fake.host = {
    id: 'alerts',
    dev: true,
    log: (line) => void fake.log.push(line),
    settings: () => fake.settings,
    updateSettings: (patch) => Promise.resolve((fake.settings = normalizeSettings({ ...fake.settings, ...patch }, fake.settings))),
    app: () => fake.app,
    twitch: {
      on: (event, listener) => void fake.twitch.set(event, listener as (...args: unknown[]) => void),
      ownUserId: '1',
      connected: true,
      customRewards: () => Promise.resolve([]),
      sendMessage: () => Promise.resolve(),
    },
    audio: { device: () => device, obs: device, status: { obsClients: 0, portInUse: false } },
    speech: { voicesDir: dir, workDir: dir },
    hotkeys: { set: () => undefined },
    server: { handle: (handler) => void (fake.handler = handler as Fake['handler']), url: () => 'http://127.0.0.1:47391/alerts/key/' },
    desktop: {
      copyText: (text) => void fake.copied.push(text),
      openLocalPage: (url) => {
        fake.opened.push(url);
        return Promise.resolve();
      },
      openFolder: () => Promise.resolve(),
      pickFolder: () => Promise.resolve(undefined),
      pickFiles: () => Promise.resolve(fake.pick),
    },
    bridge: {
      handle: (name, handler) => void fake.calls.set(name, handler),
      send: (event, value) => void fake.sent.push({ event, value }),
    },
    dataDir: dir,
  };
  return fake;
}

function start(change: unknown = {}): { fake: Fake; instance: ModuleInstance<Settings>; call: (name: string, ...args: unknown[]) => Promise<unknown>; stop: () => void } {
  const fake = fakeHost(change);
  const instance = alertsModule.start(fake.host);
  const call = async (name: string, ...args: unknown[]) => fake.calls.get(name)!(...args);
  const stop = () => {
    instance.stop();
    fs.rmSync(fake.dir, { recursive: true, force: true });
  };
  return { fake, instance, call, stop };
}

function follow(name: string, id = name.toLowerCase()): ChannelEvent {
  return { id: `follow-${id}`, kind: 'follow', userId: id, login: id, name, count: 0, months: 0, tier: '', prime: false, receivedAt: Date.now() };
}

/** A tiny WAV: 44 bytes of header, no samples (enough for the sink; the page decodes it in the browser). */
const WAV = Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt '), Buffer.alloc(20), Buffer.from('data'), Buffer.alloc(4)]);

// --- The page and its files ---

test('serves the page, its script and style, and sounds only by their plain name', (t) => {
  const { fake, stop } = start();
  t.after(stop);
  const handle = fake.handler!;
  const page = request(handle, '');
  assert.equal(page.status, 200);
  assert.match(page.type, /text\/html/);
  assert.match(page.body, /<script src="page.js"><\/script>/);
  assert.doesNotMatch(page.body, /<script>/);
  assert.equal(request(handle, 'page.js').status, 200);
  assert.equal(request(handle, 'style.css').status, 200);
  assert.equal(request(handle, 'other').status, 404);
  assert.equal(request(handle, '', 'POST').status, 405);

  fs.mkdirSync(path.join(fake.dir, 'sounds'));
  fs.writeFileSync(path.join(fake.dir, 'sounds', 'beep.wav'), WAV);
  fs.writeFileSync(path.join(fake.dir, 'secret.txt'), 'nope');
  const sound = request(handle, 'sound/beep.wav');
  assert.equal(sound.status, 200);
  assert.equal(sound.type, 'audio/wav');
  assert.equal(sound.body.length, WAV.length);
  assert.equal(request(handle, 'sound/missing.wav').status, 404);
  assert.equal(request(handle, 'sound/../secret.txt').status, 404);
  assert.equal(request(handle, 'sound/..%2Fsecret.txt').status, 404);
  assert.equal(request(handle, 'sound/..\\secret.txt').status, 404);
  assert.equal(request(handle, 'sound/%').status, 404);
  assert.equal(request(handle, 'sound/').status, 404);
  assert.equal(request(handle, 'sound/beep.wav/x').status, 404);
});

test('a page gets the style on connect, then each alert with its sound; the device plays too when wanted', async (t) => {
  const { fake, call, stop } = start({ events: { follow: { sound: 'beep.wav', volume: 40, durationSeconds: 3 } }, deviceOutput: true });
  t.after(stop);
  fs.mkdirSync(path.join(fake.dir, 'sounds'));
  fs.writeFileSync(path.join(fake.dir, 'sounds', 'beep.wav'), WAV);
  const page = request(fake.handler!, 'events');
  assert.equal(page.status, 200);
  assert.match(page.type, /event-stream/);
  assert.equal(events(page, 'hello').length, 1);
  const style = events(page, 'style')[0] as { style: Settings['style']; kinds: Record<string, string> };
  assert.deepEqual(style.style, fake.settings.style);
  assert.equal(style.kinds['follow'], 'Follow');
  assert.equal(((await call('status')) as AlertsStatus).pages, 1);

  fake.twitch.get('event')!(follow('Anna'));
  const alert = events(page, 'alert')[0] as Record<string, unknown>;
  assert.equal(alert['title'], 'Anna folgt jetzt!');
  assert.equal(alert['soundUrl'], 'sound/beep.wav');
  assert.equal(alert['volume'], 0.4);
  assert.equal(alert['durationMs'], 3000);
  assert.deepEqual(fake.played, [{ volume: 0.4, bytes: WAV.length }]);
  // The next one waits behind it (the page shows one at a time).
  fake.twitch.get('event')!(follow('Ben'));
  assert.equal(events(page, 'alert').length, 1);
  const status = (await call('status')) as AlertsStatus;
  assert.equal(status.queued, 1);
  assert.equal(status.current?.title, 'Anna folgt jetzt!');
  assert.equal(status.url, 'http://127.0.0.1:47391/alerts/key/');
  assert.deepEqual(status.sounds, ['beep.wav']);
  // Names never reach the technical log.
  assert.ok(fake.log.every((line) => !line.includes('Anna') && !line.includes('Ben')));

  // A second page opened now sees the rest of the current alert, without the sound again.
  const late = request(fake.handler!, 'events');
  const shown = events(late, 'alert')[0] as Record<string, unknown>;
  assert.equal(shown['title'], 'Anna folgt jetzt!');
  assert.equal(shown['soundUrl'], '');
  assert.ok((shown['durationMs'] as number) <= 3000);

  // Cleared: the page hides the alert, the device stops.
  await call('clear');
  assert.equal(events(page, 'clear').length, 1);
  assert.equal(fake.stopped >= 1, true);
  page.close();
  assert.equal(((await call('status')) as AlertsStatus).pages, 1);
});

test('the style follows the settings and the language; stop ends the pages', (t) => {
  const { fake, instance, stop } = start();
  t.after(stop);
  const page = request(fake.handler!, 'events');
  const before = fake.settings;
  fake.settings = normalizeSettings({ style: { position: 'bottom' } }, before);
  instance.settingsChanged!(fake.settings, before);
  const styles = events(page, 'style') as { style: Settings['style']; kinds: Record<string, string> }[];
  assert.equal(styles.length, 2);
  assert.equal(styles[1]!.style.position, 'bottom');
  // The same style again sends nothing.
  instance.settingsChanged!(fake.settings, fake.settings);
  assert.equal(events(page, 'style').length, 2);
  fake.app = { ...fake.app, language: 'en' };
  instance.appChanged!(fake.app, DEFAULT_APP_SETTINGS);
  assert.equal((events(page, 'style')[2] as { kinds: Record<string, string> }).kinds['resub'], 'Resub');
  instance.stop();
  assert.equal(page.ended, true);
});

// --- Calls from the UI ---

test('test alerts, sounds picked, removed and previewed; the address copied and opened', async (t) => {
  const { fake, call, stop } = start();
  t.after(stop);
  const page = request(fake.handler!, 'events');

  await call('test', 'raid');
  const alert = events(page, 'alert')[0] as Record<string, unknown>;
  assert.equal(alert['title'], 'Maldö raidet mit 42 Zuschauern!');
  assert.equal(alert['test'], true);
  await assert.rejects(call('test', 'nonsense'));
  await assert.rejects(call('test', 42));

  // Picked files are copied in, with clean names; a different file with the same name gets a suffix.
  const picked = path.join(fake.dir, 'picked');
  fs.mkdirSync(picked);
  fs.writeFileSync(path.join(picked, 'My Sound (1).WAV'), WAV);
  fs.writeFileSync(path.join(picked, 'notes.txt'), 'x');
  fs.writeFileSync(path.join(picked, 'big.mp3'), Buffer.alloc(10 * 1024 * 1024 + 1));
  fake.pick = [path.join(picked, 'My Sound (1).WAV'), path.join(picked, 'notes.txt'), path.join(picked, 'big.mp3')];
  assert.deepEqual(await call('pickSounds'), ['My_Sound_1.wav']);
  fs.writeFileSync(path.join(picked, 'My Sound (1).WAV'), Buffer.concat([WAV, Buffer.from([1])]));
  fake.pick = [path.join(picked, 'My Sound (1).WAV')];
  assert.deepEqual(await call('pickSounds'), ['My_Sound_1-2.wav', 'My_Sound_1.wav']);
  // The same file again is not copied twice.
  assert.deepEqual(await call('pickSounds'), ['My_Sound_1-2.wav', 'My_Sound_1.wav']);
  fake.pick = [];
  assert.deepEqual(await call('pickSounds'), ['My_Sound_1-2.wav', 'My_Sound_1.wav']);
  assert.ok(fs.existsSync(path.join(fake.dir, 'sounds', 'My_Sound_1.wav')));
  assert.ok(fake.sent.some((s) => s.event === 'status' && (s.value as AlertsStatus).sounds.length === 2));

  await call('preview', 'My_Sound_1.wav');
  assert.deepEqual(fake.played, [{ volume: 1, bytes: WAV.length }]);
  await assert.rejects(call('preview', '../picked/notes.txt'), /no-sound/);
  await assert.rejects(call('preview', 'missing.wav'), /no-sound/);
  await assert.rejects(call('preview', { name: 'x' }));

  assert.deepEqual(await call('removeSound', 'My_Sound_1-2.wav'), ['My_Sound_1.wav']);
  assert.deepEqual(await call('removeSound', '../secret.txt'), ['My_Sound_1.wav']);
  assert.ok(fs.existsSync(path.join(picked, 'notes.txt')));

  await call('copyUrl');
  await call('openUrl');
  assert.deepEqual(fake.copied, ['http://127.0.0.1:47391/alerts/key/']);
  assert.deepEqual(fake.opened, ['http://127.0.0.1:47391/alerts/key/']);
});

test('the sounds folder: names are cleaned, odd files are not listed', () => {
  assert.equal(cleanName('Tada! (final).MP3'), 'Tada_final.mp3');
  assert.equal(cleanName('  .wav'), 'sound.wav');
  assert.equal(cleanName('Maldö.ogg'), 'Mald.ogg');
  assert.equal(cleanName('song.flac'), undefined);
  assert.equal(cleanName('x'.repeat(200) + '.wav')?.length, 104);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-sounds-'));
  try {
    const folder = new SoundFolder(path.join(dir, 'sounds'), () => undefined);
    assert.deepEqual(folder.list(), []);
    fs.mkdirSync(folder.dir);
    fs.writeFileSync(path.join(folder.dir, 'b.wav'), WAV);
    fs.writeFileSync(path.join(folder.dir, 'a.mp3'), WAV);
    fs.writeFileSync(path.join(folder.dir, 'notes.txt'), 'x');
    fs.mkdirSync(path.join(folder.dir, 'dir.wav'));
    assert.deepEqual(folder.list(), ['a.mp3', 'b.wav']);
    assert.equal(folder.resolve('..'), undefined);
    assert.equal(folder.resolve('dir.wav'), path.join(folder.dir, 'dir.wav'));
    assert.equal(folder.read('dir.wav'), undefined);
    assert.equal(folder.read('notes.txt'), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
