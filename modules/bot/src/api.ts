// The Chat Bot part of the contract between the UI and the main process (window.stz.bot): its settings, the bot's
// status with its last actions, a preview and a test send. Types only (plus a few constants), so the UI can import
// it without Node code. Everything is exported with "Bot" in the name: @stz/api merges every module's api.

import type { FeatureState } from '@stream-toolz/twitch/api';
import type { ModuleSettingsApi, Unsubscribe } from '@stream-toolz/core/api';
import type { Settings } from './settings';

/** The module's id: its key in config.json, its IPC namespace, window.stz.bot. */
export const BOT = 'bot';

export type { Settings as BotSettings, Command as BotCommand, TimedMessage as BotTimedMessage, Who as BotWho } from './settings';
/** Pure checks and limits the UI shares with the main process (these files have no Node imports). */
export { cleanTrigger as cleanBotTrigger, isValidTrigger as isValidBotTrigger, newId as newBotId, BOT_LIMITS, LIST_COMMAND as BOT_LIST_COMMAND, PREFIX as BOT_PREFIX, WHO as BOT_WHO } from './settings';

export type BotOutcome = 'sent' | 'cooldown' | 'role' | 'failed' | 'test';
export type BotActionKind = 'command' | 'timer' | 'test';

/** One action of the bot, for the UI's log (never for the technical log: it holds chat text and names). */
export interface BotLogEntry {
  id: string;
  at: number;
  kind: BotActionKind;
  /** The command's trigger (its own, also when an alias was typed); '' for a timer or a test. */
  trigger: string;
  /** The writer's display name; '' for a timer or a test. */
  user: string;
  outcome: BotOutcome;
  /** The answer; for 'cooldown' and 'role' the message that asked. */
  text: string;
  /** Twitch's reason when the send failed. */
  error?: string;
}

export interface BotStatus {
  /** The last actions, newest last. */
  log: BotLogEntry[];
  connected: boolean;
  /** The chatWrite feature as the last Twitch status reported it; undefined before the first status. */
  canWrite: FeatureState | undefined;
  /** Answers waiting to be sent. */
  queued: number;
}

export interface BotApi extends ModuleSettingsApi<Settings> {
  status(): Promise<BotStatus>;
  onStatus(listener: (status: BotStatus) => void): Unsubscribe;
  /** The command's answer as it would look, for a sample user with these words after the trigger. */
  preview(commandId: string, sampleArgs: string): Promise<string>;
  /** Sends a message right away, so the user can check the permission; logged as a test. */
  sendTest(text: string): Promise<void>;
  /** {count} starts at zero again. */
  resetUses(commandId: string): Promise<void>;
}
