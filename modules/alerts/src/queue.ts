// The alert queue: one alert on screen at a time, for its duration; the others wait. Follows beyond the limit are
// collapsed into one line, small raids and duplicates are dropped. Pure: time comes in as an argument, so the module
// drives it with its timers and the tests without any. No Node imports.

import type { ChannelEvent, ChannelEventKind } from '@stream-toolz/twitch';
import type { Alert } from './api';
import type { Settings } from './settings';
import { alertTexts, defaultAlertText, fillAlertText } from './texts';

export type { Alert } from './api';

export type PushResult = 'queued' | 'merged' | 'disabled' | 'duplicate' | 'raid-too-small';

/** Waiting alerts at most; beyond that the oldest waiting one is dropped. */
export const MAX_WAITING = 50;
/** A resub's message is cut after this many characters. */
const MAX_MESSAGE = 200;
/** Event ids remembered against duplicates (Twitch may deliver an event twice). */
const IDS_KEPT = 500;
const MINUTE_MS = 60_000;

interface Entry {
  alert: Alert;
  event: ChannelEvent;
  /** Follows collapsed into this one. */
  more: number;
}

export interface QueueOptions {
  settings: () => Settings;
  /** The app language ("de", "en"). */
  language: () => string;
}

export class AlertQueue {
  private readonly waiting: Entry[] = [];
  private current: Entry | undefined;
  private endsAt = 0;
  private readonly seen = new Set<string>();
  /** When the last follows got their own alert. */
  private followTimes: number[] = [];

  constructor(private readonly options: QueueOptions) {}

  /** Takes an event in; says what became of it. Test events skip every filter. */
  push(event: ChannelEvent, now = event.receivedAt): PushResult {
    const settings = this.options.settings();
    if (!event.test) {
      if (this.seen.has(event.id)) return 'duplicate';
      if (this.seen.size >= IDS_KEPT) this.seen.clear();
      this.seen.add(event.id);
      if (!settings.events[event.kind].enabled) return 'disabled';
      if (event.kind === 'raid' && event.count < settings.minRaidViewers) return 'raid-too-small';
      if (event.kind === 'follow' && this.overFollowLimit(now, settings.followLimitPerMinute)) return this.collapseFollow(event, settings);
    }
    this.enqueue({ alert: renderAlert(event, settings, this.options.language()), event, more: 0 });
    return 'queued';
  }

  /** Shows the next alert when none is on screen (or the current one has ended): the one that starts, if any. */
  advance(now: number): Alert | undefined {
    if (this.current && now < this.endsAt) return undefined;
    this.current = this.waiting.shift();
    if (!this.current) return undefined;
    this.endsAt = now + this.current.alert.durationMs;
    return this.current.alert;
  }

  /** The alert on screen right now. */
  showing(now: number): Alert | undefined {
    return this.current && now < this.endsAt ? this.current.alert : undefined;
  }

  /** When the alert on screen ends (0 when none is showing). */
  get currentEndsAt(): number {
    return this.current ? this.endsAt : 0;
  }

  get waitingCount(): number {
    return this.waiting.length;
  }

  /** Drops everything: what waits and what is showing. */
  clear(): void {
    this.waiting.length = 0;
    this.current = undefined;
    this.endsAt = 0;
  }

  private enqueue(entry: Entry): void {
    while (this.waiting.length >= MAX_WAITING) this.waiting.shift();
    this.waiting.push(entry);
  }

  /** A follow gets its own alert while the minute's limit allows it; 0 = no limit. */
  private overFollowLimit(now: number, limit: number): boolean {
    if (limit === 0) return false;
    this.followTimes = this.followTimes.filter((at) => now - at < MINUTE_MS);
    if (this.followTimes.length >= limit) return true;
    this.followTimes.push(now);
    return false;
  }

  /**
   * A follow beyond the limit joins the last follow still waiting ("Anna folgt jetzt! … und 3 weitere"); without
   * one, it starts such a line itself, so a wave of follow bots shows as one alert per alert, not one each.
   */
  private collapseFollow(event: ChannelEvent, settings: Settings): PushResult {
    const target = [...this.waiting].reverse().find((entry) => entry.event.kind === 'follow');
    if (!target) {
      this.enqueue({ alert: renderAlert(event, settings, this.options.language()), event, more: 0 });
      return 'queued';
    }
    target.more++;
    target.alert = { ...target.alert, message: fillAlertText(alertTexts(this.options.language()).followMore, { ...EMPTY_VALUES, count: String(target.more) }) };
    return 'merged';
  }
}

const EMPTY_VALUES = { name: '', count: '', months: '', recipient: '', tier: '' };

/** The alert for an event: its text filled in, the event's sound, duration and volume. */
export function renderAlert(event: ChannelEvent, settings: Settings, language: string): Alert {
  const texts = alertTexts(language);
  const setting = settings.events[event.kind];
  // The form for one: a resub counts months, the others gifts or viewers.
  const template = setting.text || defaultAlertText(event.kind, language, event.kind === 'resub' ? event.months : event.count);
  const tier = event.prime ? texts.prime : /^[123]000$/.test(event.tier) ? texts.tier.replace('{n}', event.tier[0]!) : '';
  const title = fillAlertText(template, {
    name: event.name || texts.anonymous,
    count: String(event.count),
    months: String(event.months),
    recipient: event.recipient?.name || '',
    tier,
  });
  const message = settings.style.showMessage && event.message?.text.trim() ? event.message.text.trim().slice(0, MAX_MESSAGE) : undefined;
  return {
    id: event.id,
    kind: event.kind,
    title,
    ...(message ? { message } : {}),
    ...(setting.sound ? { sound: setting.sound } : {}),
    durationMs: setting.durationSeconds * 1000,
    volume: Math.max(0, Math.min(1, setting.volume / 100)),
    ...(event.test ? { test: true } : {}),
  };
}

/** A sample event for the test buttons: a fake name, a count, a resub message. */
export function sampleEvent(kind: ChannelEventKind, language: string, id: string, now = Date.now()): ChannelEvent {
  const texts = alertTexts(language);
  const base: ChannelEvent = { id, kind, userId: 'test', login: 'maldoe', name: 'Maldö', count: 0, months: 0, tier: '1000', prime: kind === 'prime', receivedAt: now, test: true };
  switch (kind) {
    case 'resub':
      return {
        ...base,
        months: 12,
        message: { id, userId: 'test', login: 'maldoe', name: 'Maldö', text: texts.testMessage, fragments: [], roles: { broadcaster: false, moderator: false, vip: false, subscriber: true }, bits: 0, fromOtherChannel: false, receivedAt: now, test: true },
      };
    case 'gift':
      return { ...base, count: 1, recipient: { login: 'chat', name: 'Chat' } };
    case 'communityGift':
      return { ...base, count: 5 };
    case 'raid':
      return { ...base, count: 42 };
    default:
      return base;
  }
}
