// The bot's decisions: which message triggers which command, who may use it, the cooldowns, the timed messages,
// and the send queue that keeps Twitch's spacing. Pure logic: the clock, the scheduler and the sending are
// injected, so the tests run with a fake clock and never reach Twitch (test/bot.test.ts).

import type { ChatMessage } from '@stream-toolz/twitch';
import type { BotActionKind as ActionKind, BotLogEntry, BotOutcome as Outcome } from './api';
import { LIST_COMMAND, type Command, type Settings, type Who } from './settings';

/** Twitch's limit for a normal account is 20 messages per 30 seconds: 1.5 s between sends keeps the bot below it. */
export const MIN_SEND_GAP_MS = 1500;
/** More waiting answers than this are dropped: a burst of commands must not keep the bot talking for a minute. */
export const MAX_QUEUE = 20;
/** The UI shows the last actions; older ones are forgotten. */
export const LOG_SIZE = 50;
/** Twitch's limit for one message. */
const MAX_MESSAGE = 500;

export interface BotOptions {
  settings: () => Settings;
  /** Sends as the logged-in account; rejects when Twitch dropped the message. */
  send: (text: string, replyTo?: string) => Promise<void>;
  ownUserId: () => string | undefined;
  /** The channel's name for {channel}. */
  channel: () => string;
  /** The app's language: the built-in "!commands" answers in it. */
  language: () => 'de' | 'en';
  now?: () => number;
  /** Runs fn after ms and returns a cancel; the tests inject a fake clock. */
  schedule?: (fn: () => void, ms: number) => () => void;
  /** A command answered: its new count, to persist as `uses`. */
  onUses?: (commandId: string, uses: number) => void;
  /** The log or the queue changed. */
  onChange?: () => void;
}

interface Queued {
  text: string;
  replyTo?: string;
  entry: BotLogEntry;
}

const LIST_TEXTS = {
  de: { list: 'Befehle: ', none: 'Es gibt noch keine Befehle.' },
  en: { list: 'Commands: ', none: 'There are no commands yet.' },
};

export class Bot {
  /** Newest last. */
  readonly log: BotLogEntry[] = [];
  private readonly queue: Queued[] = [];
  private sending = false;
  private lastSentAt = -Infinity;
  private cancelTimer: (() => void) | undefined;
  private stopped = false;
  /** The global cooldown counts from the last command answer (timed messages are not answers). */
  private lastAnswerAt = -Infinity;
  private readonly commandUsedAt = new Map<string, number>();
  /** "<command id>\n<user id>" → when. */
  private readonly userUsedAt = new Map<string, number>();
  /** Counts since the app started, on top of the persisted `uses`; a save that did not land is not lost. */
  private readonly uses = new Map<string, number>();
  private readonly timers = new Map<string, { lastAt: number; messages: number }>();
  private counter = 0;
  /** Each entry's sequence number, so the log keeps the order of the decisions. */
  private readonly order = new WeakMap<BotLogEntry, number>();

  private readonly now: () => number;
  private readonly schedule: (fn: () => void, ms: number) => () => void;

  constructor(private readonly options: BotOptions) {
    this.now = options.now ?? Date.now;
    this.schedule =
      options.schedule ??
      ((fn, ms) => {
        const handle = setTimeout(fn, ms);
        return () => clearTimeout(handle);
      });
  }

  get queued(): number {
    return this.queue.length;
  }

  /** A chat message came in: maybe a command, in any case one more message for the timed messages. */
  onMessage(message: ChatMessage): void {
    if (this.stopped || message.fromOtherChannel || message.test) return;
    // The bot's own answers arrive as messages too: never answer them (an answer containing "!x" would loop).
    const own = this.options.ownUserId();
    if (own && message.userId === own) return;
    for (const state of this.timers.values()) state.messages++;

    const settings = this.options.settings();
    const text = message.text.trim();
    if (!text.startsWith(settings.prefix)) return;
    const [first = '', ...rest] = text.split(/\s+/);
    const word = first.slice(settings.prefix.length).toLowerCase();
    if (!word) return;
    const args = rest.join(' ');

    const command = findCommand(settings, word);
    if (command) this.answer(command, message, args, settings);
    else if (settings.listCommand && word === LIST_COMMAND) this.listCommands(message, settings);
  }

  /** Every 10 s from the module: timed messages that are due (and whose chat was busy enough) are queued. */
  tick(): void {
    if (this.stopped) return;
    const now = this.now();
    const settings = this.options.settings();
    const live = new Set(settings.timers.map((t) => t.id));
    for (const id of [...this.timers.keys()]) if (!live.has(id)) this.timers.delete(id);
    for (const timer of settings.timers) {
      let state = this.timers.get(timer.id);
      // A new timer (or one switched on again) counts from now, so it does not fire the moment it is added.
      if (!state || !timer.enabled) {
        state = { lastAt: now, messages: 0 };
        this.timers.set(timer.id, state);
        continue;
      }
      if (now - state.lastAt < timer.everyMinutes * 60_000) continue;
      if (state.messages < timer.minMessages) continue;
      state.lastAt = now;
      state.messages = 0;
      const text = render(timer.text, { user: '', channel: this.options.channel(), args: '', count: 0 });
      this.enqueue({ text, entry: this.entry('timer', '', '', 'sent', text) });
    }
  }

  /** The rendered answer, without sending: for the UI's preview. */
  preview(command: Command, user: string, args: string): string {
    return render(command.response, { user, channel: this.options.channel(), args, count: this.usesOf(command) + 1 });
  }

  /** Sends right away (through the queue), so the user can check the permission. */
  sendTest(text: string): void {
    if (this.stopped) return;
    const clean = text.replace(/\p{Cc}/gu, ' ').trim().slice(0, MAX_MESSAGE);
    if (!clean) return;
    this.enqueue({ text: clean, entry: this.entry('test', '', '', 'test', clean) });
  }

  resetUses(commandId: string): void {
    this.uses.delete(commandId);
  }

  /** Nothing waiting is sent any more (the module was switched off, the app closes). */
  stop(): void {
    this.stopped = true;
    this.queue.length = 0;
    this.cancelTimer?.();
    this.cancelTimer = undefined;
  }

  private answer(command: Command, message: ChatMessage, args: string, settings: Settings): void {
    const now = this.now();
    if (!allowed(command.who, message.roles)) {
      this.addLog(this.entry('command', command.trigger, message.name, 'role', message.text));
      return;
    }
    const userKey = `${command.id}\n${message.userId}`;
    const onCooldown =
      now - this.lastAnswerAt < settings.globalCooldownSeconds * 1000 ||
      now - (this.commandUsedAt.get(command.id) ?? -Infinity) < command.cooldownSeconds * 1000 ||
      now - (this.userUsedAt.get(userKey) ?? -Infinity) < command.userCooldownSeconds * 1000;
    if (onCooldown) {
      this.addLog(this.entry('command', command.trigger, message.name, 'cooldown', message.text));
      return;
    }
    const uses = this.usesOf(command) + 1;
    this.uses.set(command.id, uses);
    this.options.onUses?.(command.id, uses);
    this.lastAnswerAt = now;
    this.commandUsedAt.set(command.id, now);
    this.userUsedAt.set(userKey, now);
    const text = render(command.response, { user: message.name, channel: this.options.channel(), args, count: uses });
    this.enqueue({ text, replyTo: settings.replyInThread ? message.id : undefined, entry: this.entry('command', command.trigger, message.name, 'sent', text) });
  }

  /** "!commands": the enabled triggers (not the aliases), in the order of the list, cut when it gets too long. */
  private listCommands(message: ChatMessage, settings: Settings): void {
    const now = this.now();
    if (now - this.lastAnswerAt < settings.globalCooldownSeconds * 1000) {
      this.addLog(this.entry('command', LIST_COMMAND, message.name, 'cooldown', message.text));
      return;
    }
    const texts = LIST_TEXTS[this.options.language()];
    const triggers = settings.commands.filter((c) => c.enabled).map((c) => settings.prefix + c.trigger);
    let text = texts.none;
    if (triggers.length) {
      text = texts.list;
      for (const [i, trigger] of triggers.entries()) {
        const next = text + (i ? ', ' : '') + trigger;
        if (next.length > MAX_MESSAGE - 2) {
          text += ' …';
          break;
        }
        text = next;
      }
    }
    this.lastAnswerAt = now;
    this.enqueue({ text, replyTo: settings.replyInThread ? message.id : undefined, entry: this.entry('command', LIST_COMMAND, message.name, 'sent', text) });
  }

  private usesOf(command: Command): number {
    return this.uses.get(command.id) ?? command.uses;
  }

  private entry(kind: ActionKind, trigger: string, user: string, outcome: Outcome, text: string): BotLogEntry {
    const entry: BotLogEntry = { id: `b${++this.counter}`, at: this.now(), kind, trigger, user, outcome, text };
    this.order.set(entry, this.counter);
    return entry;
  }

  private enqueue(item: Queued): void {
    if (this.queue.length >= MAX_QUEUE) {
      item.entry.outcome = 'failed';
      item.entry.error = 'queue-full';
      this.addLog(item.entry);
      return;
    }
    this.queue.push(item);
    this.options.onChange?.();
    this.pump();
  }

  /** Sends the next waiting item once the gap since the last send has passed; one send at a time. */
  private pump(): void {
    if (this.sending || this.stopped || !this.queue.length) return;
    const wait = MIN_SEND_GAP_MS - (this.now() - this.lastSentAt);
    if (wait > 0) {
      this.cancelTimer ??= this.schedule(() => {
        this.cancelTimer = undefined;
        this.pump();
      }, wait);
      return;
    }
    const item = this.queue.shift()!;
    this.sending = true;
    this.options
      .send(item.text, item.replyTo)
      .then(
        () => this.addLog(item.entry),
        (err: unknown) => {
          item.entry.outcome = 'failed';
          item.entry.error = err instanceof Error ? err.message : String(err);
          this.addLog(item.entry);
        },
      )
      .finally(() => {
        this.sending = false;
        this.lastSentAt = this.now();
        this.pump();
      });
  }

  /** In the order of the decisions: an answer is logged once sent, a cooldown at once, so the sequence decides. */
  private addLog(entry: BotLogEntry): void {
    const seq = this.order.get(entry) ?? Infinity;
    let index = this.log.length;
    while (index > 0 && (this.order.get(this.log[index - 1]!) ?? 0) > seq) index--;
    this.log.splice(index, 0, entry);
    if (this.log.length > LOG_SIZE) this.log.splice(0, this.log.length - LOG_SIZE);
    this.options.onChange?.();
  }
}

/** The enabled command whose trigger or alias is the word (the first in the list wins). */
export function findCommand(settings: Settings, word: string): Command | undefined {
  return settings.commands.find((c) => c.enabled && (c.trigger === word || c.aliases.includes(word)));
}

/** The minimum role: mods include the broadcaster, vips include mods, subs include vips. */
export function allowed(who: Who, roles: ChatMessage['roles']): boolean {
  switch (who) {
    case 'everyone':
      return true;
    case 'subs':
      return roles.subscriber || roles.vip || roles.moderator || roles.broadcaster;
    case 'vips':
      return roles.vip || roles.moderator || roles.broadcaster;
    case 'mods':
      return roles.moderator || roles.broadcaster;
    case 'broadcaster':
      return roles.broadcaster;
  }
}

export interface Placeholders {
  user: string;
  channel: string;
  args: string;
  count: number;
}

/** The placeholders filled in (any case: "{User}" works too); an empty {args} leaves no double space behind. */
export function render(template: string, values: Placeholders): string {
  return template
    .replace(/\{(user|channel|args|count)\}/gi, (_, key: string) => String(values[key.toLowerCase() as keyof Placeholders]))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, MAX_MESSAGE);
}
