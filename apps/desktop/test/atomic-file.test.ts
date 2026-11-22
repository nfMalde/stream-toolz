import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { test } from 'node:test';
import { writeFileAtomically } from '../src/atomic-file';

test('writeFileAtomically replaces the file whole and leaves no temporary file', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-atomic-'));
  try {
    const file = path.join(dir, 'nested', 'config.json');
    writeFileAtomically(file, '{"a":1}');
    assert.equal(fs.readFileSync(file, 'utf8'), '{"a":1}');
    writeFileAtomically(file, Buffer.from('{"a":2}'));
    assert.equal(fs.readFileSync(file, 'utf8'), '{"a":2}');
    assert.deepEqual(fs.readdirSync(path.dirname(file)), ['config.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('writeFileAtomically fails without touching the file when the target is a folder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'stz-atomic-'));
  try {
    const target = path.join(dir, 'taken');
    fs.mkdirSync(target);
    fs.writeFileSync(path.join(target, 'inside'), '');
    assert.throws(() => writeFileAtomically(target, 'x'));
    assert.ok(fs.statSync(target).isDirectory());
    assert.deepEqual(fs.readdirSync(dir), ['taken'], 'no temporary file left');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
