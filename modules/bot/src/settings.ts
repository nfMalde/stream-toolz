// Chat Bot's settings, with their defaults and the check that turns untrusted input (the UI, an old or hand-edited
// config.json) into complete, valid settings. No Node imports: the UI shares this file (its validation feedback
// uses the same limits and the same trigger check).

import { bool, clamp, oneOf } from '@stream-toolz/core/normalize';

/**
 * The minimum role that may use a command: mods include the broadcaster, vips include mods, subs include vips.
 * Stored as a single value per command (no checkbox per role) so the table and the form stay small.
 */
export type Who = 'everyone' | 'subs' | 'vips' | 'mods' | 'broadcaster';
export const WHO: readonly Who[] = ['everyone', 'subs', 'vips', 'mods', 'broadcaster'];

export interface Command {
  id: string;
  /** Lower case, without the prefix: "discord" answers "!discord". */
  trigger: string;
  /** {user} = the writer's display name, {channel}, {args} = the words after the trigger, {count} = uses so far. */
  response: string;
  /** Seconds between two answers of this command, for everyone. */
  cooldownSeconds: number;
  /** Seconds between two answers of this command to the same person. */
  userCooldownSeconds: number;
  who: Who;
  enabled: boolean;
  /** Other triggers for the same answer ("dc" for "discord"). */
  aliases: string[];
  /** How often the command answered; persisted so {count} survives a restart. */
  uses: number;
}

export interface TimedMessage {
  id: string;
  text: string;
  everyMinutes: number;
  /** Chat messages that must have come in since the last send (0 = always), so an empty chat is not spammed. */
  minMessages: number;
  enabled: boolean;
}

export interface Settings {
  commands: Command[];
  timers: TimedMessage[];
  /** At least this long between two answers of the bot (seconds). */
  globalCooldownSeconds: number;
  /** Fixed for now: "!" (the user, 2026-10-30: the usual Twitch prefix; others can come later). */
  prefix: '!';
  /** Answer as a Twitch reply to the message (in its thread), else as a plain message. */
  replyInThread: boolean;
  /** The built-in "!commands", which lists the enabled triggers. */
  listCommand: boolean;
}

/** The limits, shared with the UI's forms. Response: Twitch allows 500 characters; 450 leaves room for the placeholders. */
export const BOT_LIMITS = {
  commands: 200,
  timers: 50,
  aliases: 5,
  trigger: 32,
  response: 450,
  cooldown: 3600,
  globalCooldown: 60,
  everyMinutes: 180,
  minMessages: 100,
} as const;
/** The trigger as the chat types it: lower case letters (German ones too), digits, "_" and "-". */
export const TRIGGER_PATTERN = /^[a-z0-9_äöüß-]{1,32}$/;
/** The built-in command that lists the others (its trigger cannot be given to a command of the user's). */
export const LIST_COMMAND = 'commands';

const ID_PATTERN = /^[\w-]{1,64}$/;

export const PREFIX = '!';

export const DEFAULT_SETTINGS: Settings = {
  commands: [],
  timers: [],
  globalCooldownSeconds: 2,
  prefix: PREFIX,
  replyInThread: true,
  listCommand: true,
};

/** Defaults for a first start (locale: the system's, e.g. "de-DE"). */
export function defaultSettings(_locale: string): Settings {
  return { ...DEFAULT_SETTINGS };
}

/** A trigger as the user typed it: trimmed, lower case, without a leading prefix ("!Discord " → "discord"). */
export function cleanTrigger(value: string): string {
  const v = value.trim().toLowerCase();
  return v.startsWith(PREFIX) ? v.slice(PREFIX.length).trim() : v;
}

export function isValidTrigger(value: string): boolean {
  return TRIGGER_PATTERN.test(value) && value !== LIST_COMMAND;
}

/** One line of chat text: control characters removed, trimmed, at most max characters; '' when nothing is left. */
export function cleanText(value: unknown, max: number): string {
  if (typeof value !== 'string') return '';
  return value.replace(/\p{Cc}/gu, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
}

/** A fresh id for a new command or timer (the UI makes them; normalize gives one to entries that lack it). */
export function newId(): string {
  return globalThis.crypto.randomUUID();
}

/** The fields of T as given, each still unchecked. */
const obj = <T extends object>(value: unknown): Partial<Record<keyof T, unknown>> => (value && typeof value === 'object' && !Array.isArray(value) ? (value as Partial<Record<keyof T, unknown>>) : {});

function id(value: unknown): string {
  return typeof value === 'string' && ID_PATTERN.test(value) ? value : newId();
}

/**
 * The commands, each checked; a command whose trigger is invalid is dropped, as is one whose trigger or alias
 * another command already has (the first keeps it). Base is not merged entry by entry: the UI always sends the
 * whole list, and a hand-edited file is taken as it is.
 */
function commands(value: unknown, base: Command[]): Command[] {
  if (!Array.isArray(value)) return base;
  const result: Command[] = [];
  const taken = new Set<string>();
  for (const item of value.slice(0, BOT_LIMITS.commands)) {
    const v = obj<Command>(item);
    const trigger = typeof v.trigger === 'string' ? cleanTrigger(v.trigger) : '';
    const response = cleanText(v.response, BOT_LIMITS.response);
    if (!isValidTrigger(trigger) || !response || taken.has(trigger)) continue;
    const aliases: string[] = [];
    for (const alias of Array.isArray(v.aliases) ? v.aliases : []) {
      if (typeof alias !== 'string' || aliases.length >= BOT_LIMITS.aliases) continue;
      const a = cleanTrigger(alias);
      if (a === trigger || !isValidTrigger(a) || taken.has(a) || aliases.includes(a)) continue;
      aliases.push(a);
    }
    taken.add(trigger);
    for (const a of aliases) taken.add(a);
    result.push({
      id: id(v.id),
      trigger,
      response,
      cooldownSeconds: clamp(v.cooldownSeconds, 0, BOT_LIMITS.cooldown, 0, 1),
      userCooldownSeconds: clamp(v.userCooldownSeconds, 0, BOT_LIMITS.cooldown, 0, 1),
      who: oneOf(v.who, WHO, 'everyone'),
      enabled: bool(v.enabled, true),
      aliases,
      uses: clamp(v.uses, 0, Number.MAX_SAFE_INTEGER, 0, 1),
    });
  }
  return result;
}

function timers(value: unknown, base: TimedMessage[]): TimedMessage[] {
  if (!Array.isArray(value)) return base;
  const result: TimedMessage[] = [];
  for (const item of value.slice(0, BOT_LIMITS.timers)) {
    const v = obj<TimedMessage>(item);
    const text = cleanText(v.text, BOT_LIMITS.response);
    if (!text) continue;
    result.push({
      id: id(v.id),
      text,
      everyMinutes: clamp(v.everyMinutes, 1, BOT_LIMITS.everyMinutes, 15, 1),
      minMessages: clamp(v.minMessages, 0, BOT_LIMITS.minMessages, 0, 1),
      enabled: bool(v.enabled, true),
    });
  }
  return result;
}

/** Complete, valid settings: what is missing or invalid keeps its value from base. */
export function normalizeSettings(value: unknown, base: Settings = DEFAULT_SETTINGS): Settings {
  const v = obj<Settings>(value);
  return {
    commands: commands(v.commands, base.commands),
    timers: timers(v.timers, base.timers),
    globalCooldownSeconds: clamp(v.globalCooldownSeconds, 0, BOT_LIMITS.globalCooldown, base.globalCooldownSeconds, 1),
    prefix: PREFIX,
    replyInThread: bool(v.replyInThread, base.replyInThread),
    listCommand: bool(v.listCommand, base.listCommand),
  };
}
