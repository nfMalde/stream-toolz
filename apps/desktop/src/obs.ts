// Output 'obs': an OBS browser source plays the voice. With "Control audio via OBS" the sound goes only to
// the OBS mixer (and the stream), not to the speakers. The page gets each clip announced over server-sent
// events, fetches it, plays it and reports when it ended. Only the newest connected source plays, so the
// same URL in two sources does not play twice.

import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { AudioSink } from '@stream-toolz/core';
import { wavDuration } from '@stream-toolz/speech';

/** Extra time after a clip's length before it counts as ended (the page did not answer). */
const END_MARGIN_MS = 5_000;
/** A comment line now and then keeps the connection open through OBS and proxies. */
const PING_MS = 15_000;
/** Connected sources at most; beyond that the oldest is dropped (a leaked key must not pile up connections). */
const MAX_CLIENTS = 8;
/** A clip never waits longer than this for the page's "done" (a broken header could claim hours). */
const MAX_CLIP_SECONDS = 600;

interface Client {
  id: number;
  res: ServerResponse;
  ping: ReturnType<typeof setInterval>;
}

export class ObsOutput implements AudioSink {
  private readonly clients: Client[] = [];
  private readonly clips = new Map<string, Buffer>();
  private readonly playing = new Map<string, () => void>();
  private nextClient = 1;

  constructor(
    private readonly onClients: (count: number) => void,
    private readonly log: (line: string) => void,
  ) {}

  get ready(): boolean {
    return this.clients.length > 0;
  }

  get clientCount(): number {
    return this.clients.length;
  }

  play(wav: Buffer, volume: number): Promise<void> {
    const client = this.clients.at(-1);
    if (!client) return Promise.resolve();
    const id = crypto.randomBytes(8).toString('hex');
    const seconds = clipSeconds(wav);
    this.clips.set(id, wav);
    return new Promise((resolve) => {
      const timer = setTimeout(() => this.finish(id), seconds * 1000 + END_MARGIN_MS);
      this.playing.set(id, () => {
        clearTimeout(timer);
        this.clips.delete(id);
        resolve();
      });
      this.event(client, 'play', { id, volume: Math.max(0, Math.min(1, volume)) });
    });
  }

  stop(): void {
    for (const client of this.clients) this.event(client, 'stop', {});
    for (const id of [...this.playing.keys()]) this.finish(id);
  }

  close(): void {
    this.stop();
    this.dropClients();
  }

  /**
   * Ends every connected source. After "New address" the pages reconnect, get 404 under the old key and are
   * gone for good; without this a page holding the old address would stay the one that plays.
   */
  dropClients(): void {
    for (const client of this.clients.splice(0)) this.drop(client);
    this.onClients(0);
  }

  private drop(client: Client): void {
    clearInterval(client.ping);
    client.res.end();
  }

  /** Requests below /obs/<key>/ (the key was checked): the page, its script, the events, the clips. */
  handle(req: IncomingMessage, res: ServerResponse, rest: string, language: string): void {
    if (req.method === 'GET' && rest === '') return send(res, 200, 'text/html; charset=utf-8', page(language));
    if (req.method === 'GET' && rest === 'player.js') return send(res, 200, 'text/javascript; charset=utf-8', PLAYER);
    if (req.method === 'GET' && rest === 'events') return this.connect(req, res);
    const clip = /^clip\/([0-9a-f]{16})$/.exec(rest);
    if (req.method === 'GET' && clip) {
      const wav = this.clips.get(clip[1]!);
      return wav ? send(res, 200, 'audio/wav', wav) : send(res, 404, 'text/plain', 'gone');
    }
    const done = /^done\/([0-9a-f]{16})$/.exec(rest);
    if (req.method === 'POST' && done) {
      this.finish(done[1]!);
      return send(res, 204, 'text/plain', '');
    }
    send(res, 404, 'text/plain', 'not found');
  }

  private connect(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-store', Connection: 'keep-alive', 'X-Content-Type-Options': 'nosniff' });
    res.write('retry: 2000\n\n');
    const client: Client = { id: this.nextClient++, res, ping: setInterval(() => res.write(': ping\n\n'), PING_MS) };
    while (this.clients.length >= MAX_CLIENTS) this.drop(this.clients.shift()!);
    // The newest source plays; the others stay quiet.
    for (const other of this.clients) this.event(other, 'idle', {});
    this.clients.push(client);
    // A page from an older app version reloads itself; a source that was quiet before plays again.
    this.event(client, 'hello', { player: PLAYER_VERSION });
    this.event(client, 'active', {});
    this.log(`OBS       browser source connected (${this.clients.length})`);
    this.onClients(this.clients.length);
    req.on('close', () => {
      clearInterval(client.ping);
      const index = this.clients.indexOf(client);
      if (index >= 0) this.clients.splice(index, 1);
      this.log(`OBS       browser source disconnected (${this.clients.length})`);
      const newest = this.clients.at(-1);
      if (newest) this.event(newest, 'active', {});
      this.onClients(this.clients.length);
    });
  }

  private event(client: Client, name: string, data: unknown): void {
    client.res.write(`event: ${name}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  private finish(id: string): void {
    const done = this.playing.get(id);
    this.playing.delete(id);
    done?.();
  }
}

export function send(res: ServerResponse, status: number, type: string, body: string | Buffer): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    // frame-ancestors: OBS loads the page at top level; a web page must not embed it (and play the chat there).
    'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  });
  res.end(body);
}

/** How long a clip plays, from its header; 10 s when that cannot be read (the player reports the end anyway). */
export function clipSeconds(wav: Buffer): number {
  try {
    const seconds = wavDuration(wav);
    return Number.isFinite(seconds) ? Math.min(MAX_CLIP_SECONDS, Math.max(0, seconds)) : 10;
  } catch {
    return 10;
  }
}

const TEXTS = {
  de: {
    title: 'Stream Toolz – ReadMyChat (OBS-Quelle)',
    obs: 'Verbunden. Diese Quelle spielt den Chat ab.',
    browser: 'Diese Seite ist für OBS gedacht (Browserquelle). Im Browser: einmal klicken, damit der Ton spielen darf.',
    idle: 'Eine andere Quelle mit dieser Adresse spielt gerade.',
  },
  en: {
    title: 'Stream Toolz – ReadMyChat (OBS source)',
    obs: 'Connected. This source plays the chat.',
    browser: 'This page is meant for OBS (browser source). In a browser: click once so the sound may play.',
    idle: 'Another source with this address is playing.',
  },
};

/** Transparent in OBS; in a normal browser a short note (and a click to allow sound). */
function page(language: string): string {
  const t = language.startsWith('de') ? TEXTS.de : TEXTS.en;
  return `<!doctype html>
<html lang="${language.startsWith('de') ? 'de' : 'en'}" data-player="${PLAYER_VERSION}">
<head>
<meta charset="utf-8">
<title>${t.title}</title>
<style>
  html, body { margin: 0; background: transparent; }
  #note { display: none; font: 15px/1.5 system-ui, sans-serif; color: #f4ede6; background: #18120d; padding: 16px 20px; margin: 20px; border-radius: 12px; max-width: 520px; }
  body.browser #note { display: block; }
</style>
</head>
<body>
<div id="note" data-obs="${t.obs}" data-browser="${t.browser}" data-idle="${t.idle}"></div>
<script src="player.js"></script>
</body>
</html>`;
}

/** The player in the browser source (plain script, no libraries). */
const PLAYER = `'use strict';
(() => {
  const base = location.pathname.replace(/\\/$/, '');
  const note = document.getElementById('note');
  const inObs = typeof window.obsstudio !== 'undefined';
  if (!inObs) document.body.classList.add('browser');
  note.textContent = inObs ? note.dataset.obs : note.dataset.browser;
  const context = new AudioContext();
  let current = null;
  let active = true;

  const done = (id) => fetch(base + '/done/' + id, { method: 'POST' }).catch(() => undefined);
  const stop = () => {
    const source = current;
    current = null;
    if (source) try { source.stop(); } catch (e) {}
  };
  document.addEventListener('click', () => context.resume());

  // The browser retries a lost connection by itself (the app restarts), but gives up after an error answer,
  // e.g. from a second Stream Toolz with another address on this port. Then this tries again, ever slower.
  let wait = 2000;
  const connect = () => {
    const events = new EventSource(base + '/events');
    events.addEventListener('open', () => { wait = 2000; });
    events.addEventListener('error', () => {
      if (events.readyState !== EventSource.CLOSED) return;
      setTimeout(connect, wait);
      wait = Math.min(wait * 2, 30000);
    });
    events.addEventListener('hello', (event) => {
      if (JSON.parse(event.data).player !== document.documentElement.dataset.player) location.reload();
    });
    events.addEventListener('play', async (event) => {
      const { id, volume } = JSON.parse(event.data);
      if (!active) return;
      try {
        const response = await fetch(base + '/clip/' + id);
        if (!response.ok) return done(id);
        const buffer = await context.decodeAudioData(await response.arrayBuffer());
        if (context.state !== 'running') await context.resume();
        stop();
        const gain = context.createGain();
        gain.gain.value = volume;
        const source = context.createBufferSource();
        source.buffer = buffer;
        source.connect(gain).connect(context.destination);
        source.onended = () => {
          if (current === source) current = null;
          done(id);
        };
        current = source;
        source.start();
      } catch (e) {
        done(id);
      }
    });
    events.addEventListener('stop', stop);
    events.addEventListener('idle', () => {
      active = false;
      stop();
      note.textContent = note.dataset.idle;
    });
    events.addEventListener('active', () => {
      active = true;
      note.textContent = inObs ? note.dataset.obs : note.dataset.browser;
    });
  };
  connect();
})();
`;

/** Changes with the player: an OBS page still open from an older app version notices it and reloads. */
const PLAYER_VERSION = crypto.createHash('sha256').update(PLAYER).digest('hex').slice(0, 12);
