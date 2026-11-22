// The app's small local web server, on the loopback interface only (never reachable from the network). It serves
// the OBS browser source under /obs/<key>/ (obs.ts) and each module's own browser source under /<id>/<key>/
// (the module's handler, mounted by its host); without the key nothing answers. (The Twitch login needs no local
// page: it runs by code on twitch.tv/activate.) Requests must name this computer as host (no DNS rebinding from
// web pages).

import crypto from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
import type { LocalRequestHandler } from '@stream-toolz/core';
import { send, type ObsOutput } from './obs';

export interface LocalServerOptions {
  obs: ObsOutput;
  obsKey: () => string;
  language: () => string;
  log: (line: string) => void;
}

export class LocalServer {
  private servers: http.Server[] = [];
  private port = 0;
  /** listen() and close() run one after another: two quick port changes must not leave a server behind. */
  private chain: Promise<unknown> = Promise.resolve();
  /** A module's pages, by its id (the first path segment). */
  private readonly mounts = new Map<string, LocalRequestHandler>();

  constructor(private readonly options: LocalServerOptions) {}

  /** Starts on the port (IPv4 required, IPv6 if the system has it). Rejects with EADDRINUSE if taken. */
  listen(port: number): Promise<void> {
    return this.enqueue(() => this.start(port));
  }

  close(): Promise<void> {
    return this.enqueue(() => this.closeAll());
  }

  /** A module's handler for /<id>/<key>/…; "obs" is the shell's audio source and cannot be taken. */
  mount(id: string, handler: LocalRequestHandler): void {
    if (id === 'obs' || !/^[a-z][a-z0-9-]*$/.test(id)) throw new Error(`Cannot mount "${id}"`);
    this.mounts.set(id, handler);
  }

  unmount(id: string): void {
    this.mounts.delete(id);
  }

  private enqueue<T>(task: () => Promise<T>): Promise<T> {
    const run = this.chain.then(task);
    this.chain = run.catch(() => undefined);
    return run;
  }

  private async start(port: number): Promise<void> {
    await this.closeAll();
    this.port = port;
    const handler = (req: IncomingMessage, res: ServerResponse) => {
      this.handle(req, res).catch((err: unknown) => {
        this.options.log(`SERVER    ${(err as Error).message}`);
        if (!res.headersSent) send(res, 500, 'text/plain', 'error');
      });
    };
    const start = (host: string) =>
      new Promise<http.Server>((resolve, reject) => {
        const server = http.createServer(handler);
        server.once('error', reject);
        server.listen(port, host, () => {
          server.off('error', reject);
          resolve(server);
        });
      });
    this.servers.push(await start('127.0.0.1'));
    // "localhost" may resolve to ::1 first in the browser.
    await start('::1').then(
      (server) => this.servers.push(server),
      (err: NodeJS.ErrnoException) => this.options.log(`SERVER    [::1]:${port} not available (${err.code ?? err.message}); IPv4 only`),
    );
    this.options.log(`SERVER    listening on port ${port}`);
  }

  private async closeAll(): Promise<void> {
    const servers = this.servers.splice(0);
    await Promise.all(
      servers.map(
        (server) =>
          new Promise<void>((resolve) => {
            server.close(() => resolve());
            server.closeAllConnections();
          }),
      ),
    );
  }

  private async handle(req: IncomingMessage, res: ServerResponse): Promise<void> {
    const allowedHosts = [`localhost:${this.port}`, `127.0.0.1:${this.port}`, `[::1]:${this.port}`];
    if (!allowedHosts.includes(req.headers.host ?? '')) return send(res, 421, 'text/plain', 'wrong host');
    // Only OBS (a navigation) and the pages themselves: another web page in the browser may not use the streams.
    const site = req.headers['sec-fetch-site'];
    if (site && site !== 'none' && site !== 'same-origin') return send(res, 403, 'text/plain', 'forbidden');
    let url: URL;
    try {
      url = new URL(req.url ?? '/', `http://localhost:${this.port}`);
    } catch {
      return send(res, 400, 'text/plain', 'bad request');
    }

    const match = /^\/([a-z][a-z0-9-]*)\/([A-Za-z0-9_-]{1,64})(?:\/(.*))?$/.exec(url.pathname);
    if (match && sameKey(match[2]!, this.options.obsKey())) {
      const [, id, , rest] = match;
      // "/<id>/<key>" without the slash: relative paths in the page need it.
      if (rest === undefined) {
        res.writeHead(302, { Location: `${url.pathname}/` });
        return void res.end();
      }
      if (id === 'obs') return this.options.obs.handle(req, res, rest, this.options.language());
      const handler = this.mounts.get(id!);
      if (handler) return handler(req, res, rest);
    }
    send(res, 404, 'text/plain', 'not found');
  }
}

/** Compared in constant time, so the key cannot be guessed character by character. */
function sameKey(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
