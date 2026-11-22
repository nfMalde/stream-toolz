import assert from 'node:assert/strict';
import { test } from 'node:test';
import { labelSlug, planFiles } from '../src/files';
import type { Timer } from '../src/timer';

test('a label becomes a plain file name', () => {
  assert.equal(labelSlug('Pause'), 'pause');
  assert.equal(labelSlug('Große Pause: Kaffee & Kuchen!'), 'grosse-pause-kaffee-kuchen');
  assert.equal(labelSlug('Café  déjà'), 'cafe-deja');
  assert.equal(labelSlug('   '), '');
  assert.equal(labelSlug('...'), '');
  assert.equal(labelSlug('x'.repeat(80)).length, 40);
  assert.equal(labelSlug('a'.repeat(39) + ' bb'), 'a'.repeat(39), 'a cut never ends with a dash');
});

test('countdown.txt is the newest timer, numbered files follow the order, labelled ones get their own', () => {
  const timers: Timer[] = [
    { id: 'a', label: 'Pause', endsAt: 0, createdAt: 1 },
    { id: 'b', label: '', endsAt: 0, createdAt: 2 },
    { id: 'c', label: 'Giveaway', endsAt: 0, createdAt: 3 },
  ];
  assert.deepEqual(planFiles(timers, { a: '5:00', b: '10:00', c: '15:00' }), {
    'countdown.txt': '15:00',
    'countdown-1.txt': '5:00',
    'countdown-2.txt': '10:00',
    'countdown-3.txt': '15:00',
    'countdown-giveaway.txt': '15:00',
    'countdown-pause.txt': '5:00',
  });
});

test('two timers with the same label: the newest holds the file; a numeric label never takes a numbered file', () => {
  const timers: Timer[] = [
    { id: 'a', label: 'Pause', endsAt: 0, createdAt: 1 },
    { id: 'b', label: 'pause', endsAt: 0, createdAt: 2 },
    { id: 'c', label: '2', endsAt: 0, createdAt: 3 },
  ];
  const files = planFiles(timers, { a: 'A', b: 'B', c: 'C' });
  assert.equal(files['countdown-pause.txt'], 'B');
  assert.equal(files['countdown-2.txt'], 'B');
  assert.equal(files['countdown.txt'], 'C');
});

test('no timers: no files', () => {
  assert.deepEqual(planFiles([], {}), {});
});
