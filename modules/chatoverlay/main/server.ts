// The overlay's side of the shell's local server: the answers with their security headers, and the server-sent event
// stream to the pages in OBS (client bookkeeping after GT Toolz's overlay server: a cap, keep-alives, stalled clients
// dropped). The shell checked the key and the Host header before a request gets here.

import type { IncomingMessage, ServerResponse } from 'node:http';

/** More streams than an OBS scene needs are refused (a page left open in a browser loop must not pile up). */
const MAX_CLIENTS = 16;
/** A comment now and then keeps idle streams open through OBS's browser. */
const KEEP_ALIVE_MS = 15_000;
/** A client with more than this still unsent has stopped reading; chat events are a few hundred bytes each. */
const MAX_BACKLOG_BYTES = 64 * 1024;
/** A client behind for this long is dropped and frees its slot (a frozen source); OBS reconnects on its own. */
const STALLED_MS = 10_000;

/**
 * The headers of apps/desktop/src/obs.ts send(), copied (a module cannot import the shell). The page runs no inline
 * script; styles may be inline (the custom properties); pictures only from Twitch's emote CDN, and only when the
 * streamer chose emote pictures (imgSrc), otherwise none.
 */
export function send(res: ServerResponse, status: number, type: string, body: string, imgSrc = "'none'"): void {
  res.writeHead(status, {
    'Content-Type': type,
    'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff',
    'Referrer-Policy': 'no-referrer',
    'Content-Security-Policy': `default-src 'none'; script-src 'self'; connect-src 'self'; style-src 'self' 'unsafe-inline'; img-src ${imgSrc}; base-uri 'none'; form-action 'none'; frame-ancestors 'none'`,
  });
  res.end(body);
}

export class EventStream {
  private readonly clients = new Set<ServerResponse>();
  /** Clients that could not take the last event, since when. */
  private readonly behindSince = new Map<ServerResponse, number>();
  private keepAlive: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly onClients: (count: number) => void) {}

  get count(): number {
    return this.clients.size;
  }

  /** Opens the stream and sends the opening events (the page's version, the style, the backlog) at once. */
  connect(req: IncomingMessage, res: ServerResponse, opening: [name: string, data: unknown][]): void {
    if (this.clients.size >= MAX_CLIENTS) return send(res, 503, 'text/plain', 'too many overlays');
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-store',
      Connection: 'keep-alive',
      'X-Content-Type-Options': 'nosniff',
    });
    res.socket?.setNoDelay(true);
    res.write('retry: 2000\n\n');
    for (const [name, data] of opening) res.write(frame(name, data));
    this.clients.add(res);
    if (!this.keepAlive) this.keepAlive = setInterval(() => this.tick(), KEEP_ALIVE_MS);
    this.onClients(this.clients.size);
    req.on('close', () => {
      if (!this.clients.delete(res)) return;
      this.behindSince.delete(res);
      if (this.clients.size === 0) this.stopKeepAlive();
      this.onClients(this.clients.size);
    });
  }

  broadcast(name: string, data: unknown): void {
    const chunk = frame(name, data);
    for (const client of this.clients) {
      if (client.writableLength < MAX_BACKLOG_BYTES) {
        this.behindSince.delete(client);
        client.write(chunk);
      } else if (!this.behindSince.has(client)) this.behindSince.set(client, Date.now());
    }
  }

  /** Ends every stream (the module stops). */
  close(): void {
    this.stopKeepAlive();
    for (const client of this.clients) client.end();
    this.clients.clear();
    this.behindSince.clear();
    this.onClients(0);
  }

  private tick(): void {
    const now = Date.now();
    for (const client of this.clients) {
      if (client.writableLength < MAX_BACKLOG_BYTES) this.behindSince.delete(client);
      else if (!this.behindSince.has(client)) this.behindSince.set(client, now);
      else if (now - this.behindSince.get(client)! >= STALLED_MS) {
        client.destroy();
        this.clients.delete(client);
        this.behindSince.delete(client);
        this.onClients(this.clients.size);
      }
    }
    for (const client of this.clients) client.write(': keep-alive\n\n');
  }

  private stopKeepAlive(): void {
    clearInterval(this.keepAlive);
    this.keepAlive = undefined;
  }
}

function frame(name: string, data: unknown): string {
  return `event: ${name}\ndata: ${JSON.stringify(data)}\n\n`;
}
