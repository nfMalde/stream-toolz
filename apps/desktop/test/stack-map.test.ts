import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { build } from 'esbuild';
import { scrub } from '../src/logger';
import { mapStack } from '../src/stack-map';

test('a frame in a minified bundle is mapped back to the TypeScript line', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-map-'));
  try {
    const source = ['export function greet(name: string): string {', '  if (!name) {', "    throw new Error('no name');", '  }', '  return `hi ${name}`;', '}', ''].join('\n');
    await build({
      stdin: { contents: source, sourcefile: 'src/app/greet.ts', loader: 'ts', resolveDir: dir },
      bundle: true,
      minify: true,
      sourcemap: 'external',
      format: 'esm',
      outfile: path.join(dir, 'main-AB12.js'),
      logLevel: 'silent',
    });
    const code = fs.readFileSync(path.join(dir, 'main-AB12.js'), 'utf8');
    const lines = code.split('\n');
    const line = lines.findIndex((l) => l.includes('throw'));
    const column = lines[line]!.indexOf('throw');
    const stack = `Error: no name\n    at greet (app://stz/main-AB12.js:${line + 1}:${column + 1})\n    at other (app://stz/unknown.js:1:5)`;
    const mapped = mapStack(stack, dir);
    assert.match(mapped, /at greet \(src\/app\/greet\.ts:3:\d+\)/);
    // Without a map the frame stays as it is.
    assert.match(mapped, /app:\/\/stz\/unknown\.js:1:5/);
    // The dev server (no UI folder): nothing to map.
    assert.equal(mapStack(stack, undefined), stack);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('the log never shows tokens, secrets or the OBS key', () => {
  assert.equal(scrub('GET /helix/users Authorization: Bearer abc123.def'), 'GET /helix/users Authorization: Bearer ***');
  assert.equal(scrub('POST client_secret=s3cr3t&refresh_token=r1&grant_type=refresh_token'), 'POST client_secret=***&refresh_token=***&grant_type=refresh_token');
  assert.equal(scrub('{"accessToken":"xyz","login":"maldoe"}'), '{"accessToken":"***","login":"maldoe"}');
  assert.equal(scrub('http://127.0.0.1:47391/obs/tv6PNHTGqUcN-e1G2V-2KBfX/events'), 'http://127.0.0.1:47391/obs/***/events');
  assert.equal(scrub('TWITCH    reading chat of maldoe'), 'TWITCH    reading chat of maldoe');
});
