import assert from 'node:assert/strict';
import { test } from 'node:test';
import { adjust, isDone, isExpired, isPaused, MINUTE_MS, pause, remainingMs, resume, type Timer } from '../src/timer';

const NOW = 1_000_000_000;
const timer: Timer = { id: 'a', label: '', endsAt: NOW + 15 * MINUTE_MS, createdAt: NOW };

test('remaining time counts down and never goes below zero', () => {
  assert.equal(remainingMs(timer, NOW), 15 * MINUTE_MS);
  assert.equal(remainingMs(timer, NOW + 14 * MINUTE_MS), MINUTE_MS);
  assert.equal(remainingMs(timer, NOW + 20 * MINUTE_MS), 0);
  assert.equal(isDone(timer, NOW), false);
  assert.equal(isDone(timer, NOW + 15 * MINUTE_MS), true);
});

test('pause keeps the remaining time, resume continues from there', () => {
  const paused = pause(timer, NOW + 5 * MINUTE_MS);
  assert.equal(isPaused(paused), true);
  assert.equal(paused.pausedRemainingMs, 10 * MINUTE_MS);
  // Time passes while paused: nothing changes, and it is never done.
  assert.equal(remainingMs(paused, NOW + 60 * MINUTE_MS), 10 * MINUTE_MS);
  assert.equal(isDone(paused, NOW + 60 * MINUTE_MS), false);
  assert.equal(pause(paused, NOW + 60 * MINUTE_MS), paused);
  const resumed = resume(paused, NOW + 60 * MINUTE_MS);
  assert.equal(isPaused(resumed), false);
  assert.equal(resumed.pausedRemainingMs, undefined);
  assert.equal(resumed.endsAt, NOW + 70 * MINUTE_MS);
  assert.equal(resume(resumed, NOW), resumed);
  assert.equal(timer.pausedRemainingMs, undefined, 'the original is untouched');
});

test('a done timer cannot be paused', () => {
  assert.equal(pause(timer, NOW + 15 * MINUTE_MS), timer);
});

test('adjust adds or takes a minute, never below zero', () => {
  assert.equal(adjust(timer, MINUTE_MS, NOW).endsAt, NOW + 16 * MINUTE_MS);
  assert.equal(adjust(timer, -MINUTE_MS, NOW).endsAt, NOW + 14 * MINUTE_MS);
  // 15 minutes left, 20 taken: zero, not negative.
  assert.equal(adjust(timer, -20 * MINUTE_MS, NOW).endsAt, NOW);
  const paused = pause(timer, NOW + 14 * MINUTE_MS);
  assert.equal(adjust(paused, MINUTE_MS, NOW).pausedRemainingMs, 2 * MINUTE_MS);
  assert.equal(adjust(paused, -5 * MINUTE_MS, NOW).pausedRemainingMs, 0);
});

test('a done timer starts again from zero with the added time', () => {
  const later = NOW + 20 * MINUTE_MS;
  assert.equal(adjust(timer, MINUTE_MS, later).endsAt, later + MINUTE_MS);
  assert.equal(adjust(timer, -MINUTE_MS, later), timer);
});

test('a done timer expires after the done time', () => {
  const done = NOW + 15 * MINUTE_MS;
  assert.equal(isExpired(timer, done, 30), false);
  assert.equal(isExpired(timer, done + 29_000, 30), false);
  assert.equal(isExpired(timer, done + 30_000, 30), true);
  assert.equal(isExpired(pause(timer, NOW), done + 60_000, 30), false);
});
