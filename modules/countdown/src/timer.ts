// A timer and the arithmetic on it. Pure: the main process ticks and persists, the UI counts down by itself from
// the same numbers (so no "tick" event is needed, 2026-10-30). A timer is never changed in place: every step
// returns a new one, which the settings keep (a countdown to 20:30 survives a restart).

export interface Timer {
  id: string;
  /** '' when the phrase had no label. */
  label: string;
  /** Epoch milliseconds. While paused: what it was when the pause began (pausedRemainingMs rules). */
  endsAt: number;
  /** Set while paused: what is left. */
  pausedRemainingMs?: number;
  createdAt: number;
}

export const MINUTE_MS = 60_000;

export function isPaused(timer: Timer): boolean {
  return timer.pausedRemainingMs !== undefined;
}

export function remainingMs(timer: Timer, now: number): number {
  return timer.pausedRemainingMs ?? Math.max(0, timer.endsAt - now);
}

/** Reached zero (a paused timer is never done, it waits). */
export function isDone(timer: Timer, now: number): boolean {
  return !isPaused(timer) && timer.endsAt <= now;
}

/** Done for longer than the done time: the timer goes away. With 0 it never goes by itself (the user removes it). */
export function isExpired(timer: Timer, now: number, doneSeconds: number): boolean {
  return doneSeconds > 0 && isDone(timer, now) && timer.endsAt + doneSeconds * 1000 <= now;
}

/** Pausing a timer that reached zero does nothing (it would show 0:00 for good). */
export function pause(timer: Timer, now: number): Timer {
  if (isPaused(timer) || isDone(timer, now)) return timer;
  return { ...timer, pausedRemainingMs: remainingMs(timer, now) };
}

export function resume(timer: Timer, now: number): Timer {
  const { pausedRemainingMs, ...rest } = timer;
  if (pausedRemainingMs === undefined) return timer;
  return { ...rest, endsAt: now + pausedRemainingMs };
}

/**
 * Adds (or takes) time, never below zero. A running timer keeps its clock; a paused one its remaining time;
 * one that reached zero starts again from zero with the added time (−1 min on a done timer does nothing).
 */
export function adjust(timer: Timer, deltaMs: number, now: number): Timer {
  if (isPaused(timer)) return { ...timer, pausedRemainingMs: Math.max(0, timer.pausedRemainingMs! + deltaMs) };
  if (isDone(timer, now)) return deltaMs > 0 ? { ...timer, endsAt: now + deltaMs } : timer;
  return { ...timer, endsAt: Math.max(now, timer.endsAt + deltaMs) };
}
