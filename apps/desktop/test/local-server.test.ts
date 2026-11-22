import assert from 'node:assert/strict';
import http from 'node:http';
import { test } from 'node:test';
import { wavFile } from '@stream-toolz/speech';
import { LocalServer } from '../src/local-server';
import { clipSeconds, ObsOutput } from '../src/obs';

const KEY = 'abcdefghijklmnop0123456789ABCDEF';
const WAV = wavFile(Buffer.alloc(16000 * 2), 16000); // one second of silence

interface Started {
  server: LocalServer;
  obs: ObsOutput;
  port: number;
  clients: number[];
  log: string[];
}

/** The server on a free high port (a fixed one could be taken on the machine running the tests). */
async function start(): Promise<Started> {
  const log: string[] = [];
  const clients: number[] = [];
  const obs = new ObsOutput((count) => clients.push(count), (line) => log.push(line));
  const server = new LocalServer({ obs, obsKey: () => KEY, language: () => 'de', log: (line) => log.push(line) });
  for (let attempt = 0; attempt < 10; attempt++) {
    const port = 49152 + Math.floor(Math.random() * 10000);
    try {
      await server.listen(port);
      return { server, obs, port, clients, log };
    } catch (err) {
      // Taken, or inside one of the port ranges Windows reserves (EACCES).
      if (!['EADDRINUSE', 'EACCES'].includes((err as NodeJS.ErrnoException).code ?? '')) throw err;
    }
  }
  throw new Error('no free port');
}

interface Answer {
  status: number;
  headers: http.IncomingHttpHeaders;
  body: Buffer;
}

function request(port: number, path: string, options: { method?: string; host?: string } = {}): Promise<Answer> {
  return new Promise((resolve, reject) => {
    const req = http.request(
      { host: '127.0.0.1', port, path, method: options.method ?? 'GET', agent: false, headers: { host: options.host ?? `127.0.0.1:${port}` } },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('end', () => resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

interface Received {
  name: string;
  data: string;
}

interface Source {
  /** The next event of that name (events already received count), or a failure after a while. */
  next(name: string): Promise<string>;
  has(name: string): boolean;
  close(): void;
}

/** A browser source: the events stream, parsed. */
function connect(port: number): Promise<Source> {
  return new Promise((resolve, reject) => {
    const received: Received[] = [];
    const taken = new Set<Received>();
    const waiting: { name: string; resolve: (data: string) => void }[] = [];
    let buffer = '';
    const req = http.get({ host: '127.0.0.1', port, path: `/obs/${KEY}/events`, agent: false, headers: { host: `localhost:${port}` } }, (res) => {
      assert.equal(res.statusCode, 200);
      assert.equal(res.headers['content-type'], 'text/event-stream');
      res.setEncoding('utf8');
      res.on('data', (chunk: string) => {
        buffer += chunk;
        let end: number;
        while ((end = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, end);
          buffer = buffer.slice(end + 2);
          const name = /^event: (.*)$/m.exec(block)?.[1];
          if (!name) continue;
          const event = { name, data: /^data: (.*)$/m.exec(block)?.[1] ?? '' };
          received.push(event);
          const index = waiting.findIndex((w) => w.name === name);
          if (index >= 0) {
            taken.add(event);
            waiting.splice(index, 1)[0]!.resolve(event.data);
          }
        }
      });
      resolve({
        next: (name) => {
          const found = received.find((e) => e.name === name && !taken.has(e));
          if (found) {
            taken.add(found);
            return Promise.resolve(found.data);
          }
          return new Promise((resolveNext, rejectNext) => {
            const timer = setTimeout(() => rejectNext(new Error(`no "${name}" event within 3 s`)), 3000);
            waiting.push({
              name,
              resolve: (data) => {
                clearTimeout(timer);
                resolveNext(data);
              },
            });
          });
        },
        has: (name) => received.some((e) => e.name === name && !taken.has(e)),
        close: () => req.destroy(),
      });
    });
    req.on('error', reject);
  });
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 50));

test('the server answers only for the right host and the right key', async () => {
  const { server, port } = await start();
  try {
    assert.equal((await request(port, `/obs/${KEY}/`, { host: 'evil.example' })).status, 421);
    assert.equal((await request(port, `/obs/${KEY}/`, { host: `127.0.0.1:${port + 1}` })).status, 421);
    assert.equal((await request(port, '/')).status, 404);
    assert.equal((await request(port, '/obs/')).status, 404);
    assert.equal((await request(port, `/obs/${KEY.slice(0, -1)}X/`)).status, 404);
    assert.equal((await request(port, `/obs/${KEY}/../../secrets.bin`)).status, 404);

    const noSlash = await request(port, `/obs/${KEY}`);
    assert.equal(noSlash.status, 302);
    assert.equal(noSlash.headers.location, `/obs/${KEY}/`);

    for (const host of [`localhost:${port}`, `127.0.0.1:${port}`]) {
      const page = await request(port, `/obs/${KEY}/`, { host });
      assert.equal(page.status, 200);
      assert.match(page.headers['content-type'] ?? '', /^text\/html/);
      assert.match(String(page.headers['content-security-policy']), /default-src 'none'.*frame-ancestors 'none'/);
      assert.equal(page.headers['x-content-type-options'], 'nosniff');
      assert.match(page.body.toString(), /<html lang="de"/);
    }
    const player = await request(port, `/obs/${KEY}/player.js`);
    assert.equal(player.status, 200);
    assert.match(player.headers['content-type'] ?? '', /^text\/javascript/);

    assert.equal((await request(port, `/obs/${KEY}/clip/0123456789abcdef`)).status, 404);
    // ".." is resolved before the match: it never reaches a file, and above the key nothing answers.
    assert.equal((await request(port, `/obs/${KEY}/clip/../player.js`)).status, 200);
    assert.equal((await request(port, `/obs/${KEY}/clip/../../../player.js`)).status, 404);
    assert.equal((await request(port, `/obs/${KEY}/done/0123456789abcdef`)).status, 404); // GET, not POST
    assert.equal((await request(port, `/obs/${KEY}/done/0123456789abcdef`, { method: 'POST' })).status, 204);
  } finally {
    await server.close();
  }
});

test('a module mounts its pages under /<id>/<key>/; nothing answers without the key or from another site', async () => {
  const { server, port } = await start();
  try {
    const seen: string[] = [];
    server.mount('countdown', (req, res, rest) => {
      seen.push(`${req.method} ${rest}`);
      res.writeHead(200, { 'Content-Type': 'text/plain' });
      res.end(`ok ${rest}`);
    });
    assert.throws(() => server.mount('obs', () => undefined), /Cannot mount/);
    assert.throws(() => server.mount('Bad Id', () => undefined), /Cannot mount/);

    assert.equal((await request(port, `/countdown/${KEY}/`)).body.toString(), 'ok ');
    assert.equal((await request(port, `/countdown/${KEY}/page.js`)).body.toString(), 'ok page.js');
    assert.equal((await request(port, `/countdown/${KEY}/a/b?x=1`)).body.toString(), 'ok a/b');
    assert.deepEqual(seen, ['GET ', 'GET page.js', 'GET a/b']);
    const noSlash = await request(port, `/countdown/${KEY}`);
    assert.equal(noSlash.status, 302);
    assert.equal(noSlash.headers.location, `/countdown/${KEY}/`);
    assert.equal((await request(port, `/countdown/${KEY.slice(0, -1)}X/`)).status, 404);
    assert.equal((await request(port, `/countdown/`)).status, 404);
    assert.equal((await request(port, `/alerts/${KEY}/`)).status, 404, 'not mounted');

    // Another web page in the browser (Sec-Fetch-Site cross-site) may not use the pages, OBS (none) and the page itself (same-origin) may.
    const fetchFrom = (site: string) =>
      new Promise<number>((resolve, reject) => {
        const req = http.request({ host: '127.0.0.1', port, path: `/countdown/${KEY}/`, agent: false, headers: { host: `127.0.0.1:${port}`, 'sec-fetch-site': site } }, (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        });
        req.on('error', reject);
        req.end();
      });
    assert.equal(await fetchFrom('cross-site'), 403);
    assert.equal(await fetchFrom('same-site'), 403);
    assert.equal(await fetchFrom('none'), 200);
    assert.equal(await fetchFrom('same-origin'), 200);

    server.unmount('countdown');
    assert.equal((await request(port, `/countdown/${KEY}/`)).status, 404);
  } finally {
    await server.close();
  }
});

test('the newest source plays, the clip is served once, and "done" ends the play', async () => {
  const { server, obs, port, clients } = await start();
  const first = await connect(port);
  try {
    assert.match(await first.next('hello'), /"player":"[0-9a-f]{12}"/);
    await first.next('active');
    await settle();
    assert.equal(obs.ready, true);
    assert.deepEqual(clients, [1]);

    const playing = obs.play(WAV, 7);
    const play = JSON.parse(await first.next('play')) as { id: string; volume: number };
    assert.match(play.id, /^[0-9a-f]{16}$/);
    assert.equal(play.volume, 1); // clamped
    const clip = await request(port, `/obs/${KEY}/clip/${play.id}`);
    assert.equal(clip.status, 200);
    assert.equal(clip.headers['content-type'], 'audio/wav');
    assert.ok(clip.body.equals(WAV));

    assert.equal((await request(port, `/obs/${KEY}/done/${play.id}`, { method: 'POST' })).status, 204);
    await playing;
    assert.equal((await request(port, `/obs/${KEY}/clip/${play.id}`)).status, 404);

    // A second source with the same address takes over; the first one goes quiet.
    const second = await connect(port);
    await second.next('active');
    await first.next('idle');
    await settle();
    assert.equal(obs.clientCount, 2);
    const again = obs.play(WAV, 0.5);
    const data = JSON.parse(await second.next('play')) as { id: string; volume: number };
    assert.equal(data.volume, 0.5);
    assert.equal(first.has('play'), false);
    await request(port, `/obs/${KEY}/done/${data.id}`, { method: 'POST' });
    await again;

    // When it leaves, the first one plays again.
    second.close();
    await first.next('active');
    await settle();
    assert.equal(obs.clientCount, 1);
  } finally {
    first.close();
    obs.close();
    await server.close();
  }
});

test('a new key ends the connected sources; at most 8 stay connected', async () => {
  const { server, obs, port, clients } = await start();
  try {
    const sources: Source[] = [];
    for (let i = 0; i < 10; i++) {
      const source = await connect(port);
      await source.next('active');
      sources.push(source);
    }
    await settle();
    assert.equal(obs.clientCount, 8);
    assert.equal(clients.at(-1), 8);

    obs.dropClients();
    await settle();
    assert.equal(obs.clientCount, 0);
    assert.equal(obs.ready, false);
    assert.equal(clients.at(-1), 0);
    for (const source of sources) source.close();
  } finally {
    obs.close();
    await server.close();
  }
});

test('clipSeconds reads the header and bounds the wait', () => {
  assert.equal(clipSeconds(WAV), 1);
  assert.equal(clipSeconds(Buffer.from('not a wav')), 10);
  const broken = Buffer.from(WAV);
  broken.writeUInt32LE(0, 24); // sample rate 0: a duration of Infinity
  assert.equal(clipSeconds(broken), 10);
  const long = wavFile(Buffer.alloc(0), 1);
  long.writeUInt32LE(0xffffffff, 40); // claims more data than the file has: cut to the file
  assert.equal(clipSeconds(long), 0);
});

test('a port change while the server starts leaves no server behind', async () => {
  const { server, port } = await start();
  try {
    const second = 49152 + Math.floor(Math.random() * 10000);
    const [a, b] = await Promise.allSettled([server.listen(port), server.listen(second)]);
    assert.equal(a.status, 'fulfilled');
    // The second may have hit a reserved port; the first port must be closed either way.
    if (b.status === 'fulfilled') {
      assert.equal((await request(second, `/obs/${KEY}/`, { host: `127.0.0.1:${second}` })).status, 200);
      await assert.rejects(request(port, '/'), /ECONNREFUSED/);
    }
  } finally {
    await server.close();
  }
});

test('without a source a play ends at once; stop ends a running clip', async () => {
  const { server, obs, port } = await start();
  try {
    await obs.play(WAV, 1);
    const source = await connect(port);
    await source.next('active');
    const playing = obs.play(WAV, 1);
    await source.next('play');
    obs.stop();
    await playing;
    await source.next('stop');
    source.close();
  } finally {
    obs.close();
    await server.close();
  }
});
