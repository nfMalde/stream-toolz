import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import type { AudioSink, ModuleHost } from '@stream-toolz/core';
import type { CustomReward, TwitchEvents } from '@stream-toolz/twitch';
import { channelpointsModule } from '../main/module';
import { cleanName } from '../main/sounds';
import type { ChannelpointsStatus, PickSoundsResult, RewardsResult } from '../src/api';
import { DEFAULT_REWARD, DEFAULT_SETTINGS, normalizeSettings, type Settings } from '../src/settings';
import { FakeSink, redemption, tick, until } from './helpers';

/** The host as the module sees it: fakes for every output, the data folder in a temp dir. */
function fakeHost(change: Partial<Settings> = {}) {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-channelpoints-'));
  const sounds = path.join(dataDir, 'sounds');
  fs.mkdirSync(sounds, { recursive: true });
  fs.writeFileSync(path.join(sounds, 'hydrate.wav'), 'RIFF hydrate');
  fs.writeFileSync(path.join(sounds, 'jump.mp3'), 'ID3 jump');
  fs.writeFileSync(path.join(sounds, 'notes.txt'), 'not a sound');

  let settings: Settings = { ...DEFAULT_SETTINGS, rewards: { hydrate: { ...DEFAULT_REWARD, title: 'Hydrate', sound: 'hydrate.wav' } }, ...change };
  const device = new FakeSink();
  const obs = new FakeSink();
  const listeners = new Map<string, (...args: unknown[]) => void>();
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const sent: { event: string; value: unknown }[] = [];
  const picked: string[] = [];
  let rewards: CustomReward[] | Error = [];
  let connected = true;

  const host: ModuleHost<Settings> = {
    id: 'channelpoints',
    dev: true,
    log: () => undefined,
    settings: () => settings,
    updateSettings: async (c) => (settings = normalizeSettings({ ...settings, ...c }, settings)),
    app: () => ({ language: 'de', serverPort: 47392, channel: '', streamerMode: false }),
    twitch: {
      on: (event, listener) => void listeners.set(event, listener as (...args: unknown[]) => void),
      ownUserId: 'me',
      get connected() {
        return connected;
      },
      customRewards: async () => {
        if (rewards instanceof Error) throw rewards;
        return rewards;
      },
      sendMessage: async () => undefined,
    },
    audio: { device: () => device as AudioSink, obs, status: { obsClients: 1, portInUse: false } },
    speech: { voicesDir: '', workDir: '' },
    hotkeys: { set: () => undefined },
    server: { handle: () => undefined, url: () => '' },
    desktop: {
      copyText: () => undefined,
      openLocalPage: async () => undefined,
      openFolder: async () => undefined,
      pickFolder: async () => undefined,
      pickFiles: async () => picked,
    },
    bridge: { handle: (name, handler) => void handlers.set(name, handler), send: (event, value) => void sent.push({ event, value }) },
    dataDir,
  };
  const call = <T>(name: string, ...args: unknown[]): Promise<T> => Promise.resolve(handlers.get(name)!(...args) as T);
  const emit = <E extends keyof TwitchEvents>(event: E, ...args: TwitchEvents[E]) => listeners.get(event)?.(...args);
  return {
    host,
    device,
    obs,
    sent,
    call,
    emit,
    dataDir,
    setRewards: (value: CustomReward[] | Error) => (rewards = value),
    setConnected: (value: boolean) => (connected = value),
    setPicked: (files: string[]) => picked.splice(0, picked.length, ...files),
    settings: () => settings,
    cleanup: () => fs.rmSync(dataDir, { recursive: true, force: true }),
  };
}

test('a redemption plays the reward\'s file on the device; an unknown reward is logged "no-sound"', async () => {
  const h = fakeHost();
  const instance = channelpointsModule.start(h.host);
  try {
    h.emit('redemption', redemption('hydrate', { name: 'Anna' }));
    h.emit('redemption', redemption('mystery', { rewardTitle: 'Mystery' }));
    await until(() => h.device.played.length > 0);
    assert.deepEqual(h.device.played, ['RIFF hydrate']);
    assert.deepEqual(h.obs.played, []);
    const status = await h.call<ChannelpointsStatus>('status');
    assert.deepEqual(status.sounds, ['hydrate.wav', 'jump.mp3']);
    // The unknown one is logged at once, the played one after its file was read.
    assert.deepEqual(status.log.map((e) => `${e.name}:${e.rewardTitle}:${e.outcome}`).sort(), ['Anna:Reward hydrate:played', 'Viewer:Mystery:no-sound']);
    assert.ok(h.sent.some((s) => s.event === 'status'));
  } finally {
    instance.stop();
    h.cleanup();
  }
});

test('output "obs" plays on the OBS source; a preview always goes to the device', async () => {
  const h = fakeHost({ output: 'obs' });
  const instance = channelpointsModule.start(h.host);
  try {
    h.emit('redemption', redemption('hydrate'));
    await until(() => h.obs.played.length > 0);
    assert.deepEqual(h.obs.played, ['RIFF hydrate']);
    await h.call('preview', 'jump.mp3');
    await until(() => h.device.played.length > 0);
    assert.deepEqual(h.device.played, ['ID3 jump']);
    await assert.rejects(h.call('preview', 'notes.txt'), /no-sound/);
    await assert.rejects(h.call('preview', '../config.json'), /no-sound/);
  } finally {
    instance.stop();
    h.cleanup();
  }
});

test('a test plays right away and is marked; switching the output stops the old sink', async () => {
  const h = fakeHost();
  const instance = channelpointsModule.start(h.host);
  try {
    await h.call('test', 'hydrate');
    await until(() => h.device.played.length > 0);
    assert.deepEqual(h.device.played, ['RIFF hydrate']);
    const status = await h.call<ChannelpointsStatus>('status');
    assert.equal(status.log[0]?.outcome, 'test');
    const before = h.settings();
    const next = await h.host.updateSettings({ output: 'obs' });
    instance.settingsChanged?.(next, before);
    assert.equal(h.device.stops, 1);
  } finally {
    instance.stop();
    h.cleanup();
  }
});

test('rewards: Twitch\'s list, or why not', async () => {
  const h = fakeHost();
  const instance = channelpointsModule.start(h.host);
  try {
    h.setRewards([{ id: 'hydrate', title: 'Hydrate', cost: 50, enabled: true }]);
    assert.deepEqual(await h.call<RewardsResult>('rewards'), { rewards: [{ id: 'hydrate', title: 'Hydrate', cost: 50, enabled: true }] });
    h.setRewards(Object.assign(new Error('Missing scope'), { status: 401 }));
    assert.deepEqual(await h.call<RewardsResult>('rewards'), { error: 'needs-login' });
    h.setRewards(Object.assign(new Error('Forbidden'), { status: 403 }));
    assert.deepEqual(await h.call<RewardsResult>('rewards'), { error: 'unavailable' });
    h.setRewards(new Error('Twitch is down'));
    assert.deepEqual(await h.call<RewardsResult>('rewards'), { error: 'Twitch is down' });
    h.setConnected(false);
    assert.deepEqual(await h.call<RewardsResult>('rewards'), { error: 'not-connected' });
  } finally {
    instance.stop();
    h.cleanup();
  }
});

test('picked files are copied in under cleaned names, never overwriting; too large or wrong types are rejected', async () => {
  const h = fakeHost();
  const instance = channelpointsModule.start(h.host);
  const source = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-picked-'));
  try {
    const files = {
      spaced: path.join(source, 'Mein Sound (final).WAV'),
      same: path.join(source, 'hydrate.wav'),
      big: path.join(source, 'big.ogg'),
      text: path.join(source, 'readme.txt'),
    };
    fs.writeFileSync(files.spaced, 'RIFF spaced');
    fs.writeFileSync(files.same, 'RIFF other hydrate');
    fs.writeFileSync(files.big, Buffer.alloc(10 * 1024 * 1024 + 1));
    fs.writeFileSync(files.text, 'x');
    h.setPicked([files.spaced, files.same, files.big, files.text]);
    const result = await h.call<PickSoundsResult>('pickSounds');
    assert.deepEqual(result, {
      added: ['Mein-Sound-final.wav', 'hydrate-2.wav'],
      rejected: [
        { name: 'big.ogg', reason: 'too-large' },
        { name: 'readme.txt', reason: 'type' },
      ],
    });
    assert.equal(fs.readFileSync(path.join(h.dataDir, 'sounds', 'hydrate.wav'), 'utf8'), 'RIFF hydrate');
    assert.equal(fs.readFileSync(path.join(h.dataDir, 'sounds', 'hydrate-2.wav'), 'utf8'), 'RIFF other hydrate');

    await h.call('removeSound', 'hydrate-2.wav');
    await h.call('removeSound', '../sounds/jump.mp3');
    const status = await h.call<ChannelpointsStatus>('status');
    // Sorted as the user reads them (case does not decide).
    assert.deepEqual(status.sounds, ['hydrate.wav', 'jump.mp3', 'Mein-Sound-final.wav']);
  } finally {
    instance.stop();
    h.cleanup();
    fs.rmSync(source, { recursive: true, force: true });
  }
});

test('a changed file is read again; the cache serves an unchanged one', async () => {
  const h = fakeHost();
  const instance = channelpointsModule.start(h.host);
  try {
    h.emit('redemption', redemption('hydrate'));
    await until(() => h.device.played.length === 1);
    const file = path.join(h.dataDir, 'sounds', 'hydrate.wav');
    fs.writeFileSync(file, 'RIFF hydrate v2 (longer)');
    h.emit('redemption', redemption('hydrate'));
    await until(() => h.device.played.length === 2);
    assert.deepEqual(h.device.played, ['RIFF hydrate', 'RIFF hydrate v2 (longer)']);
  } finally {
    instance.stop();
    h.cleanup();
  }
});

test('cleanName keeps letters, digits, "_", "-" and "." and lower-cases the extension', () => {
  assert.equal(cleanName('Mein Sound (final).WAV'), 'Mein-Sound-final.wav');
  assert.equal(cleanName('..hidden.mp3'), 'hidden.mp3');
  // Umlauts lose their marks (NFKD), "ß" is not a word character.
  assert.equal(cleanName('Äh ja.ogg'), 'Ah-ja.ogg');
  assert.equal(cleanName('!!!.wav'), 'sound.wav');
  assert.ok(cleanName(`${'a'.repeat(300)}.wav`).length <= 104);
});
