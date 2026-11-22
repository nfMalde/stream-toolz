import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { test } from 'node:test';
import type { AppSettings, LocalRequestHandler, ModuleHost } from '@stream-toolz/core';
import type { TwitchEvents } from '@stream-toolz/twitch';
import { chatoverlayModule } from '../main/module';
import { PAGE_VERSION } from '../main/page';
import { DEFAULT_SETTINGS, type Settings } from '../src/settings';
import { event, message } from './helpers';

/** A response that collects what the module writes (the SSE frames) and the headers it sets. */
class FakeResponse {
  status = 0;
  headers: Record<string, string> = {};
  chunks: string[] = [];
  ended = false;
  destroyed = false;
  writableLength = 0;
  socket = undefined;
  writeHead(status: number, headers: Record<string, string>): this {
    this.status = status;
    this.headers = headers;
    return this;
  }
  write(chunk: string): boolean {
    this.chunks.push(chunk);
    return true;
  }
  end(body?: string): this {
    if (body !== undefined) this.chunks.push(body);
    this.ended = true;
    return this;
  }
  destroy(): void {
    this.destroyed = true;
  }
  get body(): string {
    return this.chunks.join('');
  }
  /** The SSE events written so far: name and parsed data. */
  get events(): { name: string; data: unknown }[] {
    return [...this.body.matchAll(/event: (\S+)\ndata: (.*)\n\n/g)].map((m) => ({ name: m[1]!, data: JSON.parse(m[2]!) }));
  }
}

class FakeRequest extends EventEmitter {
  constructor(public method = 'GET') {
    super();
  }
  headers = {};
}

function fakeHost() {
  const listeners = new Map<string, ((...args: unknown[]) => void)[]>();
  const handlers = new Map<string, (...args: unknown[]) => unknown>();
  const sent: { event: string; value: unknown }[] = [];
  const log: string[] = [];
  const copied: string[] = [];
  const opened: string[] = [];
  let settings: Settings = { ...DEFAULT_SETTINGS, maxMessages: 3 };
  const app: AppSettings = { language: 'de', serverPort: 47392, channel: '', streamerMode: false } as AppSettings;
  let handler: LocalRequestHandler | undefined;
  const host: ModuleHost<Settings> = {
    id: 'chatoverlay',
    dev: true,
    log: (line) => void log.push(line),
    settings: () => settings,
    updateSettings: async (change) => (settings = { ...settings, ...change }),
    app: () => app,
    twitch: {
      on: (name, listener) => {
        const list = listeners.get(name) ?? [];
        list.push(listener as (...args: unknown[]) => void);
        listeners.set(name, list);
      },
      ownUserId: '1',
      connected: true,
      customRewards: async () => [],
      sendMessage: async () => undefined,
    },
    audio: undefined as never,
    speech: { voicesDir: '', workDir: '' },
    hotkeys: { set: () => undefined },
    server: { handle: (h) => (handler = h), url: () => 'http://127.0.0.1:47392/chatoverlay/key123/' },
    desktop: {
      copyText: (text) => void copied.push(text),
      openLocalPage: async (url) => void opened.push(url),
      openFolder: async () => undefined,
      pickFolder: async () => undefined,
      pickFiles: async () => [],
    },
    bridge: {
      handle: (name, h) => void handlers.set(name, h),
      send: (event, value) => void sent.push({ event, value }),
    },
    dataDir: '',
  };
  const emit = <E extends keyof TwitchEvents>(name: E, ...args: TwitchEvents[E]) => {
    for (const listener of listeners.get(name) ?? []) listener(...args);
  };
  const request = (rest: string, method = 'GET') => {
    const req = new FakeRequest(method);
    const res = new FakeResponse();
    void handler!(req as unknown as IncomingMessage, res as unknown as ServerResponse, rest);
    return { req, res };
  };
  const call = (name: string, ...args: unknown[]) => handlers.get(name)!(...args);
  return { host, emit, request, call, sent, log, copied, opened, app, setSettings: (next: Partial<Settings>) => (settings = { ...settings, ...next }), settings: () => settings };
}

test('serves the page, its script, its stylesheet; nothing else; no writes', () => {
  const h = fakeHost();
  const instance = chatoverlayModule.start(h.host);
  const page = h.request('').res;
  assert.equal(page.status, 200);
  assert.match(page.headers['Content-Type']!, /text\/html/);
  assert.match(page.headers['Content-Security-Policy']!, /script-src 'self'/);
  assert.match(page.headers['Content-Security-Policy']!, /img-src 'none'/);
  assert.match(page.body, /<html lang="de"/);
  assert.match(page.body, new RegExp(`data-page="${PAGE_VERSION}"`));
  assert.doesNotMatch(page.body, /<script>[^<]/);
  assert.match(h.request('page.js').res.headers['Content-Type']!, /javascript/);
  assert.match(h.request('style.css').res.body, /\.stz-chat-overlay/);
  assert.equal(h.request('other').res.status, 404);
  assert.equal(h.request('', 'POST').res.status, 405);
  assert.ok(h.log.some((line) => line.startsWith('CHATOVERLAY')));
  instance.stop();
});

test('emote pictures: the page allows Twitch CDN only with emotes "images", and the pages reload on that change', () => {
  const h = fakeHost();
  h.setSettings({ emotes: 'images' });
  const instance = chatoverlayModule.start(h.host);
  assert.match(h.request('').res.headers['Content-Security-Policy']!, /img-src https:\/\/static-cdn\.jtvnw\.net;/);
  const { res } = h.request('events');
  const before = h.settings();
  h.setSettings({ emotes: 'text' });
  instance.settingsChanged?.(h.settings(), before);
  assert.deepEqual(res.events.at(-1), { name: 'reload', data: {} });
  instance.stop();
});

test('an event stream gets hello, style, texts and the backlog, then every change', () => {
  const h = fakeHost();
  const instance = chatoverlayModule.start(h.host);
  h.emit('message', message('first', { id: 'a' }));
  const { req, res } = h.request('events');
  assert.equal(res.status, 200);
  assert.match(res.headers['Content-Type']!, /text\/event-stream/);
  assert.match(res.body, /^retry: 2000\n\n/);
  const names = res.events.map((e) => e.name);
  assert.deepEqual(names, ['hello', 'style', 'texts', 'backlog']);
  assert.deepEqual(res.events[0]!.data, { page: PAGE_VERSION });
  assert.equal((res.events[1]!.data as { maxMessages: number }).maxMessages, 3);
  assert.match((res.events[2]!.data as { empty: string }).empty, /OBS/);
  assert.equal((res.events[3]!.data as { items: { id: string }[] }).items[0]!.id, 'a');
  assert.deepEqual(h.sent.at(-1), { event: 'clients', value: 1 });

  h.emit('message', message('second', { id: 'b', login: 'nightbot' }));
  assert.equal(res.events.length, 4, 'a bot is not shown');
  h.emit('message', message('Kappa', { id: 'c', fragments: [{ kind: 'emote', text: 'Kappa', emoteId: '25' }] }));
  const last = res.events.at(-1)!;
  assert.equal(last.name, 'message');
  assert.equal((last.data as { parts: { emoteId?: string }[] }).parts[0]!.emoteId, '25');
  assert.equal(h.sent.at(-1)!.event, 'item');

  h.emit('deleted', 'a');
  assert.deepEqual(res.events.at(-1), { name: 'remove', data: { ids: ['a'] } });
  assert.deepEqual(h.sent.at(-1), { event: 'removed', value: ['a'] });
  h.emit('event', event('follow', { name: 'Fan' }));
  assert.match((res.events.at(-1)!.data as { parts: { text: string }[] }).parts[0]!.text, /Fan folgt jetzt/);
  h.emit('userCleared', 'u1');
  assert.equal(res.events.at(-1)!.name, 'remove');
  h.emit('chatCleared');
  assert.deepEqual(res.events.at(-1), { name: 'clear', data: {} });
  assert.deepEqual(h.sent.at(-1), { event: 'cleared', value: null });

  // The style follows the settings; the texts follow the language.
  const before = h.settings();
  h.setSettings({ fontSize: 40 });
  instance.settingsChanged?.(h.settings(), before);
  assert.equal((res.events.at(-1)!.data as { fontSize: number }).fontSize, 40);
  instance.appChanged?.({ ...h.app, language: 'en' }, h.app);
  assert.deepEqual(res.events.at(-1)!.name, 'texts');
  assert.match((res.events.at(-1)!.data as { empty: string }).empty, /waiting/);

  // The source leaves, the count follows; stop ends everything.
  req.emit('close');
  assert.deepEqual(h.sent.at(-1), { event: 'clients', value: 0 });
  const second = h.request('events').res;
  instance.stop();
  assert.equal(second.ended, true);
});

test('calls from the UI: status, copy, open, test messages', async () => {
  const h = fakeHost();
  const instance = chatoverlayModule.start(h.host);
  h.emit('message', message('hi', { id: 'x' }));
  const status = h.call('status') as { url: string; items: { id: string }[]; clients: number };
  assert.equal(status.url, 'http://127.0.0.1:47392/chatoverlay/key123/');
  assert.deepEqual(status.items.map((i) => i.id), ['x']);
  assert.equal(status.clients, 0);
  h.call('copyUrl');
  assert.deepEqual(h.copied, [status.url]);
  await h.call('openUrl');
  assert.deepEqual(h.opened, [status.url]);
  h.call('testMessages');
  const after = h.call('status') as { items: { test?: boolean }[] };
  // maxMessages is 3 here: the test round leaves the last three, all marked.
  assert.equal(after.items.length, 3);
  assert.ok(after.items.every((i) => i.test));
  instance.stop();
});
