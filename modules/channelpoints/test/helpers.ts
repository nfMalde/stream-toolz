import type { AudioSink } from '@stream-toolz/core';
import type { Redemption } from '@stream-toolz/twitch';

let counter = 0;

/** A redemption of a reward; fields can be overridden. */
export function redemption(rewardId: string, change: Partial<Redemption> = {}): Redemption {
  counter++;
  return {
    id: `r${counter}`,
    userId: 'u1',
    login: 'viewer',
    name: 'Viewer',
    rewardId,
    rewardTitle: `Reward ${rewardId}`,
    cost: 100,
    input: '',
    receivedAt: 1_000_000,
    ...change,
  };
}

/** A sink that records what was played (as text) and at which volume; each clip ends when the test says so (or right away). */
export class FakeSink implements AudioSink {
  ready = true;
  played: string[] = [];
  volumes: number[] = [];
  stops = 0;
  private finish: (() => void) | undefined;
  constructor(private readonly hold = false) {}
  play(wav: Buffer, volume: number): Promise<void> {
    this.played.push(wav.toString('utf8'));
    this.volumes.push(volume);
    if (!this.hold) return Promise.resolve();
    return new Promise((resolve) => (this.finish = resolve));
  }
  stop(): void {
    this.stops++;
    this.finish?.();
    this.finish = undefined;
  }
  end(): void {
    this.finish?.();
    this.finish = undefined;
  }
}

export const tick = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10));

/** Waits until the condition holds (file reads take a moment, the first one longer); fails loudly after the timeout. */
export async function until(condition: () => boolean, timeoutMs = 2_000): Promise<void> {
  const start = Date.now();
  while (!condition()) {
    if (Date.now() - start > timeoutMs) throw new Error('timed out waiting');
    await tick();
  }
}
