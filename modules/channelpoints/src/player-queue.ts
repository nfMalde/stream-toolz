// Redemptions come in, each is mapped to its reward's sound and played one after another on the output. No Node
// imports: the sounds and the sink are handed in, so the queue can be tested with fakes.
//
// A redemption that is not played is logged with why: the reward is unknown here or has no sound, it is switched
// off, it came too soon after the same reward (cooldown), or too many sounds are waiting. The cooldown counts
// from when a redemption is accepted, not from when it plays: a wave of redemptions within the cooldown is one
// sound, however long the queue is.

import { EventEmitter } from 'node:events';
import type { AudioSink } from '@stream-toolz/core';
import type { Redemption } from '@stream-toolz/twitch/api';
import type { RedemptionLogEntry, RedemptionOutcome } from './api';
import { LOG_SIZE, type RewardSettings, type Settings } from './settings';

export interface PlayerQueueOptions {
  settings: () => Settings;
  sink: () => AudioSink;
  /** The sound's data by its file name; undefined when the file is gone. */
  sound: (name: string) => Promise<Buffer | undefined>;
  log: (line: string) => void;
  /** For tests. */
  now?: () => number;
}

interface Item {
  redemption: Redemption;
  reward: RewardSettings;
  test: boolean;
}

type Events = {
  /** The queue or the log changed. */
  change: [];
};

/** Redemption ids remembered for the dedupe (EventSub may deliver a notification twice). */
const SEEN_IDS = 500;

export class PlayerQueue extends EventEmitter<Events> {
  private items: Item[] = [];
  private readonly entries: RedemptionLogEntry[] = [];
  private readonly seen = new Set<string>();
  /** When a reward was last accepted, for its cooldown. */
  private readonly lastAccepted = new Map<string, number>();
  private running = true;
  private playing = false;
  private testCounter = 0;

  constructor(private readonly options: PlayerQueueOptions) {
    super();
  }

  get log(): RedemptionLogEntry[] {
    return [...this.entries];
  }

  get queued(): number {
    return this.items.length;
  }

  /** A redemption from Twitch. */
  receive(redemption: Redemption): void {
    if (!this.running || this.seen.has(redemption.id)) return;
    this.remember(redemption.id);
    const settings = this.options.settings();
    const reward = Object.hasOwn(settings.rewards, redemption.rewardId) ? settings.rewards[redemption.rewardId] : undefined;
    if (!reward || !reward.sound) return this.record(redemption, 'no-sound');
    if (!reward.enabled) return this.record(redemption, 'disabled');
    const now = this.now();
    const last = this.lastAccepted.get(redemption.rewardId);
    if (reward.cooldownSeconds > 0 && last !== undefined && now - last < reward.cooldownSeconds * 1000) return this.record(redemption, 'cooldown');
    if (this.items.length >= Math.max(1, settings.maxQueue)) return this.record(redemption, 'queue-full');
    this.lastAccepted.set(redemption.rewardId, now);
    this.items.push({ redemption, reward, test: false });
    this.emit('change');
    void this.pump();
  }

  /** The Test button: the reward's sound ahead of the queue, regardless of cooldown and the switch. */
  test(rewardId: string): void {
    if (!this.running) return;
    const settings = this.options.settings();
    const reward = Object.hasOwn(settings.rewards, rewardId) ? settings.rewards[rewardId] : undefined;
    this.testCounter++;
    const redemption: Redemption = {
      id: `test-${this.testCounter}`,
      userId: '',
      login: '',
      name: 'Test',
      rewardId,
      rewardTitle: reward?.title ?? '',
      cost: 0,
      input: '',
      receivedAt: this.now(),
      test: true,
    };
    if (!reward || !reward.sound) return this.record(redemption, 'no-sound');
    this.items.unshift({ redemption, reward, test: true });
    this.emit('change');
    void this.pump();
  }

  /** Throws the waiting sounds away and stops the one playing. */
  clear(): void {
    this.items = [];
    this.options.sink().stop();
    this.emit('change');
  }

  /** The module stops: nothing plays or is accepted any more. */
  stop(): void {
    this.running = false;
    this.clear();
  }

  private async pump(): Promise<void> {
    if (this.playing) return;
    this.playing = true;
    try {
      while (this.running) {
        const item = this.items.shift();
        if (!item) break;
        this.emit('change');
        await this.play(item);
      }
    } finally {
      this.playing = false;
    }
  }

  private async play(item: Item): Promise<void> {
    const sound = await this.options.sound(item.reward.sound).catch(() => undefined);
    if (!sound) return this.record(item.redemption, 'no-sound');
    if (!this.running) return;
    const volume = (this.options.settings().volume / 100) * (item.reward.volume / 100);
    try {
      await this.options.sink().play(sound, Math.max(0, Math.min(1, volume)));
      this.record(item.redemption, item.test ? 'test' : 'played');
    } catch (err) {
      this.options.log(`CHANNELPOINTS sound failed: ${(err as Error).message}`);
      this.record(item.redemption, 'no-sound');
    }
  }

  private record(redemption: Redemption, outcome: RedemptionOutcome): void {
    this.entries.push({
      id: redemption.id,
      at: this.now(),
      name: redemption.name,
      rewardTitle: redemption.rewardTitle,
      input: redemption.input,
      outcome,
    });
    if (this.entries.length > LOG_SIZE) this.entries.splice(0, this.entries.length - LOG_SIZE);
    this.emit('change');
  }

  private remember(id: string): void {
    this.seen.add(id);
    if (this.seen.size > SEEN_IDS) {
      const oldest = this.seen.values().next().value;
      if (oldest !== undefined) this.seen.delete(oldest);
    }
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }
}
