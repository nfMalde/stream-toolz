import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { ModuleHost } from '@stream-toolz/core';
import type { TwitchStatus } from '@stream-toolz/twitch';
import { botModule } from '../main/module';
import type { BotStatus } from '../src/api';
import { normalizeSettings, type Settings } from '../src/settings';
import { command, flush, message } from './helpers';

/** The host as the bot sees it: settings in memory, a recording sendMessage, listeners the test can fire. */
function fakeHost(initial: Partial<Settings>) {
  let settings = normalizeSettings(initial);
  const lines: string[] = [];
  const sent: { text: string; replyTo?: string }[] = [];
  const events: unknown[] = [];
  const listeners = new Map<string, ((...args: never[]) => void)[]>();
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  let failures = 0;
  const host = {
    id: 'bot',
    dev: true,
    log: (line: string) => lines.push(line),
    settings: () => settings,
    updateSettings: async (change: Partial<Settings>) => (settings = normalizeSettings({ ...settings, ...change }, settings)),
    app: () => ({ language: 'de', serverPort: 0, channel: 'maldoe', streamerMode: false }),
    twitch: {
      on: (event: string, listener: (...args: never[]) => void) => listeners.set(event, [...(listeners.get(event) ?? []), listener]),
      ownUserId: 'me',
      connected: true,
      customRewards: async () => [],
      sendMessage: async (text: string, replyTo?: string) => {
        if (failures > 0) {
          failures--;
          throw new Error('Message dropped: not allowed');
        }
        sent.push(replyTo ? { text, replyTo } : { text });
      },
    },
    bridge: {
      handle: (name: string, handler: (...args: unknown[]) => unknown) => handlers.set(name, handler),
      send: (event: string, value: unknown) => events.push([event, value]),
    },
    dataDir: '',
  } as unknown as ModuleHost<Settings>;
  const emit = (event: string, ...args: unknown[]) => {
    for (const listener of listeners.get(event) ?? []) (listener as (...a: unknown[]) => void)(...args);
  };
  const call = <T>(name: string, ...args: unknown[]) => handlers.get(name)!(...args) as T;
  return { host, lines, sent, events, emit, call, settings: () => settings, failNext: (n: number) => void (failures = n) };
}

test('a send that fails is logged without the chat text, as a failed action; the next one goes out', async () => {
  const h = fakeHost({ commands: [command('discord', 'Secret link {user}')], globalCooldownSeconds: 0 });
  const instance = botModule.start(h.host);
  try {
    h.failNext(1);
    h.emit('message', message('!discord'));
    await flush();
    assert.deepEqual(h.lines, ['BOT       started', 'BOT       send failed: Message dropped: not allowed']);
    assert.ok(!h.lines.some((l) => l.includes('Secret link')));
    const status = await h.call<Promise<BotStatus>>('status');
    assert.deepEqual(
      status.log.map((e) => [e.outcome, e.error]),
      [['failed', 'Message dropped: not allowed']],
    );
    assert.equal(h.sent.length, 0);
  } finally {
    instance.stop();
  }

  const again = botModule.start(h.host);
  try {
    h.emit('message', message('!discord', { id: 'm-9' }));
    await flush();
    assert.deepEqual(h.sent, [{ text: 'Secret link Viewer', replyTo: 'm-9' }]);
    assert.equal(h.settings().commands[0]!.uses, 2, 'the count is persisted, also for the failed answer');
    assert.ok(h.events.some((e) => (e as [string, BotStatus])[0] === 'status' && (e as [string, BotStatus])[1].log.at(-1)?.outcome === 'sent'));
  } finally {
    again.stop();
  }
});

test('the bridge: status follows the Twitch status, preview renders, sendTest sends, resetUses saves zero', async () => {
  const h = fakeHost({ commands: [command('hi', 'Hi {user} #{count} {args}', { uses: 7 })] });
  const instance = botModule.start(h.host);
  try {
    let status = await h.call<Promise<BotStatus>>('status');
    assert.equal(status.canWrite, undefined);
    h.emit('status', { stage: 'connected', hasApp: true, asks: [], features: { chat: 'active', chatWrite: 'needs-login' }, channel: { id: '1', login: 'maldoe', name: 'Maldö' } } satisfies TwitchStatus);
    status = await h.call<Promise<BotStatus>>('status');
    assert.equal(status.canWrite, 'needs-login');
    assert.equal(status.connected, true);

    assert.equal(await h.call<Promise<string>>('preview', 'c-hi', 'there'), 'Hi Zuschauer #8 there');
    await assert.rejects(async () => h.call('preview', 'nope', ''), /unknown-command/);
    await assert.rejects(async () => h.call('preview', 42, ''), /Invalid argument/);

    h.call('sendTest', 'Test from the app');
    await flush();
    assert.deepEqual(h.sent, [{ text: 'Test from the app' }]);
    assert.equal((await h.call<Promise<BotStatus>>('status')).log[0]!.outcome, 'test');

    await h.call<Promise<void>>('resetUses', 'c-hi');
    assert.equal(h.settings().commands[0]!.uses, 0);
    assert.equal(await h.call<Promise<string>>('preview', 'c-hi', ''), 'Hi Zuschauer #1');
  } finally {
    instance.stop();
  }
});
