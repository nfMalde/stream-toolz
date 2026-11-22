import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { asciiPath } from '../src/ascii-path';

test('an ASCII folder stays as it is', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-ascii-'));
  try {
    assert.equal(asciiPath(dir), path.resolve(dir));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a folder with a non-ASCII name gets an ASCII path to the same folder (Windows short name)', { skip: process.platform !== 'win32' }, () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-ascii-'));
  try {
    const dir = path.join(parent, 'Jörg Ł', 'voices');
    const lines: string[] = [];
    const ascii = asciiPath(dir, (line) => lines.push(line));
    assert.ok(fs.existsSync(dir), 'the folder is created');
    assert.deepEqual(lines, [], 'no warning');
    assert.match(ascii, /^[\x20-\x7e]+$/, ascii);
    assert.notEqual(ascii, dir);
    assert.equal(fs.realpathSync.native(ascii).toLowerCase(), fs.realpathSync.native(dir).toLowerCase(), 'the same folder');
    assert.equal(asciiPath(dir), ascii, 'answered from the cache');
  } finally {
    fs.rmSync(parent, { recursive: true, force: true });
  }
});
