import type { ChatMessage } from '@stream-toolz/twitch';
import { Bot, type BotOptions } from '../src/bot';
import { normalizeSettings, type Command, type Settings, type TimedMessage } from '../src/settings';

let counter = 0;

/** A chat message with plain text; fields can be overridden. */
export function message(text: string, change: Partial<ChatMessage> = {}): ChatMessage {
  counter++;
  return {
    id: `m${counter}`,
    userId: 'u1',
    login: 'viewer',
    name: 'Viewer',
    text,
    fragments: [{ kind: 'text', text }],
    roles: { broadcaster: false, moderator: false, vip: false, subscriber: false },
    bits: 0,
    fromOtherChannel: false,
    receivedAt: 1_000_000,
    ...change,
  };
}

/** Lets the promise chains of a send settle. */
export async function flush(): Promise<void> {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setImmediate(resolve));
}

/** A clock the tests move by hand; scheduled callbacks run when their time comes. */
export class Clock {
  t = 1_000_000;
  private timers: { at: number; fn: () => void }[] = [];
  readonly now = (): number => this.t;
  readonly schedule = (fn: () => void, ms: number): (() => void) => {
    const timer = { at: this.t + ms, fn };
    this.timers.push(timer);
    return () => {
      this.timers = this.timers.filter((x) => x !== timer);
    };
  };
  get pending(): number {
    return this.timers.length;
  }
  async advance(ms: number): Promise<void> {
    const target = this.t + ms;
    for (;;) {
      const due = this.timers.filter((x) => x.at <= target).sort((a, b) => a.at - b.at)[0];
      if (!due) break;
      this.timers = this.timers.filter((x) => x !== due);
      this.t = due.at;
      due.fn();
      await flush();
    }
    this.t = target;
    await flush();
  }
}

export function command(trigger: string, response: string, change: Partial<Command> = {}): Command {
  return { id: `c-${trigger}`, trigger, response, cooldownSeconds: 0, userCooldownSeconds: 0, who: 'everyone', enabled: true, aliases: [], uses: 0, ...change };
}

export function timer(text: string, change: Partial<TimedMessage> = {}): TimedMessage {
  return { id: `t-${text}`, text, everyMinutes: 15, minMessages: 0, enabled: true, ...change };
}

export interface Sent {
  text: string;
  replyTo?: string;
}

/** A bot with a fake clock and a recording send; `fail` makes the next sends reject. */
export function bot(change: Partial<Settings> = {}, options: Partial<BotOptions> = {}) {
  const sent: Sent[] = [];
  const clock = new Clock();
  let settings = normalizeSettings({ globalCooldownSeconds: 0, ...change });
  let fail: string | undefined;
  const b = new Bot({
    settings: () => settings,
    send: async (text, replyTo) => {
      if (fail) throw new Error(fail);
      sent.push(replyTo ? { text, replyTo } : { text });
    },
    ownUserId: () => 'me',
    channel: () => 'Maldö',
    language: () => 'de',
    now: clock.now,
    schedule: clock.schedule,
    ...options,
  });
  return {
    bot: b,
    sent,
    clock,
    settings: () => settings,
    update: (next: Partial<Settings>) => void (settings = normalizeSettings({ ...settings, ...next }, settings)),
    failWith: (reason: string | undefined) => void (fail = reason),
  };
}
