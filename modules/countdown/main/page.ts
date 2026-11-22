// The overlay: a transparent page for an OBS browser source, served by the shell's local server under
// /countdown/<key>/. It gets its look and the timers' texts as server-sent events: nothing is loaded from anywhere
// else, no inline script (CSP script-src 'self'), styles inline where the settings make them. The page stacks the
// timers, newest on top, and reconnects by itself.

import crypto from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Align, FontFamily } from '../src/settings';

export interface OverlayStyle {
  fontSize: number;
  fontFamily: FontFamily;
  color: string;
  align: Align;
  shadow: boolean;
  showLabel: boolean;
  labelSize: number;
}

export interface OverlayTimer {
  id: string;
  label: string;
  text: string;
  done: boolean;
}

export interface OverlayPageOptions {
  style: () => OverlayStyle;
  /** Newest first. */
  timers: () => OverlayTimer[];
  language: () => string;
  onClients: (count: number) => void;
  log: (line: string) => void;
}

/** A comment line now and then keeps the connection open through OBS and proxies. */
const PING_MS = 15_000;
/** Connected pages at most; beyond that the oldest is dropped (a leaked key must not pile up connections). */
const MAX_CLIENTS = 8;
/** A page with more than this unread has stopped reading (a frozen source): it is dropped at the next ping. */
const MAX_BACKLOG_BYTES = 64 * 1024;

/** System font stacks only: nothing is downloaded. */
export const FONT_STACKS: Record<FontFamily, string> = {
  sans: 'system-ui, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
  mono: '"Cascadia Mono", Consolas, "SF Mono", Menlo, "DejaVu Sans Mono", monospace',
  serif: 'Georgia, "Times New Roman", Times, serif',
  rounded: 'ui-rounded, "Arial Rounded MT Bold", "Varela Round", "Nunito", "Segoe UI", system-ui, sans-serif',
};

const ITEMS: Record<Align, string> = { left: 'flex-start', center: 'center', right: 'flex-end' };

interface Client {
  res: ServerResponse;
  ping: ReturnType<typeof setInterval>;
}

export class OverlayPage {
  private readonly clients = new Set<Client>();
  private lastStyle = '';
  private lastTimers = '';

  constructor(private readonly options: OverlayPageOptions) {}

  get clientCount(): number {
    return this.clients.size;
  }

  /** Requests below /countdown/<key>/ (the key was checked): the page, its script, its style, the events. */
  handle(req: IncomingMessage, res: ServerResponse, rest: string): void {
    if (req.method !== 'GET') return send(res, 405, 'text/plain', 'method not allowed');
    if (rest === '') return send(res, 200, 'text/html; charset=utf-8', page(this.options.language()));
    if (rest === 'page.js') return send(res, 200, 'text/javascript; charset=utf-8', PAGE_SCRIPT);
    if (rest === 'style.css') return send(res, 200, 'text/css; charset=utf-8', css(this.options.style()));
    if (rest === 'events') return this.connect(req, res);
    send(res, 404, 'text/plain', 'not found');
  }

  /** The settings changed: open pages restyle, when the look differs. */
  refreshStyle(): void {
    const event = styleEvent(this.options.style());
    if (event === this.lastStyle) return;
    this.lastStyle = event;
    this.write(event);
  }

  /** The texts changed (the caller already knows they did; the same event twice is still sent only once). */
  refreshTimers(): void {
    const event = timersEvent(this.options.timers());
    if (event === this.lastTimers) return;
    this.lastTimers = event;
    this.write(event);
  }

  /** The module stops: every page is cut; OBS reconnects when it is back. */
  close(): void {
    for (const client of this.clients) this.drop(client);
    this.clients.clear();
    this.options.onClients(0);
  }

  private connect(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      ...SECURITY_HEADERS,
      'Content-Type': 'text/event-stream; charset=utf-8',
      Connection: 'keep-alive',
    });
    res.write('retry: 2000\n\n');
    const client: Client = { res, ping: setInterval(() => this.ping(client), PING_MS) };
    while (this.clients.size >= MAX_CLIENTS) {
      const oldest = this.clients.values().next().value!;
      this.clients.delete(oldest);
      this.drop(oldest);
    }
    this.clients.add(client);
    // A page from an older app version reloads itself; then the look and the timers as they are now.
    res.write(`event: hello\ndata: ${JSON.stringify({ page: PAGE_VERSION })}\n\n`);
    this.lastStyle = styleEvent(this.options.style());
    this.lastTimers = timersEvent(this.options.timers());
    res.write(this.lastStyle);
    res.write(this.lastTimers);
    this.options.log(`COUNTDOWN overlay connected (${this.clients.size})`);
    this.options.onClients(this.clients.size);
    req.on('close', () => {
      clearInterval(client.ping);
      if (!this.clients.delete(client)) return;
      this.options.log(`COUNTDOWN overlay disconnected (${this.clients.size})`);
      this.options.onClients(this.clients.size);
    });
  }

  private ping(client: Client): void {
    if (client.res.writableLength > MAX_BACKLOG_BYTES) {
      this.clients.delete(client);
      this.drop(client);
      client.res.destroy();
      this.options.log(`COUNTDOWN overlay stalled, dropped (${this.clients.size})`);
      this.options.onClients(this.clients.size);
      return;
    }
    client.res.write(': ping\n\n');
  }

  private drop(client: Client): void {
    clearInterval(client.ping);
    client.res.end();
  }

  private write(chunk: string): void {
    for (const client of this.clients) client.res.write(chunk);
  }
}

function styleEvent(style: OverlayStyle): string {
  return `event: style\ndata: ${JSON.stringify(cssValues(style))}\n\n`;
}

function timersEvent(timers: OverlayTimer[]): string {
  return `event: timers\ndata: ${JSON.stringify(timers)}\n\n`;
}

/** The CSS variables the page sets (style.css has the same ones as defaults). */
function cssValues(style: OverlayStyle): Record<string, string> {
  return {
    '--size': `${style.fontSize}px`,
    '--label-size': `${style.labelSize}px`,
    '--color': style.color,
    '--font': FONT_STACKS[style.fontFamily],
    '--align': style.align,
    '--items': ITEMS[style.align],
    '--shadow': style.shadow ? '0 2px 4px rgba(0,0,0,.9), 0 0 18px rgba(0,0,0,.6)' : 'none',
    '--label-display': style.showLabel ? 'block' : 'none',
  };
}

const SECURITY_HEADERS = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  // frame-ancestors: OBS loads the page at top level; a web page must not embed it.
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
};

/** The same headers as the shell's OBS source (apps/desktop/src/obs.ts; a module cannot import them). */
export function send(res: ServerResponse, status: number, type: string, body: string): void {
  res.writeHead(status, { ...SECURITY_HEADERS, 'Content-Type': type });
  res.end(body);
}

function page(language: string): string {
  const de = language.startsWith('de');
  return `<!doctype html>
<html lang="${de ? 'de' : 'en'}" data-page="${PAGE_VERSION}">
<head>
<meta charset="utf-8">
<title>Stream Toolz – Countdown${de ? ' (OBS-Quelle)' : ' (OBS source)'}</title>
<link rel="stylesheet" href="style.css">
</head>
<body>
<div id="timers"></div>
<script src="page.js"></script>
</body>
</html>`;
}

function css(style: OverlayStyle): string {
  const vars = Object.entries(cssValues(style))
    .map(([name, value]) => `  ${name}: ${value};`)
    .join('\n');
  return `:root {
${vars}
}
html, body { margin: 0; background: transparent; overflow: hidden; }
/* In a normal browser (a look before OBS) the white text needs a background; OBS keeps it transparent. */
body.browser { background: #0d0a07; min-height: 100vh; }
#timers {
  display: flex; flex-direction: column; align-items: var(--items); gap: 0.2em; padding: 12px 16px;
  font-family: var(--font); color: var(--color); text-align: var(--align); text-shadow: var(--shadow);
}
.timer { max-width: 100%; }
.timer .label {
  display: var(--label-display); font-size: var(--label-size); font-weight: 600; line-height: 1.2;
  overflow-wrap: anywhere;
}
.timer .time {
  font-size: var(--size); font-weight: 700; line-height: 1.1; white-space: nowrap;
  font-variant-numeric: tabular-nums; letter-spacing: 0.02em;
}
`;
}

/** The page's script (plain, no libraries). Labels and texts go in as text, never as HTML. */
const PAGE_SCRIPT = `'use strict';
(() => {
  const base = location.pathname.replace(/\\/$/, '');
  const root = document.documentElement;
  const list = document.getElementById('timers');
  if (typeof window.obsstudio === 'undefined') document.body.classList.add('browser');
  const elements = new Map();

  const applyStyle = (values) => {
    for (const name of Object.keys(values)) root.style.setProperty(name, values[name]);
  };

  // Elements are kept per timer and updated in place, so a running number never flickers.
  const render = (timers) => {
    const seen = new Set();
    let previous = null;
    for (const timer of timers) {
      seen.add(timer.id);
      let el = elements.get(timer.id);
      if (!el) {
        el = document.createElement('div');
        el.className = 'timer';
        const label = document.createElement('div');
        label.className = 'label';
        const time = document.createElement('div');
        time.className = 'time';
        el.append(label, time);
        elements.set(timer.id, el);
      }
      el.classList.toggle('done', !!timer.done);
      const label = el.firstChild;
      const time = el.lastChild;
      if (label.textContent !== timer.label) label.textContent = timer.label;
      if (timer.label) label.style.removeProperty('display'); else label.style.display = 'none';
      if (time.textContent !== timer.text) time.textContent = timer.text;
      const expected = previous ? previous.nextSibling : list.firstChild;
      if (el !== expected) list.insertBefore(el, expected);
      previous = el;
    }
    for (const [id, el] of elements) {
      if (seen.has(id)) continue;
      el.remove();
      elements.delete(id);
    }
  };

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
      if (JSON.parse(event.data).page !== root.dataset.page) location.reload();
    });
    events.addEventListener('style', (event) => applyStyle(JSON.parse(event.data)));
    events.addEventListener('timers', (event) => render(JSON.parse(event.data)));
  };
  connect();
})();
`;

/** Changes with the script: an OBS page still open from an older app version notices it and reloads. */
const PAGE_VERSION = crypto.createHash('sha256').update(PAGE_SCRIPT).digest('hex').slice(0, 12);
