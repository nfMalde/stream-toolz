// Alerts in the main process: the queue on the shell's Twitch connection, the overlay page on the local server
// (server-sent events: the style, then one alert at a time), the sounds folder, and its calls from the UI
// (window.stz.alerts). Everything it uses comes from its host (packages/core/src/module.ts); the shell takes
// handlers, listeners and shortcuts back when it stops.

import type { IncomingMessage, ServerResponse } from 'node:http';
import path from 'node:path';
import { asString, type ModuleDefinition } from '@stream-toolz/core';
import { CHANNEL_EVENT_KINDS, type ChannelEventKind } from '@stream-toolz/twitch';
import { ALERTS, type AlertsStatus } from '../src/api';
import { AlertQueue, sampleEvent } from '../src/queue';
import { defaultSettings, normalizeSettings, type Settings } from '../src/settings';
import { page, PAGE_VERSION, pageTexts, SCRIPT, STYLE } from './page';
import { contentType, SOUND_EXTENSIONS, SoundFolder } from './sounds';

/** A comment line now and then keeps the connection open through OBS and proxies. */
const PING_MS = 15_000;
/** Connected pages at most; beyond that the oldest is dropped (a leaked key must not pile up connections). */
const MAX_CLIENTS = 8;

interface Client {
  res: ServerResponse;
  ping: ReturnType<typeof setInterval>;
}

export const alertsModule: ModuleDefinition<Settings> = {
  id: ALERTS,
  enabledByDefault: false,
  settings: { defaults: defaultSettings, normalize: normalizeSettings },
  // Subs, gifts and raids come with the chat; follows when the login allows them.
  twitch: ['chat', 'follows'],

  start(host) {
    const settings = () => host.settings();
    const language = () => host.app().language;
    const sounds = new SoundFolder(path.join(host.dataDir, 'sounds'), host.log);
    const device = host.audio.device(() => settings().deviceId);
    const queue = new AlertQueue({ settings, language });
    const clients: Client[] = [];
    let timer: ReturnType<typeof setTimeout> | undefined;
    let tests = 0;
    const { handle, send: sendToUi } = host.bridge;

    // --- The overlay pages ---

    const event = (client: Client, name: string, data: unknown) => client.res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
    const broadcast = (name: string, data: unknown) => {
      for (const client of clients) event(client, name, data);
    };
    const styleEvent = () => ({ style: settings().style, kinds: pageTexts(language()).kinds });
    const drop = (client: Client) => {
      clearInterval(client.ping);
      client.res.end();
    };

    const status = (): AlertsStatus => {
      const current = queue.showing(Date.now());
      return { url: host.server.url(), sounds: sounds.list(), queued: queue.waitingCount, ...(current ? { current } : {}), pages: clients.length };
    };
    const announce = () => sendToUi('status', status());

    const connect = (req: IncomingMessage, res: ServerResponse) => {
      res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff' });
      res.write('retry: 2000\n\n');
      const client: Client = { res, ping: setInterval(() => res.write(': ping\n\n'), PING_MS) };
      while (clients.length >= MAX_CLIENTS) drop(clients.shift()!);
      clients.push(client);
      // A page from an older app version reloads itself; a page opened mid-alert shows the rest of it.
      event(client, 'hello', { page: PAGE_VERSION });
      event(client, 'style', styleEvent());
      const now = Date.now();
      const current = queue.showing(now);
      if (current) event(client, 'alert', { ...current, durationMs: Math.max(500, queue.currentEndsAt - now), soundUrl: '' });
      host.log(`ALERTS    overlay connected (${clients.length})`);
      announce();
      req.on('close', () => {
        clearInterval(client.ping);
        const index = clients.indexOf(client);
        if (index >= 0) clients.splice(index, 1);
        host.log(`ALERTS    overlay disconnected (${clients.length})`);
        announce();
      });
    };

    host.server.handle((req, res, rest) => {
      if (req.method !== 'GET') return send(res, 405, 'text/plain', 'method not allowed');
      if (rest === '') return send(res, 200, 'text/html; charset=utf-8', page(language()));
      if (rest === 'page.js') return send(res, 200, 'text/javascript; charset=utf-8', SCRIPT);
      if (rest === 'style.css') return send(res, 200, 'text/css; charset=utf-8', STYLE);
      if (rest === 'events') return connect(req, res);
      // Only a plain name below sound/: the folder decides whether it is one of its files (never "..", never a path).
      const sound = /^sound\/([^/\\]+)$/.exec(rest);
      if (sound) {
        const name = decode(sound[1]!);
        const data = name ? sounds.read(name) : undefined;
        return data ? send(res, 200, contentType(name!)!, data) : send(res, 404, 'text/plain', 'not found');
      }
      send(res, 404, 'text/plain', 'not found');
    });

    // --- The queue ---

    /** Shows the next alert when the screen is free, and comes back when it ends. */
    const pump = () => {
      clearTimeout(timer);
      timer = undefined;
      const now = Date.now();
      const alert = queue.advance(now);
      if (alert) {
        broadcast('alert', { ...alert, soundUrl: alert.sound ? `sound/${encodeURIComponent(alert.sound)}` : '' });
        if (alert.sound && settings().deviceOutput) {
          const data = sounds.read(alert.sound);
          if (data) {
            device.stop();
            void device.play(data, alert.volume);
          }
        }
      }
      if (queue.currentEndsAt > now) timer = setTimeout(pump, queue.currentEndsAt - now + 50);
      announce();
    };

    host.twitch.on('event', (incoming) => {
      const result = queue.push(incoming, Date.now());
      if (result === 'queued' || result === 'merged') pump();
    });

    // --- Calls from the UI ---

    handle('status', () => status());
    handle('test', (kind) => {
      if (!CHANNEL_EVENT_KINDS.includes(kind as ChannelEventKind)) throw new Error('Invalid argument');
      queue.push(sampleEvent(kind as ChannelEventKind, language(), `test-${++tests}`));
      pump();
    });
    handle('clear', () => {
      queue.clear();
      device.stop();
      broadcast('clear', {});
      pump();
    });
    handle('pickSounds', async () => {
      const files = await host.desktop.pickFiles(SOUND_EXTENSIONS);
      const list = files.length ? sounds.add(files) : sounds.list();
      if (files.length) {
        host.log(`ALERTS    ${files.length} sound file(s) picked, ${list.length} in the folder`);
        announce();
      }
      return list;
    });
    handle('removeSound', (name) => {
      const list = sounds.remove(asString(name));
      announce();
      return list;
    });
    // Previews are for the user's own ears: always on the audio device, never on the stream.
    handle('preview', (name) => {
      const data = sounds.read(asString(name));
      if (!data) throw new Error('no-sound');
      device.stop();
      void device.play(data, 1);
    });
    handle('copyUrl', () => host.desktop.copyText(host.server.url()));
    handle('openUrl', () => host.desktop.openLocalPage(host.server.url()));

    host.log(`ALERTS    started`);

    return {
      settingsChanged(next, before) {
        if (JSON.stringify(next.style) !== JSON.stringify(before.style)) broadcast('style', styleEvent());
        if (before.deviceOutput && !next.deviceOutput) device.stop();
      },
      // The language changes the kind labels; a new port changes the address.
      appChanged() {
        broadcast('style', styleEvent());
        announce();
      },
      stop() {
        clearTimeout(timer);
        queue.clear();
        device.stop();
        for (const client of clients.splice(0)) drop(client);
      },
    };
  },
};

/** A path segment decoded; undefined for a malformed one ("%" alone), which must not end in a 500. */
function decode(segment: string): string | undefined {
  try {
    return decodeURIComponent(segment);
  } catch {
    return undefined;
  }
}

/** The same headers as the shell's OBS page (apps/desktop/src/obs.ts), plus media-src for the <audio> element. */
export function send(res: ServerResponse, status: number, type: string, body: string | Buffer): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    // frame-ancestors: OBS loads the page at top level; a web page must not embed it.
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; media-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  });
  res.end(body);
}
