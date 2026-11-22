import assert from 'node:assert/strict';
import { test } from 'node:test';
import { formatRemaining, timerText } from '../src/format';
import type { Timer } from '../src/timer';

const MIN = 60_000;
const H = 60 * MIN;

test('auto: m:ss under an hour, h:mm:ss above', () => {
  assert.equal(formatRemaining(15 * MIN, 'auto'), '15:00');
  assert.equal(formatRemaining(5_000, 'auto'), '0:05');
  assert.equal(formatRemaining(0, 'auto'), '0:00');
  assert.equal(formatRemaining(59 * MIN + 59_000, 'auto'), '59:59');
  assert.equal(formatRemaining(H, 'auto'), '1:00:00');
  assert.equal(formatRemaining(H + 5 * MIN + 7_000, 'auto'), '1:05:07');
  assert.equal(formatRemaining(26 * H, 'auto'), '26:00:00');
});

test('seconds are rounded up, so 0:00 shows only when the timer is done', () => {
  assert.equal(formatRemaining(14_300, 'auto'), '0:15');
  assert.equal(formatRemaining(1, 'auto'), '0:01');
  assert.equal(formatRemaining(-5_000, 'auto'), '0:00');
});

test('mm:ss and hh:mm:ss', () => {
  assert.equal(formatRemaining(5 * MIN, 'mm:ss'), '05:00');
  assert.equal(formatRemaining(90 * MIN, 'mm:ss'), '90:00');
  assert.equal(formatRemaining(0, 'mm:ss'), '00:00');
  assert.equal(formatRemaining(5 * MIN, 'hh:mm:ss'), '00:05:00');
  assert.equal(formatRemaining(90 * MIN, 'hh:mm:ss'), '01:30:00');
  assert.equal(formatRemaining(0, 'hh:mm:ss'), '00:00:00');
});

test('minutes: rounded up', () => {
  assert.equal(formatRemaining(15 * MIN, 'minutes'), '15 min');
  assert.equal(formatRemaining(14 * MIN + 1_000, 'minutes'), '15 min');
  assert.equal(formatRemaining(H + 5 * MIN, 'minutes'), '1 h 05 min');
  assert.equal(formatRemaining(59 * MIN + 30_000, 'minutes'), '1 h 00 min');
  assert.equal(formatRemaining(0, 'minutes'), '0 min');
  assert.equal(formatRemaining(500, 'minutes'), '1 min');
});

test('the done text replaces the zero when set', () => {
  const timer: Timer = { id: 'a', label: '', endsAt: 10_000, createdAt: 0 };
  assert.equal(timerText(timer, 4_000, 'auto', 'Los!'), '0:06');
  assert.equal(timerText(timer, 10_000, 'auto', 'Los!'), 'Los!');
  assert.equal(timerText(timer, 10_000, 'auto', ''), '0:00');
  // The text is off by default (the user, 2026-11-14): a stored text shows only once it is switched on.
  assert.equal(timerText(timer, 10_000, 'auto', 'Los!', false), '0:00');
  assert.equal(timerText(timer, 10_000, 'minutes', ''), '0 min');
  // Paused at zero remaining is not done: it shows the time, not the done text.
  assert.equal(timerText({ ...timer, pausedRemainingMs: 0 }, 20_000, 'auto', 'Los!'), '0:00');
});
