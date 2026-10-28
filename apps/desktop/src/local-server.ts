// The app's small local web server, on the loopback interface only (never reachable from the network). It serves
// only the OBS browser source under /obs/<key>/ (obs.ts); without the key nothing answers. (The Twitch login needs
// no local page: it runs by code on twitch.tv/activate.) Requests must name this computer as host (no DNS
// rebinding from web pages).

import crypto from 'node:crypto';
import http, { type IncomingMessage, type ServerResponse } from 'node:http';
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

  constructor(private readonly options: LocalServerOptions) {}

  /** Starts on the port (IPv4 required, IPv6 if the system has it). Rejects with EADDRINUSE if taken. */
  async listen(port: number): Promise<void> {
    await this.close();
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
      () => undefined,
    );
    this.options.log(`SERVER    listening on port ${port}`);
  }

  async close(): Promise<void> {
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
    const url = new URL(req.url ?? '/', `http://localhost:${this.port}`);

    const obs = /^\/obs\/([A-Za-z0-9_-]{1,64})(?:\/(.*))?$/.exec(url.pathname);
    if (obs && sameKey(obs[1]!, this.options.obsKey())) {
      // "/obs/<key>" without the slash: relative paths in the page need it.
      if (obs[2] === undefined) {
        res.writeHead(302, { Location: `${url.pathname}/` });
        return void res.end();
      }
      return this.options.obs.handle(req, res, obs[2], this.options.language());
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
